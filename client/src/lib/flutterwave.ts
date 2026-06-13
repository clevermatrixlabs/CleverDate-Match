// ── Flutterwave helpers ──────────────────────────────────────────────────────

export const SUBSCRIPTION_PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    usdPrice: 15,
    period: '1 month',
    durationMonths: 1,
    features: ['Unlimited messaging', 'See who liked you', 'Basic filters'],
    color: 'from-blue-500 to-blue-700',
    badge: '',
  },
  {
    id: 'silver',
    name: 'Silver',
    usdPrice: 45,
    period: '3 months',
    durationMonths: 3,
    features: ['Everything in Basic', 'Priority matches', 'Read receipts', 'Profile boost (1×/week)'],
    color: 'from-slate-400 to-slate-600',
    badge: 'Popular',
  },
  {
    id: 'gold',
    name: 'Gold',
    usdPrice: 110,
    period: '7 months',
    durationMonths: 7,
    features: ['Everything in Silver', 'Profile boost (3×/week)', 'Super likes', 'Incognito mode', 'Advanced filters'],
    color: 'from-yellow-500 to-amber-600',
    badge: 'Best Value',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    usdPrice: 29.99,
    period: '1 month',
    durationMonths: 1,
    features: ['Everything in Gold', 'Gift sending', 'Video calls', 'Dedicated support', 'Unlimited boosts'],
    color: 'from-purple-500 to-indigo-700',
    badge: 'Premium',
  },
] as const;

export type PlanId = 'basic' | 'silver' | 'gold' | 'diamond';

// Countries and their Flutterwave-supported currencies
const COUNTRY_CURRENCY: Record<string, { currency: string; symbol: string }> = {
  NG: { currency: 'NGN', symbol: '₦' },
  GH: { currency: 'GHS', symbol: 'GH₵' },
  KE: { currency: 'KES', symbol: 'KSh' },
  ZA: { currency: 'ZAR', symbol: 'R' },
  UG: { currency: 'UGX', symbol: 'USh' },
  TZ: { currency: 'TZS', symbol: 'TSh' },
  RW: { currency: 'RWF', symbol: 'FRw' },
  US: { currency: 'USD', symbol: '$' },
  GB: { currency: 'GBP', symbol: '£' },
  CA: { currency: 'CAD', symbol: 'C$' },
  AU: { currency: 'AUD', symbol: 'A$' },
  ZM: { currency: 'ZMW', symbol: 'ZK' },
  MW: { currency: 'MWK', symbol: 'MK' },
  ET: { currency: 'ETB', symbol: 'Br' },
  SL: { currency: 'SLE', symbol: 'Le' },
  CM: { currency: 'XAF', symbol: 'FCFA' },
};

export function getCurrencyForCountry(countryCode: string) {
  return COUNTRY_CURRENCY[countryCode?.toUpperCase()] ?? { currency: 'USD', symbol: '$' };
}

/** Convert a USD price to the local currency using live rates fetched by the app */
export function convertPrice(usd: number, rate: number): number {
  return Math.ceil(usd * rate * 100) / 100;
}

/** Format a price nicely e.g. "₦25,000" */
export function formatPrice(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Generate a unique Flutterwave tx_ref */
export function generateTxRef(userId: number, planId: string): string {
  return `TCD-${userId}-${planId}-${Date.now()}`;
}

/** Load the Flutterwave inline SDK (idempotent) */
export function loadFlutterwaveSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById('flutterwave-sdk')) { resolve(); return; }
    const script = document.createElement('script');
    script.id = 'flutterwave-sdk';
    script.src = 'https://checkout.flutterwave.com/v3.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Flutterwave SDK'));
    document.body.appendChild(script);
  });
}

export const FLW_PUBLIC_KEY = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY as string | undefined;
export const isFlutterwaveConfigured = () => !!FLW_PUBLIC_KEY;
