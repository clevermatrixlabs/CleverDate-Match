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
import { Wallet, Gift, History, Tv2, Plus, ArrowDownLeft, Send } from 'lucide-react';

export default function WalletPage() {
  const { user } = useAuth();
  const { matchedUser } = useMatch();
  const [giftAmount, setGiftAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showDepositInput, setShowDepositInput] = useState(false);
  const [showWithdrawInput, setShowWithdrawInput] = useState(false);
  const { toast } = useToast();

  const balance = parseFloat(String(user?.walletBalance || 0));

  const addFundsMutation = useMutation({
    mutationFn: async (amount: number) => {
      return apiRequest('POST', '/wallet/deposit', { amount });
    },
    onSuccess: () => {
      toast({ title: 'Funds added', description: 'Your wallet has been updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setDepositAmount('');
      setShowDepositInput(false);
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Transaction failed', description: error.message || 'Please try again' });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (amount: number) => {
      return apiRequest('POST', '/wallet/withdraw', { amount });
    },
    onSuccess: () => {
      toast({ title: 'Withdrawal initiated', description: 'Funds will be transferred to your account' });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setWithdrawAmount('');
      setShowWithdrawInput(false);
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Withdrawal failed', description: error.message || 'Please try again' });
    },
  });

  const sendGiftMutation = useMutation({
    mutationFn: async ({ amount, recipientId }: { amount: number; recipientId: number }) => {
      return apiRequest('POST', '/wallet/gift', { amount, recipientId });
    },
    onSuccess: () => {
      toast({ title: 'Gift sent!', description: 'Your gift has been sent successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setGiftAmount('');
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Gift failed', description: error.message || 'Please try again' });
    },
  });

  const handleDeposit = () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      toast({ variant: 'destructive', title: 'Invalid amount', description: 'Enter a valid amount to deposit' });
      return;
    }
    addFundsMutation.mutate(amount);
  };

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      toast({ variant: 'destructive', title: 'Invalid amount', description: 'Enter a valid amount to withdraw' });
      return;
    }
    if (amount > balance) {
      toast({ variant: 'destructive', title: 'Insufficient funds', description: `Your balance is $${balance.toFixed(2)}` });
      return;
    }
    withdrawMutation.mutate(amount);
  };

  const handleSendGift = (amount: number) => {
    if (!matchedUser) {
      toast({ variant: 'destructive', title: 'No match found', description: 'You need an active match to send a gift' });
      return;
    }
    if (!amount || amount <= 0) {
      toast({ variant: 'destructive', title: 'Invalid amount', description: 'Please enter a valid amount' });
      return;
    }
    if (balance < amount) {
      toast({ variant: 'destructive', title: 'Insufficient funds', description: 'Please add funds to your wallet' });
      return;
    }
    sendGiftMutation.mutate({ amount, recipientId: matchedUser.id });
  };

  return (
    <div className="px-4 pb-4 space-y-4">
      {/* Balance card */}
      <Card className="overflow-hidden shadow-md">
        <CardContent className="p-0">
          <div className="bg-gradient-to-br from-[#1a237e] via-[#1565c0] to-[#0d47a1] p-6 text-white">
            <div className="flex items-center gap-2 mb-1 opacity-80 text-sm">
              <Wallet className="w-4 h-4" />
              <span>Available Balance</span>
            </div>
            <h3 className="text-4xl font-bold mb-5">${balance.toFixed(2)}</h3>

            {/* Add Funds */}
            {showDepositInput ? (
              <div className="flex gap-2 mb-2">
                <div className="flex items-center bg-white/20 rounded-xl px-3 flex-1">
                  <span className="text-white/70 mr-1 text-sm">$</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Enter amount"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="bg-transparent text-white placeholder-white/50 outline-none w-full py-2 text-sm"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleDeposit}
                  disabled={addFundsMutation.isPending}
                  className="bg-white text-blue-800 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-50 disabled:opacity-60 transition-colors"
                >
                  {addFundsMutation.isPending ? '…' : 'Add'}
                </button>
                <button
                  onClick={() => { setShowDepositInput(false); setDepositAmount(''); }}
                  className="bg-white/20 rounded-xl px-3 py-2 text-sm hover:bg-white/30 transition-colors"
                >✕</button>
              </div>
            ) : showWithdrawInput ? (
              <div className="flex gap-2 mb-2">
                <div className="flex items-center bg-white/20 rounded-xl px-3 flex-1">
                  <span className="text-white/70 mr-1 text-sm">$</span>
                  <input
                    type="number"
                    min="1"
                    max={balance}
                    placeholder={`Max $${balance.toFixed(2)}`}
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    className="bg-transparent text-white placeholder-white/50 outline-none w-full py-2 text-sm"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawMutation.isPending}
                  className="bg-white text-blue-800 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-50 disabled:opacity-60 transition-colors"
                >
                  {withdrawMutation.isPending ? '…' : 'Send'}
                </button>
                <button
                  onClick={() => { setShowWithdrawInput(false); setWithdrawAmount(''); }}
                  className="bg-white/20 rounded-xl px-3 py-2 text-sm hover:bg-white/30 transition-colors"
                >✕</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDepositInput(true)}
                  className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2 text-sm font-medium hover:bg-white/30 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Funds
                </button>
                <button
                  onClick={() => setShowWithdrawInput(true)}
                  disabled={balance <= 0}
                  className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2 text-sm font-medium hover:bg-white/30 transition-colors disabled:opacity-40"
                >
                  <ArrowDownLeft className="w-4 h-4" /> Withdraw
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Send a Gift */}
      <Card className="shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4 text-pink-500" />
            <h3 className="font-semibold text-gray-800">Send a Gift</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            {matchedUser ? `Send a gift to ${matchedUser.firstName || 'your match'}` : 'You need an active match to send gifts'}
          </p>

          <div className="grid grid-cols-4 gap-2 mb-4">
            {[5, 10, 25, 50].map(amt => (
              <button
                key={amt}
                onClick={() => handleSendGift(amt)}
                disabled={sendGiftMutation.isPending || !matchedUser || balance < amt}
                className="bg-blue-50 border border-blue-100 rounded-xl py-3 text-center hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="block font-semibold text-blue-700">${amt}</span>
              </button>
            ))}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1">Custom amount</p>
              <div className="flex items-center gap-1">
                <span className="text-gray-500 font-medium">$</span>
                <input
                  type="number"
                  min="1"
                  placeholder="0.00"
                  value={giftAmount}
                  onChange={e => setGiftAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="w-full bg-transparent outline-none text-gray-800 font-medium text-lg"
                />
              </div>
            </div>
            <button
              onClick={() => handleSendGift(parseFloat(giftAmount))}
              disabled={sendGiftMutation.isPending || !giftAmount || isNaN(parseFloat(giftAmount)) || !matchedUser}
              className="flex items-center gap-1.5 bg-gradient-to-r from-blue-800 to-blue-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              <Send className="w-3.5 h-3.5" />
              {sendGiftMutation.isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card className="shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-gray-800">Transaction History</h3>
          </div>
          <div className="py-6 text-center text-gray-400 text-sm">
            No transactions yet
          </div>
        </CardContent>
      </Card>

      {/* Livestream upgrade */}
      <Card className="shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <Tv2 className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-800 text-sm">Owner Livestreams</h3>
              <p className="text-xs text-gray-500">Diamond tier unlocks exclusive access</p>
            </div>
            <button className="bg-gradient-to-r from-blue-800 to-blue-500 text-white px-3 py-1.5 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity">
              Upgrade
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
