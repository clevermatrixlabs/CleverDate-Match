import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { useMatch } from '@/context/MatchContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { STORE_GIFTS, type StoreGift } from '../../../shared/schema';
import { 
  Gift, 
  Heart, 
  Sparkles, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  CreditCard,
  X,
  MessageCircle,
  History,
  ShoppingBag,
  Flame,
  Award
} from 'lucide-react';

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

function PayPalGiftCheckoutButton({
  gift,
  recipientId,
  note,
  sdkReady,
  disabled,
  onStart,
  onFinish,
  onSuccess,
  onError,
}: {
  gift: StoreGift;
  recipientId: number | null;
  note: string;
  sdkReady: boolean;
  disabled: boolean;
  onStart: () => void;
  onFinish: () => void;
  onSuccess: (data: any) => void;
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
          const res = await apiRequest('POST', '/payment/paypal/create-order', {
            type: 'gift',
            giftId: gift.id,
            recipientId: recipientId || undefined,
            note: note || undefined,
          });
          if (!res?.orderId) {
            throw new Error(res?.message || 'Could not start PayPal payment');
          }
          return res.orderId;
        },
        onApprove: async ({ orderID }) => {
          try {
            const result = await apiRequest('POST', '/payment/paypal/capture-order', {
              orderId: orderID,
              type: 'gift',
              giftId: gift.id,
              recipientId: recipientId || undefined,
              note: note || undefined,
            });
            onSuccess(result);
          } finally {
            onFinish();
          }
        },
        onCancel: () => onFinish(),
        onError: (err) => {
          onFinish();
          onError(err);
        },
      });

      buttons.render(containerRef.current).catch((err) => {
        onFinish();
        onError(err);
      });
    } catch (err) {
      onFinish();
      onError(err);
    }

    return () => {
      if (buttons?.close) void buttons.close();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [disabled, gift.id, note, onError, onFinish, onStart, onSuccess, recipientId, sdkReady]);

  return <div ref={containerRef} className="min-h-[44px]" />;
}

export default function GiftStorePage() {
  const { user } = useAuth();
  const { matchedUser } = useMatch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'catalog' | 'history'>('catalog');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'romantic' | 'luxury' | 'fun'>('all');
  const [selectedGift, setSelectedGift] = useState<StoreGift | null>(null);
  const [giftNote, setGiftNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sentCelebration, setSentCelebration] = useState<{ gift: StoreGift; recipientName: string } | null>(null);
  const [sdkReady, setSdkReady] = useState(Boolean(typeof window !== 'undefined' && window.paypal));

  // Query PayPal configuration
  const paypalConfigQuery = useQuery<PayPalConfig>({
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
    retry: 1,
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
        description: 'Unable to reach payment services. Please check your internet connection.',
      });
    };
    document.body.appendChild(script);
  }, [paypalConfigQuery.data?.clientId, toast]);

  // Query gift transactions / history
  const transactionsQuery = useQuery({
    queryKey: ['/api/wallet/transactions'],
    queryFn: async () => {
      const res = await fetch('/api/wallet/transactions', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const giftTransactions = (transactionsQuery.data || []).filter((tx: any) => tx.type === 'gift');

  const filteredGifts = STORE_GIFTS.filter(gift => {
    if (selectedCategory === 'all') return true;
    return gift.category === selectedCategory;
  });

  const targetRecipientName = matchedUser
    ? [matchedUser.firstName, matchedUser.lastName].filter(Boolean).join(' ') || 'Your Match'
    : 'Your Match';

  const quickNotes = [
    'Thinking of you! ❤️',
    'A little gift to make you smile 🌹',
    'You look stunning today ✨',
    'Cheers to our connection 🥂',
    'Can’t wait to talk soon! 💖',
  ];

  return (
    <div className="px-4 pb-20 space-y-4 max-w-2xl mx-auto">
      {/* Hero Banner */}
      <Card className="overflow-hidden shadow-md border-0">
        <div className="bg-gradient-to-br from-[#880e4f] via-[#c2185b] to-[#e91e63] p-6 text-white relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-sm flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-yellow-300" /> Direct PayPal Checkout
            </span>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight mb-2">Gift Store 🎁</h2>
          <p className="text-white/90 text-sm max-w-md leading-relaxed">
            Send romantic flowers, luxury presents, and sweet surprises directly to your match with instant PayPal payment. No wallet needed!
          </p>

          {/* Tab buttons */}
          <div className="flex gap-2 mt-5">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'catalog'
                  ? 'bg-white text-pink-900 shadow-sm'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" /> Gift Catalog
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white text-pink-900 shadow-sm'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <History className="w-3.5 h-3.5" /> Gifts Sent ({giftTransactions.length})
            </button>
          </div>
        </div>
      </Card>

      {/* Main Content Area */}
      {activeTab === 'catalog' ? (
        <div className="space-y-4">
          {/* Category Filter Pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: 'All Gifts', icon: Sparkles },
              { id: 'romantic', label: '🌹 Romantic', icon: Heart },
              { id: 'luxury', label: '💎 Luxury & VIP', icon: Award },
              { id: 'fun', label: '🎉 Flirty & Fun', icon: Flame },
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                  selectedCategory === cat.id
                    ? 'bg-pink-600 text-white border-pink-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Active Match recipient preview bar */}
          {matchedUser ? (
            <div className="bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-200 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-pink-100 border-2 border-white shadow-sm flex items-center justify-center text-lg overflow-hidden shrink-0">
                  {matchedUser.profilePicture ? (
                    <img src={matchedUser.profilePicture} alt={targetRecipientName} className="w-full h-full object-cover" />
                  ) : (
                    '💖'
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Sending to current match:</p>
                  <p className="text-sm font-bold text-gray-900">{targetRecipientName}</p>
                </div>
              </div>
              <span className="text-xs font-bold text-pink-600 bg-pink-100/80 px-2.5 py-1 rounded-full">
                Connected
              </span>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>You don't have an active match selected yet. You can still buy gifts or send them to matches from chat!</span>
            </div>
          )}

          {/* Gifts Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredGifts.map((gift) => (
              <Card
                key={gift.id}
                className="overflow-hidden hover:shadow-lg transition-all duration-200 border-gray-200 hover:border-pink-300 flex flex-col justify-between group cursor-pointer"
                onClick={() => setSelectedGift(gift)}
              >
                <CardContent className="p-4 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-50 to-rose-100 flex items-center justify-center text-3xl mb-3 shadow-inner group-hover:scale-110 transition-transform">
                    {gift.emoji}
                  </div>
                  <h4 className="font-bold text-sm text-gray-900 line-clamp-1 mb-1">{gift.name}</h4>
                  <p className="text-[11px] text-gray-500 line-clamp-2 mb-3 min-h-[32px]">{gift.description}</p>
                  
                  <div className="w-full pt-2 border-t border-gray-100 flex items-center justify-between mt-auto">
                    <span className="text-base font-extrabold text-pink-600">
                      ${gift.price.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedGift(gift);
                      }}
                      className="bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 text-white rounded-xl px-3 py-1.5 text-xs font-bold shadow-sm transition-opacity"
                    >
                      Send 🎁
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        /* Sent Gifts History */
        <Card className="shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-5 h-5 text-pink-600" />
              <h3 className="font-bold text-gray-800 text-base">Your Gift Purchases & Deliveries</h3>
            </div>

            {transactionsQuery.isLoading ? (
              <div className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 animate-spin text-pink-600" />
                <span>Loading gift records…</span>
              </div>
            ) : giftTransactions.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-pink-50 mx-auto flex items-center justify-center text-2xl">
                  🎁
                </div>
                <p className="text-gray-700 font-bold text-sm">No gifts sent yet</p>
                <p className="text-gray-400 text-xs max-w-xs mx-auto">
                  Browse the catalog and surprise your match with a thoughtful romantic gift!
                </p>
                <Button
                  onClick={() => setActiveTab('catalog')}
                  className="mt-3 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold"
                >
                  Browse Gift Store
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {giftTransactions.map((tx: any) => {
                  const matchedGift = STORE_GIFTS.find(g => g.id === tx.planId);
                  return (
                    <div key={tx.id} className="py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-2xl shrink-0">
                          {matchedGift ? matchedGift.emoji : '🎁'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">
                            {matchedGift ? matchedGift.name : 'Virtual Gift'}
                          </p>
                          <p className="text-xs text-gray-400">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }) : 'Recently'}
                            {tx.paymentReference ? ` • Ref: ${tx.paymentReference.slice(0, 10)}…` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-pink-600">
                          ${parseFloat(tx.amount).toFixed(2)} USD
                        </p>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Delivered
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Selected Gift Checkout Modal */}
      {selectedGift && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-pink-600 to-rose-500 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Gift className="w-5 h-5 text-yellow-300" />
                <h3 className="font-extrabold text-lg">Send {selectedGift.name}</h3>
              </div>
              <button
                onClick={() => {
                  setSelectedGift(null);
                  setGiftNote('');
                }}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Gift Preview */}
              <div className="flex items-center gap-4 bg-pink-50/70 border border-pink-100 rounded-2xl p-4">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-4xl shrink-0">
                  {selectedGift.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-gray-900 text-base">{selectedGift.name}</h4>
                  <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{selectedGift.description}</p>
                  <p className="text-lg font-black text-pink-600 mt-1">${selectedGift.price.toFixed(2)} USD</p>
                </div>
              </div>

              {/* Recipient info */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Recipient</label>
                <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-sm">
                    💖
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">{targetRecipientName}</p>
                    <p className="text-[11px] text-gray-400">Gift will be delivered straight to their chat</p>
                  </div>
                </div>
              </div>

              {/* Romantic Note */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Personal Gift Note (Optional)</label>
                <textarea
                  value={giftNote}
                  onChange={(e) => setGiftNote(e.target.value)}
                  placeholder="Write a sweet message with this gift..."
                  rows={2}
                  className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none resize-none"
                  maxLength={150}
                />
                
                {/* Quick note pills */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {quickNotes.map((note) => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => setGiftNote(note)}
                      className="text-[11px] bg-pink-50 hover:bg-pink-100 text-pink-700 font-medium px-2.5 py-1 rounded-full transition-colors border border-pink-100"
                    >
                      {note}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Section */}
              <div className="pt-2 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1 font-semibold text-gray-700">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> Direct PayPal Checkout
                  </span>
                  <span className="font-bold text-gray-900 text-sm">${selectedGift.price.toFixed(2)} USD</span>
                </div>

                {paypalConfigured ? (
                  sdkReady ? (
                    <div className="pt-1">
                      <PayPalGiftCheckoutButton
                        gift={selectedGift}
                        recipientId={matchedUser ? matchedUser.id : null}
                        note={giftNote}
                        sdkReady={sdkReady}
                        disabled={isProcessing}
                        onStart={() => setIsProcessing(true)}
                        onFinish={() => setIsProcessing(false)}
                        onSuccess={(data) => {
                          setSelectedGift(null);
                          setGiftNote('');
                          queryClient.invalidateQueries({ queryKey: ['/api/wallet/transactions'] });
                          queryClient.invalidateQueries({ queryKey: ['/api/messages'] });
                          setSentCelebration({
                            gift: selectedGift,
                            recipientName: targetRecipientName,
                          });
                        }}
                        onError={(err: any) => {
                          toast({
                            variant: 'destructive',
                            title: 'Payment cancelled or failed',
                            description: err?.message || 'Please check your connection and try again.',
                          });
                        }}
                      />
                    </div>
                  ) : (
                    <div className="py-4 text-center text-xs text-gray-500 bg-gray-50 rounded-xl flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4 animate-spin text-pink-600" />
                      <span>Loading secure PayPal gateway…</span>
                    </div>
                  )
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                    <p className="font-bold text-amber-900">PayPal Gateway Setup Required</p>
                    <p>
                      Payments are processed directly through PayPal. Please configure your PayPal credentials in the admin dashboard to enable instant gift purchases.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Celebratory Success Modal */}
      {sentCelebration && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-pink-100 to-rose-200 flex items-center justify-center text-5xl mx-auto shadow-inner animate-bounce">
              {sentCelebration.gift.emoji}
            </div>

            <div className="space-y-1">
              <h3 className="font-extrabold text-xl text-gray-900">Gift Sent!</h3>
              <p className="text-sm text-gray-600">
                Your <span className="font-bold text-pink-600">{sentCelebration.gift.name}</span> has been paid and delivered to <span className="font-bold">{sentCelebration.recipientName}</span>!
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button
                onClick={() => {
                  setSentCelebration(null);
                  setLocation('/messages');
                }}
                className="w-full bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 text-white font-bold rounded-xl py-2.5 flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" /> View Chat with {sentCelebration.recipientName}
              </Button>
              <Button
                variant="outline"
                onClick={() => setSentCelebration(null)}
                className="w-full border-gray-200 rounded-xl py-2.5 font-semibold text-xs text-gray-600"
              >
                Back to Gift Store
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
