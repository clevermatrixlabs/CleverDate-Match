import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Shield, Camera, CheckCircle2, RefreshCw, Zap } from 'lucide-react';
import { type LivenessResult } from '@/lib/faceVerification';
import { LivenessDetection } from '@/components/LivenessDetection';
import { getDeviceId } from '@/lib/deviceFingerprint';
import { useAuth } from '@/context/AuthContext';

type Step = 'intro' | 'live-scan' | 'submitting' | 'done' | 'pending_review' | 'suspended' | 'banned';

const STEPS = [
  { label: 'Live Biometrics', icon: Camera },
  { label: 'Verified',        icon: CheckCircle2 },
];

export default function VerificationPage() {
  const [step, setStep] = useState<Step>('intro');
  const [selfieResult, setSelfieResult] = useState<LivenessResult | null>(null);

  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user && (user as any).isAdmin) navigate('/app/');
  }, [user, navigate]);

  // ── Verification Mutation ────────────────────────────────────────────────────
  const verifyMutation = useMutation({
    mutationFn: async (payload: any) => apiRequest('POST', '/verification', payload),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      if (data?.status === 'pending_review') {
        setStep('pending_review');
      } else {
        setStep('done');
        setTimeout(() => navigate('/app/'), 1800);
      }
    },
    onError: (err: any) => {
      if (err?.banned) {
        setStep('banned');
      } else {
        toast({
          variant: 'destructive',
          title: 'Verification failed',
          description: err?.message || 'Could not complete identity verification. Please try again.',
        });
        setStep('intro');
      }
    },
  });

  const startSelfie = () => {
    setStep('live-scan');
  };

  const submitVerification = (result: LivenessResult) => {
    setStep('submitting');
    let clientEmail = user?.email;
    let clientUserId = user?.id;
    if (!clientEmail || !clientUserId) {
      try {
        const stored = localStorage.getItem('cleverdate_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.email) clientEmail = parsed.email;
          if (parsed?.id) clientUserId = parsed.id;
        }
      } catch {}
    }
    if (!clientEmail) {
      toast({
        title: "Authentication Required",
        description: "Please log in or register before submitting identity verification.",
        variant: "destructive",
      });
      setStep('intro');
      return;
    }

    verifyMutation.mutate({
      selfieBase64: result.snapshotDataUrl,
      livenessSignals: result.livenessSignals,
      deviceId: getDeviceId(),
      userId: clientUserId,
      email: clientEmail,
    });
  };

  const progressStep =
    step === 'intro' || step === 'live-scan' ? 0 : 1;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #040810 0%, #0a0f2e 100%)' }}>
      {/* Header */}
      <div className="flex-none px-6 pt-10 pb-5 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3 border border-white/20 shadow-lg">
          <Shield className="text-amber-400 w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Identity Verification</h1>
        <p className="text-white/60 text-xs mt-1">AI 3D Face Matching & Biometric Liveness</p>
      </div>

      {/* Step indicator */}
      {!['suspended', 'banned', 'done'].includes(step) && (
        <div className="flex justify-center gap-6 mb-6 px-6">
          {STEPS.map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all shadow-sm ${
                i < progressStep  ? 'bg-emerald-500 border-emerald-500' :
                i === progressStep ? 'border-amber-400 bg-amber-400/20 shadow-[0_0_12px_rgba(251,191,36,0.4)]' : 'border-white/20 bg-white/5'
              }`}>
                {i < progressStep
                  ? <CheckCircle2 className="w-5 h-5 text-white" />
                  : <s.icon className={`w-4 h-4 ${i === progressStep ? 'text-amber-400' : 'text-white/30'}`} />}
              </div>
              <span className={`text-xs font-semibold ${i === progressStep ? 'text-amber-400' : 'text-white/40'}`}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content card */}
      <div className="flex-1 bg-white rounded-t-3xl px-6 pt-7 pb-10 shadow-2xl overflow-y-auto">
        <div className="max-w-md mx-auto">

          {/* ── INTRO ── */}
          {step === 'intro' && (
            <div className="flex flex-col gap-6">
              <div className="w-24 h-24 rounded-3xl bg-blue-50 border-2 border-blue-200 flex items-center justify-center mx-auto shadow-sm">
                <Camera className="text-blue-600 w-12 h-12" />
              </div>

              <div className="text-center space-y-1.5">
                <h2 className="text-2xl font-bold text-gray-900">AI Biometric Liveness Check</h2>
                <p className="text-gray-500 text-xs leading-relaxed max-w-sm mx-auto">
                  Take a quick live facial scan to confirm real human presence (MediaPipe 3D Mesh + OpenAI Vision) and verify your dating profile.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { title: 'Live Blink & Mesh', desc: 'Active motion detection' },
                  { title: 'DeepFace Alignment', desc: 'Facial geometry match' },
                ].map((f, i) => (
                  <div key={i} className="flex flex-col items-center text-center p-3 rounded-2xl bg-slate-50 border border-slate-100 gap-1 shadow-xs">
                    <span className="text-xs font-bold text-gray-900">{f.title}</span>
                    <span className="text-[10px] text-gray-400 font-medium">{f.desc}</span>
                  </div>
                ))}
              </div>

              <Button
                className="w-full h-14 text-base font-bold rounded-2xl shadow-lg bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white"
                onClick={startSelfie}
              >
                <Zap className="w-5 h-5 mr-2" /> Start Biometric Scan
              </Button>

              <p className="text-center text-[11px] text-gray-400 leading-tight">
                Selfie captures are encrypted and analyzed strictly for authenticity. Never shared publicly.
              </p>
            </div>
          )}

          {/* ── LIVE SCAN ── */}
          {step === 'live-scan' && (
            <LivenessDetection
              onComplete={(result) => {
                setSelfieResult(result);
                submitVerification(result);
              }}
              onCancel={() => setStep('intro')}
            />
          )}

          {/* ── SUBMITTING ── */}
          {step === 'submitting' && (
            <div className="flex flex-col gap-5 items-center py-12">
              <div className="w-20 h-20 rounded-3xl bg-blue-50 border-2 border-blue-200 flex items-center justify-center shadow-lg">
                <RefreshCw className="text-blue-600 w-10 h-10 animate-spin" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-bold text-gray-900">Verifying Biometrics & Identity…</p>
                <p className="text-xs text-gray-500">Checking facial geometry and presentation attack detection</p>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="flex flex-col gap-5 items-center py-10 text-center">
              <div className="w-20 h-20 rounded-3xl bg-emerald-100 flex items-center justify-center shadow-lg border-2 border-emerald-300">
                <CheckCircle2 className="text-emerald-600 w-12 h-12" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-1">Identity Verified!</h3>
                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                  Your 3D biometric presence and facial scan have been confirmed. Your verified badge is now active.
                </p>
              </div>
            </div>
          )}

          {/* ── PENDING REVIEW ── */}
          {step === 'pending_review' && (
            <div className="flex flex-col gap-4 items-center py-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600">
                <Shield className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Under Final Review</h3>
                <p className="text-xs text-gray-500 max-w-xs">
                  Your biometric scan is being processed by our safety team. You will be notified shortly.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
