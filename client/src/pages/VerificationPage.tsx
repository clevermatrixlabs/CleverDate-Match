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
import {
  loadFaceModels,
  runLivenessCheck,
  type LivenessProgress,
} from '@/lib/faceVerification';
import { getDeviceId } from '@/lib/deviceFingerprint';

type Step = 'intro' | 'loading-models' | 'live-scan' | 'phone' | 'submitting' | 'done' | 'suspended' | 'banned';

const STEPS = [
  { label: 'Selfie', icon: Camera },
  { label: 'Phone', icon: Phone },
  { label: 'Done', icon: CheckCircle2 },
];

export default function VerificationPage() {
  const [step, setStep]                 = useState<Step>('intro');
  const [modelLoadMsg, setModelLoadMsg] = useState('Preparing camera...');
  const [liveness, setLiveness]         = useState<LivenessProgress>({
    faceDetected: false, smiled: false, turned: false, message: 'Starting...', percent: 0,
  });
  const [selfieResult, setSelfieResult] = useState<{ descriptor: number[]; snapshotDataUrl: string } | null>(null);
  const [phone, setPhone]               = useState('');
  const [otp, setOtp]                   = useState('');
  const [otpSent, setOtpSent]           = useState(false);
  const [devOtp, setDevOtp]             = useState('');
  const [otpLoading, setOtpLoading]     = useState(false);
  const [otpVerified, setOtpVerified]   = useState(false);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef  = useRef<AbortController | null>(null);

  const [, navigate]  = useLocation();
  const { user }      = useAuth();
  const { toast }     = useToast();

  // Admin skip
  useEffect(() => {
    if (user && (user as any).isAdmin) navigate('/app/');
  }, [user, navigate]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // If user already has phone registered + verified, skip phone step
  const phoneAlreadyVerified = !!((user as any)?.isPhoneVerified) || !!((user as any)?.phone);

  // ── Verification submit mutation ──────────────────────────────────────────
  const verifyMutation = useMutation({
    mutationFn: async (payload: any) => apiRequest('POST', '/verification', payload),
    onSuccess: async (data: any) => {
      if (data?.status === 'pending_review') {
        setStep('suspended');
        return;
      }
      if (data?.banned) {
        setStep('banned');
        return;
      }
      toast({ title: 'Verified! 🎉', description: 'Welcome to Clever Date Match.' });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setStep('done');
      setTimeout(() => navigate('/app/'), 1400);
    },
    onError: (error: Error) => {
      const msg = error.message || '';
      if (msg.includes('banned') || msg.includes('device')) {
        setStep('banned');
        return;
      }
      if (msg.includes('suspended') || msg.includes('review')) {
        setStep('suspended');
        return;
      }
      toast({ variant: 'destructive', title: 'Verification failed', description: msg });
      setStep('intro');
      setSelfieResult(null);
    },
  });

  // ── Start camera + liveness check ────────────────────────────────────────
  const startSelfie = async () => {
    setStep('loading-models');
    setModelLoadMsg('Loading face AI (first time may take 30 s)...');
    try {
      await loadFaceModels((label) => setModelLoadMsg(label));
    } catch {
      toast({ variant: 'destructive', title: 'Could not load face AI', description: 'Check your internet connection and try again.' });
      setStep('intro');
      return;
    }

    setModelLoadMsg('Starting camera...');
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
    setStep('live-scan');

    setTimeout(async () => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
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
        // Move to phone step (or skip if already verified)
        if (phoneAlreadyVerified) {
          submitVerification(result.descriptor, result.snapshotDataUrl, true);
        } else {
          setStep('phone');
        }
      } catch (e: any) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        toast({ variant: 'destructive', title: 'Selfie check failed', description: e?.message || 'Please try again.' });
        setStep('intro');
      }
    }, 100);
  };

  // ── Send OTP ──────────────────────────────────────────────────────────────
  const sendOtp = async () => {
    if (!phone || phone.length < 8) {
      toast({ variant: 'destructive', title: 'Enter your phone number', description: 'Include country code e.g. +1234567890' });
      return;
    }
    setOtpLoading(true);
    try {
      const res = await apiRequest('POST', '/auth/send-otp', { phone }) as any;
      setOtpSent(true);
      if (res?.otp) setDevOtp(res.otp);
      toast({ title: 'Code sent', description: `A 6-digit code was sent to ${phone}` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to send OTP', description: e.message });
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Verify OTP ────────────────────────────────────────────────────────────
  const verifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      toast({ variant: 'destructive', title: 'Enter the 6-digit code' });
      return;
    }
    setOtpLoading(true);
    try {
      await apiRequest('POST', '/auth/verify-otp', { phone, otp });
      setOtpVerified(true);
      toast({ title: 'Phone verified ✓' });
      if (selfieResult) {
        submitVerification(selfieResult.descriptor, selfieResult.snapshotDataUrl, true);
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Invalid code', description: e.message });
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Final submit ──────────────────────────────────────────────────────────
  const submitVerification = (descriptor: number[], selfieDataUrl: string, phoneVerified: boolean) => {
    setStep('submitting');
    verifyMutation.mutate({
      selfieDescriptor: descriptor,
      verificationData: selfieDataUrl.split(',')[1],
      deviceId: getDeviceId(),
      phoneVerified,
    });
  };

  // Current "progress step" for the stepper
  const progressStep = step === 'intro' || step === 'loading-models' || step === 'live-scan' ? 0
    : step === 'phone' ? 1
    : 2;

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
                i < progressStep ? 'bg-green-500 border-green-500' :
                i === progressStep ? 'border-amber-400 bg-amber-400/20' : 'border-white/20 bg-white/5'
              }`}>
                {i < progressStep
                  ? <CheckCircle2 className="w-5 h-5 text-white" />
                  : <s.icon className={`w-4 h-4 ${i === progressStep ? 'text-amber-400' : 'text-white/30'}`} />
                }
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
                Face scan runs entirely on your device. Nothing is shared.
              </p>
            </div>
          )}

          {/* ── LOADING MODELS ── */}
          {step === 'loading-models' && (
            <div className="flex flex-col gap-6 items-center py-10">
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
                <RefreshCw className="text-blue-600 w-10 h-10 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-gray-700 font-medium">{modelLoadMsg}</p>
                <p className="text-xs text-gray-400 mt-2">First-time setup — takes 15–30 s, instant after</p>
              </div>
            </div>
          )}

          {/* ── LIVE SCAN ── */}
          {step === 'live-scan' && (
            <div className="flex flex-col gap-5 items-center">
              {/* Camera circle */}
              <div className="relative">
                <div className={`absolute inset-0 rounded-full transition-all duration-300 ${
                  liveness.percent === 100 ? 'border-4 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.5)]' :
                  liveness.faceDetected ? 'border-4 border-blue-400 animate-pulse' :
                  'border-4 border-dashed border-gray-300'
                }`} />
                <video
                  autoPlay playsInline muted ref={videoRef}
                  className="w-64 h-64 rounded-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
              </div>

              {/* Instruction card */}
              <div className={`w-full rounded-2xl p-4 text-center transition-colors ${
                !liveness.faceDetected ? 'bg-gray-50 border border-gray-200' :
                !liveness.smiled ? 'bg-amber-50 border border-amber-200' :
                !liveness.turned ? 'bg-blue-50 border border-blue-200' :
                'bg-green-50 border border-green-200'
              }`}>
                <p className="font-semibold text-gray-800 text-base">{liveness.message}</p>
                <div className="flex justify-center gap-5 mt-3">
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${liveness.smiled ? 'text-green-600' : 'text-gray-400'}`}>
                    <SmilePlus className="w-4 h-4" />
                    Smile
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${liveness.turned ? 'text-green-600' : 'text-gray-400'}`}>
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
              {/* Selfie preview */}
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
                <h2 className="text-xl font-bold text-gray-800">Selfie done! ✓</h2>
                <p className="text-gray-500 text-sm mt-1">Now enter your phone number so we can send a verification code.</p>
              </div>

              {devOtp && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-amber-700 font-medium">Dev mode</p>
                  <p className="text-sm text-amber-800 font-bold">OTP: {devOtp}</p>
                </div>
              )}

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
                  <p className="text-sm text-gray-600 text-center">Enter the 6-digit code sent to {phone}</p>
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
                    onClick={() => { setOtpSent(false); setOtp(''); setDevOtp(''); }}
                  >
                    Use a different number
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
              <p className="text-center text-gray-700 font-medium">Finalising your verification...</p>
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
              <p className="text-gray-500 text-sm text-center">Taking you to the app...</p>
            </div>
          )}

          {/* ── PENDING REVIEW (suspended) ── */}
          {step === 'suspended' && (
            <div className="flex flex-col gap-5 items-center py-8">
              <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
                <Shield className="text-amber-500 w-10 h-10" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 text-center">Under Review</h2>
              <p className="text-gray-500 text-sm text-center leading-relaxed max-w-xs">
                Your account is currently under manual review by our team. You'll receive an email once it's approved (usually within 24 hours).
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 w-full text-sm text-amber-700 text-center">
                If you believe this is a mistake, contact support at <strong>support@cleverdatematch.app</strong>
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
                This account has been blocked due to a policy violation. If you believe this is an error, contact support.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
