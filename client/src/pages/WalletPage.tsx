import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { useMatch } from '@/context/MatchContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export default function WalletPage() {
  const { user } = useAuth();
  const { matchedUser } = useMatch();
  const [giftAmount, setGiftAmount] = useState('');
  const { toast } = useToast();

  const addFundsMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest('POST', '/api/wallet/deposit', { amount });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Funds added",
        description: "Your wallet has been updated",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Transaction failed",
        description: error.message || "Please try again",
      });
    }
  });

  const withdrawMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest('POST', '/api/wallet/withdraw', { amount });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Withdrawal initiated",
        description: "Funds will be transferred to your account",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Withdrawal failed",
        description: error.message || "Please try again",
      });
    }
  });

  const sendGiftMutation = useMutation({
    mutationFn: async ({ amount, recipientId }: { amount: number, recipientId: number }) => {
      const res = await apiRequest('POST', '/api/wallet/gift', { amount, recipientId });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Gift sent",
        description: "Your gift has been sent successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setGiftAmount('');
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Gift failed",
        description: error.message || "Please try again",
      });
    }
  });

  const handleSendGift = async (amount: number) => {
    if (!matchedUser) {
      toast({
        variant: "destructive",
        title: "No match found",
        description: "You need to have an active match to send a gift",
      });
      return;
    }

    if (amount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Please enter a valid amount",
      });
      return;
    }

    if (parseFloat(String(user?.walletBalance || 0)) < amount) {
      toast({
        variant: "destructive",
        title: "Insufficient funds",
        description: "Please add funds to your wallet",
      });
      return;
    }

    await sendGiftMutation.mutateAsync({ amount, recipientId: matchedUser.id });
  };

  return (
    <div className="px-4">
      <Card className="bg-white rounded-xl shadow-md overflow-hidden mb-5">
        <CardContent className="p-6">
          <h2 className="font-poppins text-xl font-bold text-[#212529] mb-4">Your Wallet</h2>
          
          <div className="bg-gradient-to-r from-secondary to-primary rounded-xl p-6 mb-6 text-white">
            <p className="text-white/80 mb-1">Available Balance</p>
            <h3 className="text-2xl font-bold mb-4">${parseFloat(String(user?.walletBalance || 0)).toFixed(2)}</h3>
            
            <div className="flex space-x-2">
              <Button 
                className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 text-sm font-medium hover:bg-white/30 transition-colors"
                onClick={() => addFundsMutation.mutate(50)} // In a real app, show a payment form
                disabled={addFundsMutation.isPending}
              >
                Add Funds
              </Button>
              <Button 
                className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 text-sm font-medium hover:bg-white/30 transition-colors"
                onClick={() => withdrawMutation.mutate(parseFloat(String(user?.walletBalance || 0)))}
                disabled={withdrawMutation.isPending || parseFloat(String(user?.walletBalance || 0)) <= 0}
              >
                Withdraw
              </Button>
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="font-medium text-[#212529] mb-3">Send a Gift</h3>
            <p className="text-sm text-gray-600 mb-4">Show appreciation to your match with a monetary gift.</p>
            
            <div className="grid grid-cols-4 gap-3 mb-4">
              <Button 
                className="bg-[#E9ECEF] rounded-lg p-3 text-center hover:bg-gray-200 transition-colors"
                variant="ghost"
                onClick={() => handleSendGift(5)}
                disabled={sendGiftMutation.isPending}
              >
                <span className="block font-medium">$5</span>
              </Button>
              <Button 
                className="bg-[#E9ECEF] rounded-lg p-3 text-center hover:bg-gray-200 transition-colors"
                variant="ghost"
                onClick={() => handleSendGift(10)}
                disabled={sendGiftMutation.isPending}
              >
                <span className="block font-medium">$10</span>
              </Button>
              <Button 
                className="bg-[#E9ECEF] rounded-lg p-3 text-center hover:bg-gray-200 transition-colors"
                variant="ghost"
                onClick={() => handleSendGift(25)}
                disabled={sendGiftMutation.isPending}
              >
                <span className="block font-medium">$25</span>
              </Button>
              <Button 
                className="bg-[#E9ECEF] rounded-lg p-3 text-center hover:bg-gray-200 transition-colors"
                variant="ghost"
                onClick={() => handleSendGift(50)}
                disabled={sendGiftMutation.isPending}
              >
                <span className="block font-medium">$50</span>
              </Button>
            </div>
            
            <div className="bg-[#E9ECEF]/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm text-[#212529]">Custom Amount</h4>
                  <p className="text-xs text-gray-500">Enter any amount you wish to send</p>
                </div>
                
                <div className="flex items-center">
                  <span className="text-gray-500 mr-1">$</span>
                  <Input 
                    type="text" 
                    className="w-20 bg-white border border-gray-300 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" 
                    placeholder="0.00"
                    value={giftAmount}
                    onChange={(e) => setGiftAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  />
                  <Button 
                    className="ml-2 bg-primary text-white rounded-lg px-3 py-1 text-sm"
                    size="sm"
                    onClick={() => handleSendGift(parseFloat(giftAmount))}
                    disabled={sendGiftMutation.isPending || !giftAmount || isNaN(parseFloat(giftAmount))}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="font-medium text-[#212529] mb-3">Transaction History</h3>
            <div className="border-b border-[#E9ECEF] py-3 flex justify-center items-center text-gray-500 text-sm">
              <i className="ri-history-line mr-2"></i>
              <span>No transactions yet</span>
            </div>
          </div>
          
          <div className="bg-[#E9ECEF] rounded-lg p-4">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                <i className="ri-live-line text-secondary"></i>
              </div>
              <div className="ml-3">
                <h3 className="font-medium text-[#212529] text-sm">Upcoming Owner Livestream</h3>
                <p className="text-xs text-gray-500">Subscribe to Diamond tier for access</p>
              </div>
              <Button 
                className="ml-auto bg-secondary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-secondary/90 transition-colors"
              >
                Upgrade
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
