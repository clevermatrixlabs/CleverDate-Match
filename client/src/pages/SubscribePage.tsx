import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Shield, Globe, CreditCard, Sparkles, AlertCircle } from 'lucide-react';
import { SUBSCRIPTION_PLANS, type PlanId } from '@/lib/subscription-plans';
import PayPalButton from '@/components/PayPalButton';

type PayPalConfig = {
  configured: boolean;
  hasCredentials?: boolean;
  clientId: string | null;
  environment: 'sandbox' | 'live';
  currency: 'USD';
  isLive?: boolean;
  isSandbox?: boolean;
};

export default function SubscribePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>('silver');

  const { data: paypalConfig } = useQuery<PayPalConfig>({
    queryKey: ['/api/payment/paypal/config'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/payment/paypal/config', { credentials: 'include' });
        if (!res.ok) {
          return { configured: false, clientId: null, environment: 'sandbox', currency: 'USD' };
        }
        return res.json();
      } catch {
        return { configured: false, clientId: null, environment: 'sandbox', currency: 'USD' };
      }
    },
    staleTime: 60_000,
  });

  const environment = paypalConfig?.environment || 'sandbox';
  const isLive = environment === 'live';
  const hasCredentials = paypalConfig?.hasCredentials ?? false;

  return (
    <div className="min-h-full bg-gradient-to-br from-[#1a237e] via-[#1565c0] to-[#0d47a1] py-8 pb-24 px-4 rounded-2xl mx-auto max-w-5xl shadow-xl">
      <div className="max-w-4xl mx-auto">
        {/* Navigation & Header */}
        <div className="text-center mb-8">
          <Button
            variant="ghost"
            className="text-white/80 hover:text-white mb-2 bg-white/10 hover:bg-white/20 rounded-full text-xs px-3"
            onClick={() => navigate('~/app/')}
          >
            ← Back to Matches
          </Button>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white font-poppins mb-2 tracking-tight">
            VIP Subscription Plans 👑
          </h1>
          <p className="text-white/80 text-sm sm:text-base">
            Every plan includes full 1-on-1 dating access — simply choose your duration in months
          </p>

          {/* Environment Status Badge */}
          <div className="inline-flex items-center gap-2 mt-3 px-3.5 py-1.5 rounded-full text-xs font-medium border shadow-sm backdrop-blur-sm transition-all bg-white/10 border-white/20 text-white">
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <Globe className="h-3.5 w-3.5 opacity-80" />
            <span>
              {isLive
                ? 'PayPal Live Mode Active'
                : 'PayPal Sandbox Testing Mode'}
            </span>
          </div>
        </div>

        {/* Subscription Plan Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const planId = plan.id as PlanId;
            const isSelected = selectedPlanId === planId;

            return (
              <Card
                key={plan.id}
                onClick={() => setSelectedPlanId(planId)}
                className={`relative overflow-hidden border-2 transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'ring-4 ring-yellow-400/80 border-yellow-400 scale-[1.02] shadow-2xl'
                    : 'border-transparent hover:border-white/30 shadow-xl'
                }`}
              >
                {plan.badge && (
                  <div className={`absolute top-0 left-0 right-0 py-1.5 text-center text-xs font-bold text-white bg-gradient-to-r ${plan.color}`}>
                    {plan.badge}
                  </div>
                )}
                <CardHeader className={`bg-gradient-to-r ${plan.color} text-white pt-${plan.badge ? '10' : '6'} pb-6`}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-poppins font-bold">{plan.name}</CardTitle>
                    {isSelected && (
                      <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <div className="text-3xl font-extrabold tracking-tight">${plan.usdPrice.toFixed(2)}</div>
                    <div className="text-white/80 text-sm">per {plan.period}</div>
                  </div>
                </CardHeader>

                <CardContent className="pt-5 pb-6 space-y-4 bg-white flex flex-col justify-between">
                  <ul className="space-y-2.5 min-h-[140px]">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Integrated Reusable PayPalButton */}
                  <div className="pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                    <PayPalButton
                      planId={planId}
                      buttonText={`Subscribe to ${plan.name} ($${plan.usdPrice.toFixed(2)})`}
                      buttonStyle={{
                        layout: 'vertical',
                        color: 'gold',
                        shape: 'rect',
                        label: 'paypal',
                        height: 44,
                      }}
                      onSuccess={() => {
                        navigate('~/app/messages');
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Free trial notification if active */}
        {(user as any)?.trialActivated && (
          <div className="bg-emerald-500/20 border border-emerald-400/40 rounded-2xl p-5 text-center text-white mb-6 backdrop-blur-sm shadow-md">
            <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-emerald-300" />
            <p className="font-semibold">You have an active 1-week free trial!</p>
            <p className="text-white/80 text-sm mt-1">
              Enjoy full 1-on-1 dating access until{' '}
              {(user as any).trialExpiresAt
                ? new Date((user as any).trialExpiresAt).toLocaleDateString()
                : 'your trial ends'}
              . Add your card or PayPal above to continue after your 7-day trial.
            </p>
          </div>
        )}

        {/* Security badges */}
        <div className="flex flex-wrap justify-center gap-6 text-white/80 text-sm mb-6">
          <div className="flex items-center gap-1.5 font-medium"><Shield className="h-4 w-4 text-emerald-300" /> Protected by PayPal</div>
          <div className="flex items-center gap-1.5 font-medium"><Globe className="h-4 w-4 text-sky-300" /> Available Worldwide</div>
          <div className="flex items-center gap-1.5 font-medium"><CreditCard className="h-4 w-4 text-amber-300" /> Cards, Bank & PayPal Balance</div>
        </div>

        {/* Explanation Banner: Sandbox vs Live & Setup (only shown in Sandbox mode) */}
        {!isLive && (
          <div className="mt-8 bg-amber-500/15 border border-amber-400/30 rounded-2xl p-5 text-white backdrop-blur-sm shadow-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-amber-300 flex-shrink-0 mt-0.5" />
              <div className="text-sm space-y-2">
                <p className="font-bold text-amber-200 text-base">
                  Why Sandbox and How Live PayPal Payments Work
                </p>
                <p className="text-white/90 text-xs sm:text-sm leading-relaxed">
                  <strong>1. Why is it in Sandbox?</strong> PayPal applications default to <em>Sandbox Testing Mode</em> so that developers and owners can test checkout buttons and subscription activations freely without incurring real credit card charges.
                </p>
                <p className="text-white/90 text-xs sm:text-sm leading-relaxed">
                  <strong>2. Ready for testing now:</strong> You can click any plan button above right now! The PayPal button will trigger standard PayPal checkout and instantly activate your VIP subscription.
                </p>
                <p className="text-white/90 text-xs sm:text-sm leading-relaxed">
                  <strong>3. How to switch to Live mode:</strong> In your environment variables (or PayPal settings), provide your live credentials:
                </p>
                <div className="bg-black/30 p-2.5 rounded-xl font-mono text-xs text-amber-100 flex flex-col gap-1 border border-white/10">
                  <span>PAYPAL_CLIENT_ID=&lt;your_live_paypal_client_id&gt;</span>
                  <span>PAYPAL_CLIENT_SECRET=&lt;your_live_paypal_client_secret&gt;</span>
                  <span>PAYPAL_ENVIRONMENT=live</span>
                </div>
                <p className="text-white/80 text-xs">
                  As soon as <code className="bg-white/10 px-1 py-0.5 rounded text-amber-200">PAYPAL_ENVIRONMENT=live</code> is provided with your live credentials, the app automatically switches to real Live PayPal payments!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}