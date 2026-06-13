import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, CreditCard, Shield, Globe, AlertCircle } from 'lucide-react';
import {
  SUBSCRIPTION_PLANS,
  getCurrencyForCountry,
  convertPrice,
  formatPrice,
  generateTxRef,
  loadFlutterwaveSDK,
  FLW_PUBLIC_KEY,
  isFlutterwaveConfigured,
  type PlanId,
} from '@/lib/flutterwave';

type ExchangeRates = { rates: Record<string, number>; base: string };

export default function SubscribePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [paying, setPaying] = useState<PlanId | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const ratesQuery = useQuery<ExchangeRates>({
    queryKey: ['/api/payment/rates'],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const res = await fetch('/api/payment/rates', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch exchange rates');
      return res.json();
    },
  });

  // Load Flutterwave SDK
  useEffect(() => {
    loadFlutterwaveSDK()
      .then(() => setSdkReady(true))
      .catch(() => setSdkReady(false));
  }, []);

  const verifyMutation = useMutation({
    mutationFn: async ({ transactionId, planId }: { transactionId: string | number; planId: string }) =>
      apiRequest('POST', '/api/payment/flutterwave/verify', { transactionId, planId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ title: 'Subscription activated!', description: 'Welcome to your new plan.' });
      navigate('/app/messages');
    },
    onError: (e: any) => {
      toast({ variant: 'destructive', title: 'Activation failed', description: e?.message || 'Try again or contact support.' });
    },
  });

  const reportErrorMutation = useMutation({
    mutationFn: async (details: any) => apiRequest('POST', '/api/payment/card-error', details),
  });

  const countryCode = (user?.country || 'US').toUpperCase();
  const { currency, symbol } = getCurrencyForCountry(countryCode);
  const rates = ratesQuery.data?.rates;
  const rate = rates ? (rates[currency] ?? 1) : null;

  const getLocalPrice = (usd: number) => {
    if (!rate) return null;
    return convertPrice(usd, rate);
  };

  const pay = async (plan: typeof SUBSCRIPTION_PLANS[number]) => {
    if (!user) return navigate('/');
    if (!isFlutterwaveConfigured() || !sdkReady) {
      toast({ variant: 'destructive', title: 'Payment not configured', description: 'Flutterwave keys are not set up yet. Please contact the administrator.' });
      return;
    }
    const localPrice = getLocalPrice(plan.usdPrice);
    if (localPrice === null) {
      toast({ variant: 'destructive', title: 'Exchange rates unavailable', description: 'Please try again in a moment.' });
      return;
    }

    setPaying(plan.id as PlanId);
    const txRef = generateTxRef(user.id, plan.id);

    const flw = (window as any).FlutterwaveCheckout;
    if (!flw) {
      toast({ variant: 'destructive', title: 'Payment SDK not loaded', description: 'Please refresh the page and try again.' });
      setPaying(null);
      return;
    }

    flw({
      public_key: FLW_PUBLIC_KEY,
      tx_ref: txRef,
      amount: localPrice,
      currency,
      payment_options: 'card,banktransfer,ussd,mobilemoney',
      customer: {
        email: user.email || `user${user.id}@cleverdatematch.app`,
        phone_number: user.phone || '',
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'User',
      },
      customizations: {
        title: 'Clever Date Match',
        description: `${plan.name} subscription — ${plan.period}`,
        logo: 'https://cleverdatematch.app/icon-192.png',
      },
      callback: async (response: any) => {
        setPaying(null);
        if (response.status === 'successful' || response.status === 'completed') {
          verifyMutation.mutate({ transactionId: response.transaction_id, planId: plan.id });
        } else {
          reportErrorMutation.mutate({
            userId: user.id,
            email: user.email,
            planId: plan.id,
            flwStatus: response.status,
            txRef,
          });
          toast({ variant: 'destructive', title: 'Payment failed', description: 'Your card could not be charged. Our team has been notified.' });
        }
      },
      onclose: () => {
        if (paying) setPaying(null);
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a237e] via-[#1565c0] to-[#0d47a1] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <Button
            variant="ghost"
            className="text-white/70 hover:text-white mb-4"
            onClick={() => navigate('/app/messages')}
          >
            ← Back
          </Button>
          <h1 className="text-4xl font-bold text-white font-poppins mb-2">Choose your plan</h1>
          <p className="text-white/80 text-lg">
            Pay in your local currency — rates updated in real time
          </p>
          {currency !== 'USD' && rate && (
            <div className="inline-flex items-center gap-1 mt-2 bg-white/10 rounded-full px-4 py-1 text-white/80 text-sm">
              <Globe className="h-3.5 w-3.5" />
              1 USD = {symbol}{rate?.toLocaleString('en', { maximumFractionDigits: 2 })} {currency}
              {ratesQuery.isLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
            </div>
          )}
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const localPrice = getLocalPrice(plan.usdPrice);
            const isPaying = paying === plan.id || verifyMutation.isPending;

            return (
              <Card
                key={plan.id}
                className={`relative overflow-hidden border-0 shadow-2xl ${plan.badge === 'Best Value' ? 'ring-2 ring-yellow-400 scale-105' : ''}`}
              >
                {plan.badge && (
                  <div className={`absolute top-0 left-0 right-0 py-1.5 text-center text-xs font-bold text-white bg-gradient-to-r ${plan.color}`}>
                    {plan.badge}
                  </div>
                )}
                <CardHeader className={`bg-gradient-to-r ${plan.color} text-white pt-${plan.badge ? '10' : '6'} pb-6`}>
                  <CardTitle className="text-xl font-poppins">{plan.name}</CardTitle>
                  <div className="mt-1">
                    {ratesQuery.isLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-white/80 text-sm">Loading price...</span>
                      </div>
                    ) : (
                      <>
                        <div className="text-3xl font-bold">
                          {localPrice !== null ? formatPrice(localPrice, symbol) : `$${plan.usdPrice}`}
                        </div>
                        <div className="text-white/80 text-sm">
                          per {plan.period}
                          {currency !== 'USD' && localPrice !== null && (
                            <span className="ml-1 opacity-70">(≈ ${plan.usdPrice} USD)</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-5 pb-6 space-y-3">
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full mt-4 bg-gradient-to-r ${plan.color} text-white border-0 hover:opacity-90`}
                    onClick={() => pay(plan)}
                    disabled={isPaying || ratesQuery.isLoading}
                  >
                    {isPaying ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing...</>
                    ) : (
                      <><CreditCard className="h-4 w-4 mr-2" />Subscribe</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Trial banner */}
        {(user as any)?.trialActivated && (
          <div className="bg-green-500/20 border border-green-400/40 rounded-2xl p-5 text-center text-white mb-6">
            <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-300" />
            <p className="font-semibold">You have an active free trial!</p>
            <p className="text-white/80 text-sm mt-1">
              Enjoy full Basic access until{' '}
              {(user as any).trialExpiresAt
                ? new Date((user as any).trialExpiresAt).toLocaleDateString()
                : 'your trial ends'}
              . Subscribe above to continue after that.
            </p>
          </div>
        )}

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-6 text-white/70 text-sm">
          <div className="flex items-center gap-1.5"><Shield className="h-4 w-4" />Secure Flutterwave checkout</div>
          <div className="flex items-center gap-1.5"><Globe className="h-4 w-4" />Real exchange rates</div>
          <div className="flex items-center gap-1.5"><CreditCard className="h-4 w-4" />Cards, bank transfer, USSD, mobile money</div>
        </div>

        {!isFlutterwaveConfigured() && (
          <div className="mt-8 bg-yellow-500/20 border border-yellow-400/40 rounded-xl p-4 flex items-start gap-3 text-white">
            <AlertCircle className="h-5 w-5 text-yellow-300 flex-shrink-0 mt-0.5" />
            <p className="text-sm">
              <strong>Developer notice:</strong> Flutterwave public key (VITE_FLUTTERWAVE_PUBLIC_KEY) is not set. Payments are disabled. Add the key in the Replit Secrets panel to enable live payments.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
