import { SubscriptionPlan } from '@/types';
import { useLocation } from 'wouter';

interface SubscriptionCardProps {
  plan: SubscriptionPlan;
}

export default function SubscriptionCard({ plan }: SubscriptionCardProps) {
  const [, setLocation] = useLocation();

  const handleSubscribe = () => {
    setLocation('~/app/subscribe');
  };

  return (
    <div className={`
      ${plan.highlight 
        ? 'bg-gradient-to-br from-secondary/5 to-secondary/10 border border-secondary' 
        : 'bg-white border border-gray-200'
      } 
      rounded-xl p-5 transition-all duration-300 subscription-card
    `}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-poppins font-bold text-[#212529]">{plan.name}</h3>
        {plan.badge && (
          <span className={`
            ${plan.highlight ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-700'} 
            px-2 py-1 rounded-full text-xs
          `}>
            {plan.badge}
          </span>
        )}
      </div>
      <div className="mb-3">
        <span className="text-2xl font-bold text-[#212529]">${plan.price.toFixed(2)}</span>
        <span className="text-gray-500 text-sm">/{plan.period}</span>
      </div>
      <ul className="space-y-2 mb-4">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start text-sm">
            <i className="ri-check-line text-accent mt-0.5 mr-2"></i>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button 
        className={`
          w-full py-2 
          ${plan.highlight 
            ? 'bg-secondary text-white hover:bg-secondary/90' 
            : 'border border-primary text-primary hover:bg-primary/5'
          } 
          font-medium rounded-lg transition-colors
        `}
        onClick={handleSubscribe}
      >
        {plan.ctaText}
      </button>
    </div>
  );
}
