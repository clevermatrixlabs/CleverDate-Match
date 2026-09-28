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

export type PlanId = typeof SUBSCRIPTION_PLANS[number]['id'];