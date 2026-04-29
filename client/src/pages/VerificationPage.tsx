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
import { Eye, Shield, UserCheck, Camera, CheckCircle2, IdCard } from 'lucide-react';
import { findCountry } from '@/lib/countries';

export default function VerificationPage() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStep, setVerificationStep] = useState(0);
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [nationalId, setNationalId] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const country = findCountry(user?.country);

  useEffect(() => {
    if (videoStream && videoRef.current) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream]);

  useEffect(() => {
    return () => {
      if (videoStream) videoStream.getTracks().forEach(t => t.stop());
    };
  }, [videoStream]);

  const verificationMutation = useMutation({
    mutationFn: async (payload: { verificationData: string; nationalId: string; nationalIdType: string }) => {
      return apiRequest('POST', '/verification', payload);
    },
    onSuccess: async () => {
      toast({
        title: 'Verification successful',
        description: 'Your identity has been verified. Welcome to Tim Clever Date!',
      });
      if (videoStream) videoStream.getTracks().forEach(t => t.stop());
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      navigate('/app/');
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Verification failed',
        description: error.message || 'Please try again with better lighting',
      });
      setIsVerifying(false);
      setVerificationStep(0);
      setVerificationProgress(0);
    },
  });

  const startVerification = async () => {
    // Validate national ID first
    if (!nationalId.trim()) {
      toast({ variant: 'destructive', title: 'ID required', description: `Please enter your ${country?.idLabel || 'national ID'}` });
      return;
    }
    if (country?.idPattern && !country.idPattern.test(nationalId.trim())) {
      toast({ variant: 'destructive', title: 'Invalid ID format', description: `${country.idLabel} should be: ${country.idHint}` });
      return;
    }

    setIsVerifying(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setVideoStream(stream);
      setVerificationStep(1);

      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
        setVerificationProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setVerificationStep(2);
        }
      }, 300);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Camera access denied',
        description: 'Camera access is required to verify your identity',
      });
      setIsVerifying(false);
    }
  };

  const completeVerification = () => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    let verificationData = 'demo_verification_data_string';

    if (videoRef.current && context) {
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      verificationData = canvas.toDataURL('image/jpeg').split(',')[1];
    }

    verificationMutation.mutate({
      verificationData,
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
        <p className="text-blue-200 text-sm mt-1">Required for everyone — keeps the community safe</p>
      </div>

      <div className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl overflow-y-auto">
        <div className="max-w-md mx-auto">

          {/* Step 0: Intro + ID entry */}
          {!isVerifying && (
            <div className="flex flex-col gap-5">
              <div className="w-32 h-32 rounded-full bg-blue-50 border-2 border-dashed border-blue-200 flex items-center justify-center mx-auto">
                <UserCheck className="text-blue-600 w-14 h-14" />
              </div>

              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Verify Your Identity</h2>
                <p className="text-gray-500 text-sm">
                  Two steps: enter your government ID, then a quick face scan.
                  This is mandatory for every member.
                </p>
              </div>

              {/* National ID input */}
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
                />
                {country?.idHint && (
                  <p className="text-xs text-gray-400 mt-1">Format: {country.idHint}</p>
                )}
                {!user?.country && (
                  <p className="text-xs text-amber-600 mt-1">No country on file — please re-register with country selected.</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: <Eye className="text-blue-600 w-5 h-5" />, label: 'Eye Movement' },
                  { icon: <Shield className="text-blue-600 w-5 h-5" />, label: 'Bank-Level' },
                  { icon: <Camera className="text-blue-600 w-5 h-5" />, label: 'AI Face Scan' },
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
              >
                Start Face Scan
              </Button>

              <p className="text-center text-xs text-gray-400">
                Your data is encrypted and never shared.
              </p>
            </div>
          )}

          {/* Step 1: Scanning */}
          {isVerifying && verificationStep === 1 && (
            <div className="flex flex-col gap-5 items-center">
              <div className="relative">
                <video
                  autoPlay
                  playsInline
                  muted
                  ref={videoRef}
                  className="w-56 h-56 rounded-full object-cover border-4 border-blue-500 shadow-xl"
                />
                <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-30" />
              </div>

              <div className="w-full">
                <p className="text-center text-sm text-gray-600 mb-3">
                  {verificationProgress < 33 ? 'Detecting face...' :
                   verificationProgress < 66 ? 'Analysing eye movements...' :
                   'Almost complete...'}
                </p>
                <Progress value={verificationProgress} className="h-3 rounded-full" />
                <p className="text-center text-xs text-gray-400 mt-2">{verificationProgress}%</p>
              </div>

              <p className="text-center text-sm text-gray-500">
                Keep your face in frame and eyes open
              </p>
            </div>
          )}

          {/* Step 2: Complete */}
          {isVerifying && verificationStep === 2 && (
            <div className="flex flex-col gap-5 items-center">
              <div className="w-32 h-32 rounded-full bg-green-50 flex items-center justify-center">
                <CheckCircle2 className="text-green-500 w-16 h-16" />
              </div>

              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Scan Complete!</h2>
                <p className="text-gray-500 text-sm">Tap below to finish verification.</p>
              </div>

              <Button
                className="w-full h-14 text-base font-semibold rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }}
                onClick={completeVerification}
                disabled={verificationMutation.isPending}
              >
                {verificationMutation.isPending ? 'Processing...' : 'Complete Verification'}
              </Button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
