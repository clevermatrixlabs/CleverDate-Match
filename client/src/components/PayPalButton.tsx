import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { PlanId } from '@/lib/subscription-plans';

export type PayPalConfig = {
  configured: boolean;
  hasCredentials?: boolean;
  clientId: string | null;
  environment: 'sandbox' | 'live';
  currency: 'USD';
  isLive?: boolean;
  isSandbox?: boolean;
};

export interface PayPalButtonProps {
  planId?: PlanId | string;
  type?: 'subscription' | 'gift' | 'deposit';
  amount?: string | number;
  currency?: string;
  giftId?: string;
  recipientId?: number;
  note?: string;
  disabled?: boolean;
  buttonText?: string;
  buttonStyle?: {
    layout?: 'vertical' | 'horizontal';
    color?: 'gold' | 'blue' | 'silver' | 'white' | 'black';
    shape?: 'rect' | 'pill';
    label?: 'paypal' | 'checkout' | 'buynow';
    height?: number;
  };
  onStart?: () => void;
  onSuccess?: (details: any) => void;
  onError?: (error: unknown) => void;
  onCancel?: () => void;
  className?: string;
}

export default function PayPalButton({
  planId,
  type = 'subscription',
  amount,
  currency = 'USD',
  giftId,
  recipientId,
  note,
  disabled = false,
  buttonText = 'Pay with PayPal',
  buttonStyle = {
    layout: 'vertical',
    color: 'gold',
    shape: 'rect',
    label: 'paypal',
    height: 44,
  },
  onStart,
  onSuccess,
  onError,
  onCancel,
  className = '',
}: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [sdkReady, setSdkReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const isMountedRef = useRef(true);

  // Fetch PayPal runtime configuration
  const { data: config, isLoading: isConfigLoading } = useQuery<PayPalConfig>({
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

  // Dynamically load PayPal JavaScript SDK
  useEffect(() => {
    isMountedRef.current = true;
    const clientId = config?.clientId;
    if (!clientId) {
      setSdkReady(false);
      return;
    }

    if (window.paypal) {
      setSdkReady(true);
      return;
    }

    const scriptId = 'paypal-sdk-js';
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      if (existing.getAttribute('data-client-id') === clientId) {
        existing.addEventListener('load', () => isMountedRef.current && setSdkReady(true));
        return;
      }
      existing.remove();
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.setAttribute('data-client-id', clientId);
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      clientId
    )}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons&commit=true`;
    script.async = true;
    script.onload = () => {
      if (isMountedRef.current) setSdkReady(true);
    };
    script.onerror = () => {
      if (isMountedRef.current) setSdkReady(false);
    };

    document.body.appendChild(script);

    return () => {
      isMountedRef.current = false;
    };
  }, [config?.clientId, currency]);

  // Create order handler
  const handleCreateOrder = useCallback(async (): Promise<string> => {
    setIsProcessing(true);
    onStart?.();
    try {
      const payload: any = {
        type,
        currency,
      };
      if (planId) payload.planId = planId;
      if (giftId) payload.giftId = giftId;
      if (recipientId) payload.recipientId = recipientId;
      if (note) payload.note = note;
      if (amount !== undefined) payload.amount = amount;

      const res = await apiRequest('POST', '/payment/paypal/create-order', payload);
      if (!res?.orderId) {
        throw new Error(res?.message || 'PayPal order creation failed');
      }
      return res.orderId;
    } catch (err: any) {
      setIsProcessing(false);
      const errMsg = err?.message || 'Could not initiate PayPal checkout';
      toast({
        variant: 'destructive',
        title: 'Checkout Error',
        description: errMsg,
      });
      onError?.(err);
      throw err;
    }
  }, [amount, currency, giftId, note, onError, onStart, planId, recipientId, toast, type]);

  // Capture order handler
  const handleApprove = useCallback(
    async (data: { orderID: string }) => {
      setIsProcessing(true);
      try {
        const payload: any = {
          orderId: data.orderID,
          type,
        };
        if (planId) payload.planId = planId;
        if (giftId) payload.giftId = giftId;
        if (recipientId) payload.recipientId = recipientId;
        if (note) payload.note = note;

        const result = await apiRequest('POST', '/payment/paypal/capture-order', payload);
        await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });

        toast({
          title: 'Payment Successful! 🎉',
          description:
            result?.message ||
            (type === 'subscription' ? 'Your subscription has been activated.' : 'Your payment was completed successfully.'),
        });

        onSuccess?.(result);
      } catch (err: any) {
        const errMsg = err?.message || 'Payment capture failed. Please contact support.';
        toast({
          variant: 'destructive',
          title: 'Payment Failed',
          description: errMsg,
        });
        onError?.(err);
      } finally {
        setIsProcessing(false);
      }
    },
    [giftId, note, onError, onSuccess, planId, recipientId, toast, type]
  );

  // Render PayPal SDK Buttons inside container
  useEffect(() => {
    if (!sdkReady || disabled || !(window as any).paypal || !containerRef.current) return;

    let buttonsInstance: any = undefined;
    const container = containerRef.current;
    container.innerHTML = '';

    try {
      buttonsInstance = (window as any).paypal.Buttons({
        style: buttonStyle,
        createOrder: handleCreateOrder,
        onApprove: handleApprove,
        onCancel: () => {
          setIsProcessing(false);
          onCancel?.();
        },
        onError: (err: any) => {
          setIsProcessing(false);
          onError?.(err);
        },
      });

      buttonsInstance.render(container).catch((_err: any) => {
        setIsProcessing(false);
        // Clean fallback if render interrupted
      });
    } catch (_err: any) {
      setIsProcessing(false);
    }

    return () => {
      if (buttonsInstance?.close) {
        try {
          void buttonsInstance.close();
        } catch {}
      }
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [buttonStyle, disabled, handleApprove, handleCreateOrder, onCancel, onError, sdkReady]);

  // Direct manual trigger fallback if SDK is loading or in test mode
  const handleManualCheckout = async () => {
    if (disabled || isProcessing) return;
    try {
      const orderId = await handleCreateOrder();
      await handleApprove({ orderID: orderId });
    } catch {}
  };

  if (isConfigLoading) {
    return (
      <div className={`h-11 flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 text-xs text-white/70 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
        <span>Loading PayPal Gateway...</span>
      </div>
    );
  }

  return (
    <div className={`relative min-h-[44px] ${className}`}>
      {/* Container for standard PayPal SDK button iframe */}
      <div
        ref={containerRef}
        className={`w-full transition-opacity duration-200 ${
          sdkReady && !disabled ? 'opacity-100' : 'hidden'
        }`}
      />

      {/* Fallback button when SDK is initializing or in simulated checkout */}
      {(!sdkReady || disabled) && (
        <button
          type="button"
          onClick={handleManualCheckout}
          disabled={disabled || isProcessing}
          className="w-full h-11 px-4 rounded-xl font-bold text-slate-950 bg-[#ffc439] hover:bg-[#f4bb36] active:bg-[#e0ac32] transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processing PayPal...</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.804 1.57 1.173.983 1.706 2.454 1.543 4.254-.374 4.12-2.73 6.368-6.84 6.368H9.986l-1.39 7.804a.641.641 0 0 1-.633.541h-.887z" fill="#003087" />
                <path d="M9.197 14.772l1.39-7.804h3.98c4.11 0 6.466-2.248 6.84-6.368.163-1.8-.37-3.271-1.543-4.254C18.638-.684 16.63 0 14.06 0H6.6c-.524 0-.972.382-1.054.901L2.44 21.396a.641.641 0 0 0 .633.74h4.606l1.518-7.364z" fill="#0079C1" />
              </svg>
              <span>{buttonText}</span>
            </>
          )}
        </button>
      )}

      {isProcessing && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-slate-800">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span>Confirming with PayPal...</span>
        </div>
      )}
    </div>
  );
}
