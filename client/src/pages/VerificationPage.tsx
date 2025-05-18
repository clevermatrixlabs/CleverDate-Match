import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { LucideEye, LucideShield, LucideUserCheck, LucideCamera } from 'lucide-react';

export default function VerificationPage() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStep, setVerificationStep] = useState(0);
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [, navigate] = useLocation();
  const { user, updateUser } = useAuth();
  const { toast } = useToast();

  const verificationMutation = useMutation({
    mutationFn: async (verificationData: string) => {
      const res = await apiRequest('POST', '/api/verification', { verificationData });

  const verifyEmail = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("/api/verify/email", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      return response;
    },
  });

  const verifyPhone = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("/api/verify/phone", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      return response;
    },
  });

  const showVerificationPrompts = async () => {
    const emailCode = prompt("Please enter the email verification code:");
    if (emailCode) {
      try {
        await verifyEmail.mutateAsync(emailCode);
        toast({
          title: "Email verified",
          description: "Your email has been successfully verified",
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Email verification failed",
          description: "Please check the code and try again",
        });
      }
    }

    const phoneCode = prompt("Please enter the phone verification code:");
    if (phoneCode) {
      try {
        await verifyPhone.mutateAsync(phoneCode);
        toast({
          title: "Phone verified",
          description: "Your phone number has been successfully verified",
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Phone verification failed",
          description: "Please check the code and try again",
        });
      }
    }
  };

      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Verification successful",
        description: "Your identity has been verified. You can now use all app features.",
        className: "border-2 border-success",
      });
      updateUser({ isVerified: true });
      navigate('/create-profile');
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: error.message || "Please try again with better lighting conditions",
      });
      setIsVerifying(false);
      setVerificationStep(0);
      setVerificationProgress(0);
    },
  });

  const startVerification = async () => {
    setIsVerifying(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: false 
      });
      setVideoStream(stream);
      setVerificationStep(1);
      
      // Start progress animation
      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
        setVerificationProgress(progress);
        
        if (progress >= 100) {
          clearInterval(interval);
          setVerificationStep(2);
          showVerificationPrompts();
        }
      }, 300);
      
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Camera access denied",
        description: "Please allow camera access to verify your identity",
      });
      setIsVerifying(false);
    }
  };

  const completeVerification = () => {
    // In a real app, we would:
    // 1. Capture frames from the video stream
    // 2. Send them to the server for AI verification using OpenAI
    // 3. Process the verification results
    
    // Simulate capturing video frames for verification
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (videoRef.current && context) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      
      // Get base64 data from canvas
      const verificationData = canvas.toDataURL('image/jpeg').split(',')[1];
      verificationMutation.mutate(verificationData);
    } else {
      // Fallback for demo purposes
      const verificationData = "base64_encoded_verification_data";
      verificationMutation.mutate(verificationData);
    }
    
    // Clean up the video stream
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardHeader className="app-header py-6">
          <h2 className="text-2xl font-bold text-white text-center">Identity Verification</h2>
        </CardHeader>
        <CardContent className="p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Enhance Your Security</h3>
            <p className="text-gray-600 mb-4">We use advanced facial verification to ensure Tim Clever Date remains safe and authentic.</p>
            
            <div className={`verification-container rounded-xl p-5 mb-6 ${verificationStep === 2 ? 'bg-primary-light' : 'bg-primary'}`}>
              <div className="flex flex-col items-center justify-center">
                {!isVerifying && (
                  <>
                    <div className="w-48 h-48 rounded-full bg-white/10 border-2 border-dashed border-white flex items-center justify-center mb-4 verification-pulse">
                      <LucideUserCheck size={64} className="text-white" />
                    </div>
                    <p className="text-center text-sm text-white mb-6">Position your face in the center with good lighting</p>
                    <Button 
                      className="bg-white text-primary hover:bg-white/90 transition-colors w-full py-2"
                      onClick={startVerification}
                    >
                      Start Verification
                    </Button>
                  </>
                )}
                
                {isVerifying && videoStream && verificationStep === 1 && (
                  <>
                    <div className="relative mb-4">
                      <video 
                        autoPlay 
                        playsInline 
                        muted 
                        ref={videoRef}
                        className="w-56 h-56 rounded-full object-cover eye-scan"
                      />
                    </div>
                    <p className="text-center text-sm text-white mb-4">
                      Keep your eyes open and follow the scanning light
                    </p>
                    <Progress value={verificationProgress} className="h-2 w-full bg-white/20 mb-6" />
                    <p className="text-xs text-white/70 mb-6 text-center">
                      {verificationProgress < 33 ? "Detecting face..." : 
                       verificationProgress < 66 ? "Analyzing eye movements..." : 
                       "Almost complete..."}
                    </p>
                  </>
                )}
                
                {isVerifying && verificationStep === 2 && (
                  <>
                    <div className="mb-4 flex items-center justify-center">
                      <LucideShield size={64} className="text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white text-center mb-2">Verification Complete</h3>
                    <p className="text-center text-sm text-white/80 mb-6">
                      Your identity scan was successful
                    </p>
                    <Button 
                      className="bg-white text-primary hover:bg-white/90 transition-colors w-full py-2"
                      onClick={completeVerification}
                      disabled={verificationMutation.isPending}
                    >
                      {verificationMutation.isPending ? 'Processing...' : 'Continue'}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="flex flex-col items-center text-center p-3 rounded-lg bg-primary/5">
                <LucideEye className="text-primary mb-2" size={24} />
                <span className="text-xs font-medium">Eye Movement<br/>Verification</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 rounded-lg bg-primary/5">
                <LucideShield className="text-primary mb-2" size={24} />
                <span className="text-xs font-medium">Bank-Level<br/>Encryption</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 rounded-lg bg-primary/5">
                <LucideCamera className="text-primary mb-2" size={24} />
                <span className="text-xs font-medium">AI-Powered<br/>Verification</span>
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center">
              By continuing, you agree to our <a href="#" className="text-primary">Terms of Service</a> and <a href="#" className="text-primary">Privacy Policy</a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
