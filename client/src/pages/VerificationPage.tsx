import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Eye, Shield, UserCheck, Camera, CheckCircle2, IdCard, Upload, RefreshCw } from 'lucide-react';
import { findCountry } from '@/lib/countries';
import {
  loadFaceModels,
  runLivenessCheck,
  detectFaceInImageFile,
  type LivenessProgress,
} from '@/lib/faceVerification';

type Step = 'intro' | 'loading-models' | 'live-scan' | 'id-upload' | 'submitting' | 'done';

export default function VerificationPage() {
  const [step, setStep] = useState<Step>('intro');
  const [nationalId, setNationalId] = useState('');
  const [modelLoadMsg, setModelLoadMsg] = useState('Preparing camera...');
  const [liveness, setLiveness] = useState<LivenessProgress>({
    blinks: 0, turnedLeft: false, turnedRight: false, faceDetected: false,
    message: 'Starting...', percent: 0,
  });
  const [selfieResult, setSelfieResult] = useState<{ descriptor: number[]; snapshotDataUrl: string } | null>(null);
  const [idResult, setIdResult] = useState<{ descriptor: number[]; previewDataUrl: string } | null>(null);
  const [idLoading, setIdLoading] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const country = findCountry(user?.country);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const verificationMutation = useMutation({
    mutationFn: async (payload: any) => apiRequest('POST', '/verification', payload),
    onSuccess: async () => {
      toast({ title: 'Verification successful', description: 'Welcome to Tim Clever Date!' });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setStep('done');
      setTimeout(() => navigate('/app/'), 1200);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Verification rejected', description: error.message });
      setStep('intro');
      setSelfieResult(null);
      setIdResult(null);
    },
  });

  const startVerification = async () => {
    if (!nationalId.trim()) {
      toast({ variant: 'destructive', title: 'ID required', description: `Please enter your ${country?.idLabel || 'national ID'}` });
      return;
    }
    if (country?.idPattern && !country.idPattern.test(nationalId.trim())) {
      toast({ variant: 'destructive', title: 'Invalid ID format', description: `${country.idLabel} should be: ${country.idHint}` });
      return;
    }

    setStep('loading-models');
    setModelLoadMsg('Loading face recognition (first time may take 30s)...');

    try {
      await loadFaceModels((label) => setModelLoadMsg(label));
    } catch {
      toast({ variant: 'destructive', title: 'Could not load face recognition', description: 'Check your internet connection and try again.' });
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
        try {
          await videoRef.current.play();
        } catch {}
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
        setStep('id-upload');
      } catch (e: any) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        toast({ variant: 'destructive', title: 'Liveness check failed', description: e?.message || 'Please try again.' });
        setStep('intro');
      }
    }, 100);
  };

  const handleIdFile = async (file: File) => {
    setIdError(null);
    setIdLoading(true);
    try {
      const result = await detectFaceInImageFile(file);
      setIdResult(result);
    } catch (e: any) {
      setIdError(e?.message || 'Could not process the ID document.');
    } finally {
      setIdLoading(false);
    }
  };

  const submitVerification = () => {
    if (!selfieResult || !idResult) return;
    setStep('submitting');
    verificationMutation.mutate({
      verificationData: selfieResult.snapshotDataUrl.split(',')[1],
      selfieDescriptor: selfieResult.descriptor,
      idDescriptor: idResult.descriptor,
      idImage: idResult.previewDataUrl.split(',')[1],
      nationalId: nationalId.trim(),
      nationalIdType: country?.idLabel || 'National ID',
    });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #1a237e 0%, #1565c0 50%, #0d47a1 100%)' }}>
      <div className="flex-none px-6 pt-12 pb-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3">
          <Shield className="text-white w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white">Identity Verification</h1>
        <p className="text-blue-200 text-sm mt-1">Real face check + government ID — required for everyone</p>
      </div>

      <div className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl overflow-y-auto">
        <div className="max-w-md mx-auto">

          {step === 'intro' && (
            <div className="flex flex-col gap-5" data-testid="step-intro">
              <div className="w-32 h-32 rounded-full bg-blue-50 border-2 border-dashed border-blue-200 flex items-center justify-center mx-auto">
                <UserCheck className="text-blue-600 w-14 h-14" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Verify Your Identity</h2>
                <p className="text-gray-500 text-sm">
                  Three quick steps: enter your government ID number, do a live face scan with blinking and head turns, then upload a photo of your ID. Your selfie face must match the face on the ID.
                </p>
              </div>

              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  <IdCard className="inline w-4 h-4 mr-1 text-blue-600" />
                  {country?.idLabel || 'National ID Number'}
                  {user?.country && <span className="ml-2 text-xs text-gray-400">({country?.name})</span>}
                </Label>
                <Input
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder={country?.idPlaceholder || 'Enter your ID number'}
                  className="h-12 rounded-xl"
                  data-testid="input-national-id"
                />
                {country?.idHint && <p className="text-xs text-gray-400 mt-1">Format: {country.idHint}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: <Eye className="text-blue-600 w-5 h-5" />, label: 'Liveness Check' },
                  { icon: <Shield className="text-blue-600 w-5 h-5" />, label: 'Face Match' },
                  { icon: <Camera className="text-blue-600 w-5 h-5" />, label: 'On-Device AI' },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center text-center p-3 rounded-xl bg-blue-50 gap-2">
                    {item.icon}
                    <span className="text-xs text-gray-600 font-medium leading-tight">{item.label}</span>
                  </div>
                ))}
              </div>

              <Button
                className="w-full h-14 text-base font-semibold rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }}
                onClick={startVerification}
                data-testid="button-start-verification"
              >
                Start Verification
              </Button>

              <p className="text-center text-xs text-gray-400">
                Face scan happens on your device. No video is uploaded.
              </p>
            </div>
          )}

          {step === 'loading-models' && (
            <div className="flex flex-col gap-5 items-center py-12" data-testid="step-loading">
              <RefreshCw className="text-blue-600 w-12 h-12 animate-spin" />
              <p className="text-center text-sm text-gray-600">{modelLoadMsg}</p>
              <p className="text-center text-xs text-gray-400">First time only — cached after this</p>
            </div>
          )}

          {step === 'live-scan' && (
            <div className="flex flex-col gap-5 items-center" data-testid="step-live-scan">
              <div className="relative">
                <video
                  autoPlay
                  playsInline
                  muted
                  ref={videoRef}
                  className="w-64 h-64 rounded-full object-cover border-4 border-blue-500 shadow-xl"
                  style={{ transform: 'scaleX(-1)' }}
                />
                {liveness.faceDetected && (
                  <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-pulse" />
                )}
              </div>

              <div className="w-full">
                <p className="text-center text-base font-semibold text-gray-800 mb-3" data-testid="text-liveness-message">
                  {liveness.message}
                </p>
                <Progress value={liveness.percent} className="h-3 rounded-full" />
                <p className="text-center text-xs text-gray-400 mt-2">{liveness.percent}%</p>
              </div>

              <div className="flex gap-4 text-xs">
                <div className={`flex items-center gap-1 ${liveness.blinks >= 2 ? 'text-green-600' : 'text-gray-400'}`}>
                  <CheckCircle2 className="w-4 h-4" /> Blinks {liveness.blinks}/2
                </div>
                <div className={`flex items-center gap-1 ${liveness.turnedLeft ? 'text-green-600' : 'text-gray-400'}`}>
                  <CheckCircle2 className="w-4 h-4" /> Turn L
                </div>
                <div className={`flex items-center gap-1 ${liveness.turnedRight ? 'text-green-600' : 'text-gray-400'}`}>
                  <CheckCircle2 className="w-4 h-4" /> Turn R
                </div>
              </div>
            </div>
          )}

          {step === 'id-upload' && (
            <div className="flex flex-col gap-5" data-testid="step-id-upload">
              <div className="text-center">
                <CheckCircle2 className="text-green-500 w-12 h-12 mx-auto mb-2" />
                <h2 className="text-xl font-bold text-gray-800 mb-1">Live face captured!</h2>
                <p className="text-gray-500 text-sm">Now upload a clear photo of your {country?.idLabel || 'national ID'} showing the photo side.</p>
              </div>

              {selfieResult && (
                <div className="flex justify-center">
                  <img
                    src={selfieResult.snapshotDataUrl}
                    alt="Captured selfie"
                    className="w-24 h-24 rounded-full object-cover border-4 border-green-500 shadow"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                </div>
              )}

              {!idResult && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-40 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 flex flex-col items-center justify-center gap-2 hover:bg-blue-100 transition-colors"
                  data-testid="button-pick-id-image"
                  disabled={idLoading}
                >
                  {idLoading ? (
                    <>
                      <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                      <span className="text-sm text-gray-600">Checking your ID for a face...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">Tap to upload ID photo</span>
                      <span className="text-xs text-gray-400">JPG / PNG, photo side up</span>
                    </>
                  )}
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleIdFile(f);
                  e.target.value = '';
                }}
                data-testid="input-id-file"
              />

              {idError && (
                <p className="text-sm text-red-600 text-center" data-testid="text-id-error">{idError}</p>
              )}

              {idResult && (
                <div className="flex flex-col gap-3 items-center">
                  <img
                    src={idResult.previewDataUrl}
                    alt="ID document"
                    className="w-full max-w-xs rounded-xl object-contain border border-gray-200 shadow"
                  />
                  <p className="text-sm text-green-600 font-medium">Face detected on ID ✓</p>
                  <button
                    type="button"
                    onClick={() => { setIdResult(null); setIdError(null); }}
                    className="text-xs text-blue-600 underline"
                    data-testid="button-retake-id"
                  >
                    Use a different photo
                  </button>
                </div>
              )}

              <Button
                className="w-full h-14 text-base font-semibold rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }}
                onClick={submitVerification}
                disabled={!idResult || verificationMutation.isPending}
                data-testid="button-submit-verification"
              >
                {verificationMutation.isPending ? 'Matching faces...' : 'Submit for Verification'}
              </Button>
            </div>
          )}

          {step === 'submitting' && (
            <div className="flex flex-col gap-5 items-center py-12" data-testid="step-submitting">
              <RefreshCw className="text-blue-600 w-12 h-12 animate-spin" />
              <p className="text-center text-sm text-gray-600">Comparing your selfie to your ID...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col gap-5 items-center py-12" data-testid="step-done">
              <CheckCircle2 className="text-green-500 w-20 h-20" />
              <h2 className="text-2xl font-bold text-gray-800">You're verified!</h2>
              <p className="text-gray-500 text-sm text-center">Taking you to the app...</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
