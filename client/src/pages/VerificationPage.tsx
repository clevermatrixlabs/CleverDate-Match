import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function VerificationPage() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [, navigate] = useLocation();
  const { user, updateUser } = useAuth();
  const { toast } = useToast();

  const verificationMutation = useMutation({
    mutationFn: async (verificationData: string) => {
      const res = await apiRequest('POST', '/api/verification', { verificationData });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Verification successful",
        description: "Your identity has been verified",
      });
      updateUser({ isVerified: true });
      navigate('/create-profile');
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: error.message || "Please try again",
      });
      setIsVerifying(false);
    },
  });

  const startVerification = async () => {
    setIsVerifying(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" }, 
        audio: false 
      });
      setVideoStream(stream);
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
    // 2. Send them to the server for AI verification
    // 3. Process the results
    
    // For demo purposes, we'll simulate a successful verification
    const mockVerificationData = "base64_encoded_verification_data";
    verificationMutation.mutate(mockVerificationData);
    
    // Clean up the video stream
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
  };

  return (
    <div className="px-4">
      <Card className="bg-white rounded-xl shadow-md overflow-hidden mb-5">
        <CardContent className="p-6">
          <h2 className="font-poppins text-xl font-bold text-[#212529] mb-2">Verify Your Identity</h2>
          <p className="text-gray-600 mb-6">We need to confirm you're a real person to keep our community safe.</p>
          
          <div className="bg-[#E9ECEF] rounded-lg p-5 mb-6">
            <div className="flex flex-col items-center justify-center">
              {isVerifying && videoStream ? (
                <>
                  <video 
                    autoPlay 
                    playsInline 
                    muted 
                    ref={(videoEl) => {
                      if (videoEl && videoStream) {
                        videoEl.srcObject = videoStream;
                      }
                    }}
                    className="w-48 h-48 rounded-full object-cover mb-4"
                  />
                  <p className="text-center text-sm text-gray-600 mb-4">Look straight at the camera and follow instructions</p>
                  <Button 
                    className="bg-accent text-white px-6 py-2 rounded-lg font-medium hover:bg-accent/90 transition-colors"
                    onClick={completeVerification}
                    disabled={verificationMutation.isPending}
                  >
                    {verificationMutation.isPending ? 'Verifying...' : 'Complete Verification'}
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-48 h-48 rounded-full bg-[#212529]/5 border-2 border-dashed border-accent flex items-center justify-center mb-4 verification-pulse">
                    <i className="ri-camera-line text-4xl text-accent"></i>
                  </div>
                  <p className="text-center text-sm text-gray-600 mb-4">Position your face in the center and follow the prompts</p>
                  <div className="w-full flex items-center justify-center">
                    <Button 
                      className="bg-accent text-white px-6 py-2 rounded-lg font-medium hover:bg-accent/90 transition-colors"
                      onClick={startVerification}
                    >
                      Start Verification
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          <ul className="space-y-2 mb-6">
            <li className="flex items-center text-sm text-gray-600">
              <i className="ri-checkbox-circle-line text-accent mr-2"></i>
              Facial and eye movement verification
            </li>
            <li className="flex items-center text-sm text-gray-600">
              <i className="ri-checkbox-circle-line text-accent mr-2"></i>
              Takes less than 30 seconds
            </li>
            <li className="flex items-center text-sm text-gray-600">
              <i className="ri-checkbox-circle-line text-accent mr-2"></i>
              Your verification data is securely encrypted
            </li>
          </ul>

          <p className="text-xs text-gray-500 text-center">
            By continuing, you agree to our <a href="#" className="text-secondary">Terms of Service</a> and <a href="#" className="text-secondary">Privacy Policy</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
