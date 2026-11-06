import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { useMatch } from '@/context/MatchContext';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  Wallet, 
  Gift, 
  History, 
  Tv2, 
  Plus, 
  ArrowDownLeft, 
  Send, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ShieldCheck,
  CreditCard
} from 'lucide-react';

type PayPalConfig = {
  configured: boolean;
  clientId: string | null;
  environment: 'sandbox' | 'live';
  currency: 'USD';
};

type TransactionItem = {
  id: number;
  userId: number;
  recipientId?: number | null;
  amount: string;
  type: 'deposit' | 'withdrawal' | 'gift' | 'fee';
  status: 'pending' | 'completed' | 'failed';
  paymentProvider?: string | null;
  paymentReference?: string | null;
  createdAt: string;
};

type PayPalButtonInstance = {
  render: (container: HTMLElement) => Promise<void>;
  close?: () => Promise<void> | void;
};

type PayPalNamespace = {
  Buttons: (options: {
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (error: unknown) => void;
    style?: {
      layout?: 'vertical' | 'horizontal';
      shape?: 'rect' | 'pill';
      label?: 'paypal' | 'checkout' | 'buynow';
      height?: number;
    };
  }) => PayPalButtonInstance;
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

function PayPalDepositButtonContainer({
  amount,
  sdkReady,
  disabled,
  onStart,
  createOrder,
  captureOrder,
  onFinish,
  onError,
}: {
  amount: number;
  sdkReady: boolean;
  disabled: boolean;
  onStart: () => void;
  createOrder: (amt: number) => Promise<string>;
  captureOrder: (orderId: string) => Promise<void>;
  onFinish: () => void;
  onError: (error: unknown) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sdkReady || disabled || !window.paypal || !containerRef.current) return;

    let buttons: PayPalButtonInstance | undefined;
    try {
      buttons = window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'rect', label: 'paypal', height: 42 },
        createOrder: async () => {
          onStart();
          return createOrder(amount);
        },
        onApprove: async ({ orderID }) => {
          try {
            await captureOrder(orderID);
          } finally {
            onFinish();
          }
        },
        onCancel: () => onFinish(),
        onError: (error) => {
          onFinish();
          onError(error);
        },
      });

      buttons.render(containerRef.current).catch((error) => {
        onFinish();
        onError(error);
      });
    } catch (error) {
      onFinish();
      onError(error);
    }

    return () => {
      if (buttons?.close) void buttons.close();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [amount, captureOrder, createOrder, disabled, onError, onFinish, onStart, sdkReady]);

  return <div ref={containerRef} className="min-h-[44px]" />;
}

export default function WalletPage() {
  const { user } = useAuth();
  const { matchedUser } = useMatch();
  const [giftAmount, setGiftAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('25');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showDepositInput, setShowDepositInput] = useState(false);
  const [showWithdrawInput, setShowWithdrawInput] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [sdkReady, setSdkReady] = useState(Boolean(typeof window !== 'undefined' && window.paypal));
  const { toast } = useToast();

  const balance = parseFloat(String(user?.walletBalance || 0));

  // Query PayPal configuration
  const paypalConfigQuery = useQuery<PayPalConfig>({
    queryKey: ['/api/payment/paypal/config'],
    queryFn: async () => {
      const res = await fetch('/api/payment/paypal/config', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load payment configuration');
      return res.json();
    },
    staleTime: 60_000,
  });

  const paypalConfigured = paypalConfigQuery.data?.configured === true;

  // Load PayPal SDK dynamically
  useEffect(() => {
    const clientId = paypalConfigQuery.data?.clientId;
    if (!clientId) return;

    if (window.paypal) {
      setSdkReady(true);
      return;
    }

    const existing = document.getElementById('paypal-sdk') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => setSdkReady(true));
      return;
    }

    const script = document.createElement('script');
    script.id = 'paypal-sdk';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons&commit=true`;
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => {
      toast({
        variant: 'destructive',
        title: 'PayPal failed to load',
        description: 'Unable to reach PayPal services. Please check your internet connection.',
      });
    };
    document.body.appendChild(script);
  }, [paypalConfigQuery.data?.clientId, toast]);

  // Transaction History query
  const transactionsQuery = useQuery<TransactionItem[]>({
    queryKey: ['/api/wallet/transactions'],
    queryFn: async () => {
      const res = await fetch('/api/wallet/transactions', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Secure deposit capture mutation
  const depositMutation = useMutation({
    mutationFn: async ({ orderId, paymentProvider }: { orderId: string; paymentProvider: string }) => {
      return apiRequest('POST', '/wallet/deposit', { orderId, paymentProvider });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Deposit Successful',
        description: `$${data?.creditedAmount || depositAmount} has been verified and added to your balance.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/transactions'] });
      setDepositAmount('25');
      setShowDepositInput(false);
      setIsProcessingPayment(false);
    },
    onError: (error: any) => {
      setIsProcessingPayment(false);
      toast({
        variant: 'destructive',
        title: 'Deposit Failed',
        description: error.message || 'Payment verification failed. Please try again.',
      });
    },
  });

  const handleCreatePayPalOrder = async (amt: number): Promise<string> => {
    const result = await apiRequest('POST', '/payment/paypal/create-order', {
      type: 'deposit',
      amount: amt,
    });
    if (!result?.orderId) {
      throw new Error(result?.message || 'Could not initiate PayPal checkout');
    }
    return result.orderId;
  };

  const handleCapturePayPalDeposit = async (orderId: string) => {
    await depositMutation.mutateAsync({
      orderId,
      paymentProvider: 'paypal',
    });
  };

  const withdrawMutation = useMutation({
    mutationFn: async (amount: number) => {
      return apiRequest('POST', '/wallet/withdraw', { amount });
    },
    onSuccess: () => {
      toast({ title: 'Withdrawal initiated', description: 'Funds will be transferred to your account' });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/transactions'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/transactions'] });
      setGiftAmount('');
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Gift failed', description: error.message || 'Please try again' });
    },
  });

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

  const currentDepositNum = parseFloat(depositAmount) || 0;

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
            <h3 className="text-4xl font-bold mb-4">${balance.toFixed(2)}</h3>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDepositInput(!showDepositInput);
                  setShowWithdrawInput(false);
                }}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  showDepositInput ? 'bg-white text-blue-900 font-semibold' : 'bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white'
                }`}
              >
                <Plus className="w-4 h-4" /> {showDepositInput ? 'Close Deposit' : 'Add Funds'}
              </button>
              <button
                onClick={() => {
                  setShowWithdrawInput(!showWithdrawInput);
                  setShowDepositInput(false);
                }}
                disabled={balance <= 0}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
                  showWithdrawInput ? 'bg-white text-blue-900 font-semibold' : 'bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4" /> Withdraw
              </button>
            </div>
          </div>

          {/* Secure Deposit Panel */}
          {showDepositInput && (
            <div className="bg-blue-50/70 border-t border-blue-100 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-gray-800">Secure Payment Checkout</span>
                </div>
                <span className="text-xs text-gray-500">All deposits are verified via PayPal</span>
              </div>

              {/* Amount selection */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Select or enter deposit amount (USD)</label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[10, 25, 50, 100].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDepositAmount(String(amt))}
                      className={`py-2 rounded-xl text-sm font-semibold border transition-all ${
                        depositAmount === String(amt)
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

                <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2">
                  <span className="text-gray-500 mr-2 font-medium">$</span>
                  <input
                    type="number"
                    min="1"
                    max="5000"
                    placeholder="Custom amount (min $1)"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="bg-transparent text-gray-800 placeholder-gray-400 outline-none w-full text-sm font-medium"
                  />
                </div>
              </div>

              {/* Payment Processing Area */}
              {paypalConfigured ? (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs text-gray-600 px-1">
                    <span>Deposit Amount:</span>
                    <span className="font-bold text-gray-900">${currentDepositNum > 0 ? currentDepositNum.toFixed(2) : '0.00'} USD</span>
                  </div>

                  {currentDepositNum >= 1 ? (
                    sdkReady ? (
                      <PayPalDepositButtonContainer
                        amount={currentDepositNum}
                        sdkReady={sdkReady}
                        disabled={isProcessingPayment || depositMutation.isLoading}
                        onStart={() => setIsProcessingPayment(true)}
                        createOrder={handleCreatePayPalOrder}
                        captureOrder={handleCapturePayPalDeposit}
                        onFinish={() => setIsProcessingPayment(false)}
                        onError={(err: any) => {
                          setIsProcessingPayment(false);
                          toast({
                            variant: 'destructive',
                            title: 'PayPal checkout cancelled or failed',
                            description: err?.message || 'Please check your connection and try again.',
                          });
                        }}
                      />
                    ) : (
                      <div className="py-3 text-center text-xs text-gray-500 bg-white rounded-xl border border-gray-200 flex items-center justify-center gap-2">
                        <Clock className="w-4 h-4 animate-spin text-blue-600" />
                        <span>Loading secure PayPal gateway…</span>
                      </div>
                    )
                  ) : (
                    <div className="py-2.5 px-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>Please enter a deposit amount of at least $1.00 USD.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>Payment Gateway Notice</span>
                  </div>
                  <p>
                    Deposits require a verified transaction through PayPal. Free deposits have been completely disabled for security.
                    Please configure PayPal Business credentials in the admin dashboard to enable real monetary wallet deposits.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Withdraw Panel */}
          {showWithdrawInput && (
            <div className="bg-gray-50 border-t border-gray-200 p-5 space-y-3">
              <span className="text-xs font-semibold text-gray-700 block">Withdraw to Bank / PayPal</span>
              <div className="flex gap-2">
                <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 flex-1">
                  <span className="text-gray-500 mr-1 text-sm">$</span>
                  <input
                    type="number"
                    min="1"
                    max={balance}
                    placeholder={`Max $${balance.toFixed(2)}`}
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    className="bg-transparent text-gray-800 placeholder-gray-400 outline-none w-full py-2 text-sm"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawMutation.isLoading}
                  className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {withdrawMutation.isLoading ? '…' : 'Submit'}
                </button>
              </div>
            </div>
          )}
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
                disabled={sendGiftMutation.isLoading || !matchedUser || balance < amt}
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
              disabled={sendGiftMutation.isLoading || !giftAmount || isNaN(parseFloat(giftAmount)) || !matchedUser}
              className="flex items-center gap-1.5 bg-gradient-to-r from-blue-800 to-blue-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              <Send className="w-3.5 h-3.5" />
              {sendGiftMutation.isLoading ? 'Sending…' : 'Send'}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card className="shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-gray-500" />
              <h3 className="font-semibold text-gray-800">Transaction History</h3>
            </div>
            {transactionsQuery.data && transactionsQuery.data.length > 0 && (
              <span className="text-xs text-gray-500">{transactionsQuery.data.length} records</span>
            )}
          </div>

          {transactionsQuery.isLoading ? (
            <div className="py-6 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>Loading transaction records…</span>
            </div>
          ) : !transactionsQuery.data || transactionsQuery.data.length === 0 ? (
            <div className="py-6 text-center text-gray-400 text-sm">
              No transactions yet
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {transactionsQuery.data.map(tx => {
                const isDeposit = tx.type === 'deposit';
                return (
                  <div key={tx.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isDeposit ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {isDeposit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800 capitalize">
                          {tx.type === 'deposit' ? 'Wallet Deposit' : tx.type}
                          {tx.paymentProvider ? ` (${tx.paymentProvider.toUpperCase()})` : ''}
                        </p>
                        <p className="text-xs text-gray-400">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : 'Recently'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${isDeposit ? 'text-emerald-600' : 'text-gray-800'}`}>
                        {isDeposit ? `+$${parseFloat(tx.amount).toFixed(2)}` : `-$${parseFloat(tx.amount).toFixed(2)}`}
                      </p>
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        tx.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : tx.status === 'pending'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {tx.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
