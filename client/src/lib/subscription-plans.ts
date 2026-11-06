export const FULL_ACCESS_FEATURES = [
  'Full 1-on-1 dating access',
  'Unlimited messaging with your match',
  'Video & voice calls',
  'Direct gift sending',
  'Verified member community',
] as const;

export const SUBSCRIPTION_PLANS = [
  {
    id: 'basic',
    name: '1 Month',
    usdPrice: 15,
    period: '1 month',
    durationMonths: 1,
    features: [...FULL_ACCESS_FEATURES],
    color: 'from-blue-500 to-blue-700',
    badge: '',
  },
  {
    id: 'silver',
    name: '3 Months',
    usdPrice: 45,
    period: '3 months',
    durationMonths: 3,
    features: [...FULL_ACCESS_FEATURES],
    color: 'from-slate-500 to-slate-700',
    badge: 'Popular',
  },
  {
    id: 'gold',
    name: '7 Months',
    usdPrice: 110,
    period: '7 months',
    durationMonths: 7,
    features: [...FULL_ACCESS_FEATURES],
    color: 'from-yellow-500 to-amber-600',
    badge: 'Best Value',
  },
  {
    id: 'diamond',
    name: '12 Months',
    usdPrice: 150,
    period: '12 months',
    durationMonths: 12,
    features: [...FULL_ACCESS_FEATURES],
    color: 'from-purple-500 to-indigo-700',
    badge: 'Annual',
  },
] as const;

export type PlanId = typeof SUBSCRIPTION_PLANS[number]['id'];