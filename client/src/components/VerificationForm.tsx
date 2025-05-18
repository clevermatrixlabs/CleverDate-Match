
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export default function VerificationForm() {
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const { toast } = useToast();

  const verifyEmail = async () => {
    try {
      const response = await fetch('/api/verify/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: emailCode }),
      });
      
      if (!response.ok) throw new Error('Invalid code');
      
      toast({
        title: "Success",
        description: "Email verified successfully",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: "Please check your code and try again",
      });
    }
  };

  const verifyPhone = async () => {
    try {
      const response = await fetch('/api/verify/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: phoneCode }),
      });
      
      if (!response.ok) throw new Error('Invalid code');
      
      toast({
        title: "Success",
        description: "Phone verified successfully",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: "Please check your code and try again",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Email Verification</h3>
        <div className="mt-2 flex gap-2">
          <Input
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value)}
            placeholder="Enter email code"
          />
          <Button onClick={verifyEmail}>Verify Email</Button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium">Phone Verification</h3>
        <div className="mt-2 flex gap-2">
          <Input
            value={phoneCode}
            onChange={(e) => setPhoneCode(e.target.value)}
            placeholder="Enter phone code"
          />
          <Button onClick={verifyPhone}>Verify Phone</Button>
        </div>
      </div>
    </div>
  );
}
