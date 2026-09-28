import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Loader2, CreditCard, Shield, Globe, AlertCircle } from 'lucide-react';
import { SUBSCRIPTION_PLANS, type PlanId } from '@/lib/subscription-plans';

type PayPalConfig = {
  configured: boolean;
  clientId: string | null;
  environment: 'sandbox' | 'live';
  currency: 'USD';
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

function PayPalPlanButton({
  planId,
  sdkReady,
  disabled,
  onStart,
  createOrder,
  captureOrder,
  onFinish,
  onError,
}: {
  planId: PlanId;
  sdkReady: boolean;
  disabled: boolean;
  onStart: () => void;
  createOrder: (planId: PlanId) => Promise<string>;
  captureOrder: (orderId: string, planId: PlanId) => Promise<void>;
  onFinish: () => void;
  onError: (error: unknown) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sdkReady || disabled || !window.paypal || !containerRef.current) return;

    let buttons: PayPalButtonInstance | undefined;
    try {
      buttons = window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'rect', label: 'paypal', height: 44 },
        createOrder: async () => {
          onStart();
          return createOrder(planId);
        },
        onApprove: async ({ orderID }) => {
          try {
            await captureOrder(orderID, planId);
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
  }, [captureOrder, createOrder, disabled, onError, onFinish, onStart, planId, sdkReady]);

  return <div ref={containerRef} className="min-h-[44px]" />;
}

export default function SubscribePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [paying, setPaying] = useState<PlanId | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const paypalConfigQuery = useQuery<PayPalConfig>({
    queryKey: ['/api/payment/paypal/config'],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch('/api/payment/paypal/config', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load PayPal configuration');
      return res.json();
    },
  });

  useEffect(() => {
    const clientId = paypalConfigQuery.data?.clientId;
    if (!clientId) {
      setSdkReady(false);
      return;
    }
    if (window.paypal) {
      setSdkReady(true);
      return;
    }

    const existing = document.getElementById('paypal-sdk') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => setSdkReady(true), { once: true });
      existing.addEventListener('error', () => setSdkReady(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'paypal-sdk';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons&commit=true`;
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setSdkReady(false);
    document.body.appendChild(script);
  }, [paypalConfigQuery.data?.clientId]);

  const captureMutation = useMutation({
    mutationFn: async ({ orderId, planId }: { orderId: string; planId: PlanId }) =>
      apiRequest('POST', '/payment/paypal/capture-order', { orderId, planId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ title: 'Subscription activated!', description: 'Welcome to your new plan.' });
      navigate('/app/messages');
    },
  });

  const createOrder = useCallback(async (planId: PlanId) => {
    try {
      const result = await apiRequest('POST', '/payment/paypal/create-order', { planId });
      if (!result?.orderId) throw new Error('PayPal did not return an order ID');
      return result.orderId as string;
    } catch (error: any) {
      setPaying(null);
      toast({
        variant: 'destructive',
        title: 'PayPal checkout unavailable',
        description: error?.message || 'Please try again in a moment.',
      });
      throw error;
    }
  }, [toast]);

  const captureOrder = useCallback(async (orderId: string, planId: PlanId) => {
    try {
      await captureMutation.mutateAsync({ orderId, planId });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Payment verification failed',
        description: 'PayPal could not confirm this payment. Please contact support before trying again.',
      });
    }
  }, [captureMutation, toast]);

  const onPayPalError = useCallback((error: unknown) => {
    console.error('PayPal checkout error:', error);
    toast({
      variant: 'destructive',
      title: 'PayPal checkout failed',
      description: 'The payment was not completed. Please try again.',
    });
  }, [toast]);

  const paypalConfigured = paypalConfigQuery.data?.configured === true;
  const isLoadingPayPal = paypalConfigQuery.isLoading || (paypalConfigured && !sdkReady);
  const environment = paypalConfigQuery.data?.environment;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a237e] via-[#1565c0] to-[#0d47a1] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <Button
            variant="ghost"
            className="text-white/70 hover:text-white mb-4"
            onClick={() => navigate('/app/messages')}
          >
            ← Back
          </Button>
          <h1 className="text-4xl font-bold text-white font-poppins mb-2">Choose your plan</h1>
          <p className="text-white/80 text-lg">Secure subscription checkout through PayPal Business</p>
          {environment === 'sandbox' && (
            <div className="inline-flex items-center gap-1 mt-2 bg-amber-400/20 border border-amber-200/30 rounded-full px-4 py-1 text-amber-100 text-sm">
              <Globe className="h-3.5 w-3.5" />
              PayPal sandbox testing mode
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const isPaying = paying === plan.id || captureMutation.isLoading;
            const planId = plan.id as PlanId;

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
                    <div className="text-3xl font-bold">${plan.usdPrice.toFixed(2)}</div>
                    <div className="text-white/80 text-sm">per {plan.period}</div>
                  </div>
                </CardHeader>
                <CardContent className="pt-5 pb-6 space-y-3">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-2">
                    {isLoadingPayPal ? (
                      <div className="h-11 flex items-center justify-center gap-2 rounded-md border bg-gray-50 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading PayPal...
                      </div>
                    ) : paypalConfigured && sdkReady ? (
                      <PayPalPlanButton
                        planId={planId}
                        sdkReady={sdkReady}
                        disabled={!!paying && paying !== planId}
                        onStart={() => setPaying(planId)}
                        createOrder={createOrder}
                        captureOrder={captureOrder}
                        onFinish={() => setPaying(null)}
                        onError={onPayPalError}
                      />
                    ) : (
                      <div className="h-11 flex items-center justify-center rounded-md border bg-gray-50 text-sm text-gray-500">
                        PayPal checkout unavailable
                      </div>
                    )}
                  </div>
                  {isPaying && (
                    <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Processing securely with PayPal...
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

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

        <div className="flex flex-wrap justify-center gap-6 text-white/70 text-sm">
          <div className="flex items-center gap-1.5"><Shield className="h-4 w-4" />Protected by PayPal</div>
          <div className="flex items-center gap-1.5"><Globe className="h-4 w-4" />Available worldwide</div>
          <div className="flex items-center gap-1.5"><CreditCard className="h-4 w-4" />Cards and PayPal balance</div>
        </div>

        {!paypalConfigQuery.isLoading && !paypalConfigured && (
          <div className="mt-8 bg-yellow-500/20 border border-yellow-400/40 rounded-xl p-4 flex items-start gap-3 text-white">
            <AlertCircle className="h-5 w-5 text-yellow-300 flex-shrink-0 mt-0.5" />
            <p className="text-sm">
              <strong>Developer notice:</strong> PayPal Business credentials are not configured. Add
              {' '}PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in the Replit Secrets panel to enable payments.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}