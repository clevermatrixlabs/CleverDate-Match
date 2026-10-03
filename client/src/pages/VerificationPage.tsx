import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Shield, Camera, CheckCircle2, Phone, RefreshCw, SmilePlus } from 'lucide-react';
import { runLivenessCheck, type LivenessProgress } from '@/lib/faceVerification';
import { getDeviceId } from '@/lib/deviceFingerprint';
import {
  auth,
  createFirebasePhoneChallenge,
  confirmFirebasePhoneCode,
  isFirebaseConfigured,
  normalizePhoneNumber,
  toFriendlyAuthError,
} from '@/lib/firebase';
import type { ConfirmationResult, User as FirebaseUser } from 'firebase/auth';

type Step = 'intro' | 'live-scan' | 'phone' | 'submitting' | 'done' | 'suspended' | 'banned';

const STEPS = [
  { label: 'Selfie', icon: Camera },
  { label: 'Phone',  icon: Phone },
  { label: 'Done',   icon: CheckCircle2 },
];

export default function VerificationPage() {
  const [step, setStep]       = useState<Step>('intro');
  const [liveness, setLiveness] = useState<LivenessProgress>({
    step: 'centering', message: 'Starting…', percent: 0,
  });
  const [selfieResult, setSelfieResult] = useState<{ snapshotDataUrl: string } | null>(null);
  const [phone, setPhone]       = useState('');
  const [otp, setOtp]           = useState('');
  const [otpSent, setOtpSent]   = useState(false);
  const [phoneConfirmation, setPhoneConfirmation] = useState<ConfirmationResult | null>(null);
  const [confirmedPhoneUser, setConfirmedPhoneUser] = useState<FirebaseUser | null>(null);
  const [otpLoading, setOtpLoading]   = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef  = useRef<AbortController | null>(null);
  const phoneRecaptchaCleanup = useRef<(() => void) | null>(null);

  const [, navigate] = useLocation();
  const { user }     = useAuth();
  const { toast }    = useToast();

  // Admin users skip verification entirely
  useEffect(() => {
    if (user && (user as any).isAdmin) navigate('/app/');
  }, [user, navigate]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      phoneRecaptchaCleanup.current?.();
      phoneRecaptchaCleanup.current = null;
    };
  }, []);

  const phoneAlreadyVerified = !!(user as any)?.isPhoneVerified;

  // ── Verification submit mutation ────────────────────────────────────────────
  const verifyMutation = useMutation({
    mutationFn: async (payload: any) => apiRequest('POST', '/verification', payload),
    onSuccess: async (data: any) => {
      if (data?.status === 'pending_review') { setStep('suspended'); return; }
      if (data?.banned)                      { setStep('banned');    return; }
      toast({ title: 'Verified! 🎉', description: 'Welcome to Clever Date Match.' });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      phoneRecaptchaCleanup.current?.();
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setStep('done');
      setTimeout(() => navigate('/app/'), 1400);
    },
    onError: (error: Error) => {
      const msg = error.message || '';
      if (msg.includes('banned') || msg.includes('device')) { setStep('banned');    return; }
      if (msg.includes('suspended') || msg.includes('review')) { setStep('suspended'); return; }
      toast({
        variant: 'destructive',
        title: 'Verification failed',
        description: toFriendlyAuthError(error, 'We could not complete your verification. Please try again.').message,
      });
      setStep('intro');
      setSelfieResult(null);
    },
  });

  // ── Start camera + liveness ─────────────────────────────────────────────────
  const startSelfie = async () => {
    setStep('live-scan');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch {
      toast({ variant: 'destructive', title: 'Camera access denied', description: 'Please allow camera access and try again.' });
      setStep('intro');
      return;
    }
    streamRef.current = stream;

    // Attach stream to video element after React renders it
    setTimeout(async () => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch { /* autoplay may fail silently */ }
      }
      abortRef.current = new AbortController();
      try {
        const result = await runLivenessCheck(
          videoRef.current!,
          (p) => setLiveness(p),
          abortRef.current.signal,
        );
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setSelfieResult(result);
        if (phoneAlreadyVerified) {
          submitVerification(result.snapshotDataUrl);
        } else {
          setStep('phone');
        }
      } catch (e: any) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        toast({ variant: 'destructive', title: 'Selfie check failed', description: e?.message || 'Please try again.' });
        setStep('intro');
      }
    }, 120);
  };

  // ── OTP helpers ─────────────────────────────────────────────────────────────
  const sendOtp = async () => {
    const normalizedPhone = normalizePhoneNumber(phone, (user as any)?.country);
    if (!/^\+[1-9]\d{6,14}$/.test(normalizedPhone)) {
      toast({ variant: 'destructive', title: 'Enter your phone number', description: "That phone number doesn't look right — please check the number and try again." });
      return;
    }
    setPhone(normalizedPhone);
    setOtpLoading(true);
    try {
      if (!isFirebaseConfigured()) throw new Error('Phone verification is not available right now. Please try again later.');
      phoneRecaptchaCleanup.current?.();
      phoneRecaptchaCleanup.current = null;
      setPhoneConfirmation(null);
      setConfirmedPhoneUser(null);
      setOtpSent(false);
      setOtp('');
      const currentFirebaseUser = auth?.currentUser;
      const currentFirebaseEmail = currentFirebaseUser?.email?.toLowerCase();
      const appEmail = (user as any)?.email?.toLowerCase();
      const linkToCurrentUser = !!currentFirebaseUser && !!appEmail && currentFirebaseEmail === appEmail;
      if (linkToCurrentUser && currentFirebaseUser?.phoneNumber === normalizedPhone) {
        await apiRequest('POST', '/auth/firebase/phone-verified', {
          idToken: await currentFirebaseUser.getIdToken(true),
          phone: normalizedPhone,
        }) as any;
        setOtpVerified(true);
        toast({ title: 'Phone already verified', description: 'Your verified Firebase number has been linked to this account.' });
        if (selfieResult) submitVerification(selfieResult.snapshotDataUrl);
        return;
      }
      const challenge = createFirebasePhoneChallenge(
        normalizedPhone,
        'firebase-recaptcha-verification',
        linkToCurrentUser ? 'link' : 'sign-in',
      );
      phoneRecaptchaCleanup.current = challenge.cleanup;
      const confirmation = await challenge.confirmation;
      setPhoneConfirmation(confirmation);
      setOtpSent(true);
      toast({ title: 'SMS request accepted', description: `Check ${normalizedPhone}. Delivery may take a minute.` });
    } catch (e: any) {
      phoneRecaptchaCleanup.current?.();
      phoneRecaptchaCleanup.current = null;
      toast({ variant: 'destructive', title: 'Could not send your code', description: toFriendlyAuthError(e, 'Something went wrong sending your code — please try again.').message });
    } finally { setOtpLoading(false); }
  };

  const verifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      toast({ variant: 'destructive', title: 'Enter the 6-digit code' });
      return;
    }
    setOtpLoading(true);
    let codeAccepted = !!confirmedPhoneUser;
    try {
      let firebaseUser = confirmedPhoneUser;
      if (!firebaseUser) {
        if (!phoneConfirmation) throw new Error('Your SMS session expired. Please request a new code.');
        firebaseUser = await confirmFirebasePhoneCode(phoneConfirmation, otp);
        codeAccepted = true;
        setConfirmedPhoneUser(firebaseUser);
        setPhoneConfirmation(null);
      }
      await apiRequest('POST', '/auth/firebase/phone-verified', {
        idToken: await firebaseUser.getIdToken(true),
        phone,
      }) as any;
      setOtpVerified(true);
      setPhoneConfirmation(null);
      setConfirmedPhoneUser(null);
      phoneRecaptchaCleanup.current?.();
      toast({ title: 'Phone verified ✓' });
      if (selfieResult) submitVerification(selfieResult.snapshotDataUrl);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: codeAccepted ? 'Code accepted; phone update failed' : 'That code did not work',
        description: toFriendlyAuthError(
          e,
          codeAccepted
            ? 'Your code was accepted, but the app could not save the verified number. Press Confirm Code to retry.'
            : 'That code is not correct. Please check it and try again.',
        ).message,
      });
    } finally { setOtpLoading(false); }
  };

  const resendOtp = () => {
    phoneRecaptchaCleanup.current?.();
    phoneRecaptchaCleanup.current = null;
    setPhoneConfirmation(null);
    setConfirmedPhoneUser(null);
    setOtpSent(false);
    setOtp('');
    void sendOtp();
  };

  // ── Final submit ─────────────────────────────────────────────────────────────
  const submitVerification = (selfieDataUrl: string) => {
    setStep('submitting');
    verifyMutation.mutate({
      selfieBase64: selfieDataUrl,
      deviceId: getDeviceId(),
    });
  };

  // Progress step for stepper
  const progressStep =
    step === 'intro' || step === 'live-scan' ? 0
    : step === 'phone' ? 1
    : 2;

  // Liveness step → visual cues
  const liveBorderClass =
    liveness.step === 'done' || liveness.step === 'capturing'
      ? 'border-4 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.5)]'
      : liveness.step === 'smile' || liveness.step === 'turn'
        ? 'border-4 border-blue-400 animate-pulse'
        : 'border-4 border-dashed border-gray-300';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #040810 0%, #0a0f2e 100%)' }}>
      {/* Header */}
      <div className="flex-none px-6 pt-12 pb-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3 border border-white/20">
          <Shield className="text-amber-400 w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white">Identity Verification</h1>
        <p className="text-white/50 text-sm mt-1">Quick • Secure • Private</p>
      </div>

      {/* Step indicator */}
      {!['suspended', 'banned', 'done'].includes(step) && (
        <div className="flex justify-center gap-6 mb-6 px-6">
          {STEPS.map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                i < progressStep  ? 'bg-green-500 border-green-500' :
                i === progressStep ? 'border-amber-400 bg-amber-400/20' : 'border-white/20 bg-white/5'
              }`}>
                {i < progressStep
                  ? <CheckCircle2 className="w-5 h-5 text-white" />
                  : <s.icon className={`w-4 h-4 ${i === progressStep ? 'text-amber-400' : 'text-white/30'}`} />}
              </div>
              <span className={`text-xs font-medium ${i === progressStep ? 'text-amber-400' : 'text-white/30'}`}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content card */}
      <div className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl overflow-y-auto">
        <div className="max-w-md mx-auto">

          {/* ── INTRO ── */}
          {step === 'intro' && (
            <div className="flex flex-col gap-6">
              <div className="w-28 h-28 rounded-full bg-blue-50 border-2 border-dashed border-blue-200 flex items-center justify-center mx-auto">
                <Camera className="text-blue-500 w-14 h-14" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Let's verify you're real</h2>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Two quick steps — take a live selfie, then confirm your phone number. No ID documents needed. Takes under 2 minutes.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { emoji: '😄', label: 'Quick smile check' },
                  { emoji: '🔒', label: 'Fully private' },
                  { emoji: '📱', label: 'Phone confirmed' },
                ].map((f, i) => (
                  <div key={i} className="flex flex-col items-center text-center p-3 rounded-2xl bg-blue-50 gap-2">
                    <span className="text-2xl">{f.emoji}</span>
                    <span className="text-xs text-gray-600 font-medium leading-tight">{f.label}</span>
                  </div>
                ))}
              </div>
              <Button
                className="w-full h-14 text-base font-semibold rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }}
                onClick={startSelfie}
              >
                Start Verification
              </Button>
              <p className="text-center text-xs text-gray-400">
                Your selfie is sent securely to our servers for identity verification. Nothing is shared publicly.
              </p>
            </div>
          )}

          {/* ── LIVE SCAN ── */}
          {step === 'live-scan' && (
            <div className="flex flex-col gap-5 items-center">
              {/* Camera circle */}
              <div className="relative">
                <div className={`absolute inset-0 rounded-full transition-all duration-300 ${liveBorderClass}`} />
                <video
                  autoPlay playsInline muted ref={videoRef}
                  className="w-64 h-64 rounded-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
              </div>

              {/* Instruction card */}
              <div className={`w-full rounded-2xl p-4 text-center transition-colors ${
                liveness.step === 'centering'  ? 'bg-gray-50 border border-gray-200' :
                liveness.step === 'smile'      ? 'bg-amber-50 border border-amber-200' :
                liveness.step === 'turn'       ? 'bg-blue-50 border border-blue-200' :
                'bg-green-50 border border-green-200'
              }`}>
                <p className="font-semibold text-gray-800 text-base">{liveness.message}</p>
                <div className="flex justify-center gap-5 mt-3">
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${
                    liveness.step === 'smile' || liveness.step === 'turn' || liveness.step === 'capturing' || liveness.step === 'done'
                      ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    <SmilePlus className="w-4 h-4" />
                    Smile
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${
                    liveness.step === 'turn' || liveness.step === 'capturing' || liveness.step === 'done'
                      ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    <span>↔</span> Head turn
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full">
                <Progress value={liveness.percent} className="h-2.5 rounded-full" />
                <p className="text-center text-xs text-gray-400 mt-1">{liveness.percent}%</p>
              </div>
            </div>
          )}

          {/* ── PHONE STEP ── */}
          {step === 'phone' && (
            <div className="flex flex-col gap-5">
              {selfieResult && (
                <div className="flex justify-center">
                  <div className="relative">
                    <img
                      src={selfieResult.snapshotDataUrl}
                      alt="Your selfie"
                      className="w-20 h-20 rounded-full object-cover border-4 border-green-400 shadow-lg"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-green-500 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
              )}
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-800">Selfie captured! ✓</h2>
                <p className="text-gray-500 text-sm mt-1">Now confirm your phone number.</p>
              </div>

              <div className="flex gap-2">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  placeholder="+1 234 567 8900"
                  className="flex-1 h-12 rounded-xl"
                  disabled={otpSent || otpLoading}
                />
                <Button
                  onClick={sendOtp}
                  disabled={otpSent || otpLoading || !phone}
                  className="h-12 px-4 rounded-xl text-sm"
                  style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }}
                >
                  {otpLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : otpSent ? 'Sent ✓' : 'Send code'}
                </Button>
              </div>

              {otpSent && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-gray-600 text-center">Enter the 6-digit code for {phone}. If it does not arrive, tap Resend code.</p>
                  <Input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="0 0 0 0 0 0"
                    className="h-14 text-center text-3xl tracking-[0.5em] rounded-xl"
                    autoComplete="one-time-code"
                  />
                  <Button
                    onClick={verifyOtp}
                    disabled={otp.length !== 6 || otpLoading || otpVerified}
                    className="w-full h-14 text-base font-semibold rounded-2xl"
                    style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }}
                  >
                    {otpLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Confirm Code'}
                  </Button>
                  <button
                    className="text-xs text-blue-600 text-center underline"
                    onClick={() => { setOtpSent(false); setOtp(''); setPhoneConfirmation(null); setConfirmedPhoneUser(null); phoneRecaptchaCleanup.current?.(); phoneRecaptchaCleanup.current = null; }}
                  >
                    Use a different number
                  </button>
                  <button
                    type="button"
                    className="text-xs text-blue-600 text-center underline"
                    onClick={resendOtp}
                    disabled={otpLoading}
                  >
                    Resend code
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── SUBMITTING ── */}
          {step === 'submitting' && (
            <div className="flex flex-col gap-5 items-center py-12">
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
                <RefreshCw className="text-blue-600 w-10 h-10 animate-spin" />
              </div>
              <p className="text-center text-gray-700 font-medium">Verifying your identity…</p>
              <p className="text-center text-xs text-gray-400">Running security checks — just a moment</p>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="flex flex-col gap-5 items-center py-12">
              <div className="w-24 h-24 rounded-full bg-green-50 flex items-center justify-center">
                <CheckCircle2 className="text-green-500 w-14 h-14" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">You're verified!</h2>
              <p className="text-gray-500 text-sm text-center">Taking you to the app…</p>
            </div>
          )}

          {/* ── PENDING REVIEW ── */}
          {step === 'suspended' && (
            <div className="flex flex-col gap-5 items-center py-8">
              <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
                <Shield className="text-amber-500 w-10 h-10" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 text-center">Under Review</h2>
              <p className="text-gray-500 text-sm text-center leading-relaxed max-w-xs">
                Your account is under manual review by our team. You'll receive an email once approved (usually within 24 hours).
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 w-full text-sm text-amber-700 text-center">
                Questions? Email <strong>support@cleverdatematch.app</strong>
              </div>
            </div>
          )}

          {/* ── BANNED ── */}
          {step === 'banned' && (
            <div className="flex flex-col gap-5 items-center py-8">
              <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
                <Shield className="text-red-500 w-10 h-10" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 text-center">Account Blocked</h2>
              <p className="text-gray-500 text-sm text-center leading-relaxed max-w-xs">
                This account has been blocked due to a policy violation. Contact support if you believe this is an error.
              </p>
            </div>
          )}

        </div>
      </div>
      {/* Keep this attached to the DOM: Firebase uses it for the invisible reCAPTCHA challenge. */}
      <div id="firebase-recaptcha-verification" className="fixed left-0 top-0 h-px w-px overflow-hidden" aria-hidden="true" />
    </div>
  );
}
