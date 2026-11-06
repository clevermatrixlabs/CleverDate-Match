import { useLocation, Link } from 'wouter';
import { MessageCircle, User, Gift, Crown } from 'lucide-react';

function IllusionMatchIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Outer radial optical illusion rings */}
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 1.8" />
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.8 1.5" />
      {/* Center dark circle */}
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      {/* Key inside the round circle */}
      <circle cx="12" cy="11" r="1.15" stroke="#ffffff" strokeWidth="1.1" />
      <path d="M12 12.2v2.1m0-.7h1" stroke="#ffffff" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export default function TabNavigation() {
  // Inside the nested /app route, useLocation() returns paths relative to /app
  // (e.g. "/", "/messages"). We compare against those relative paths.
  const [location] = useLocation();

  // Use ~ prefix for absolute paths — inside a wouter nest("/app") context,
  // plain "/foo" is resolved relative to the nest base and becomes "/app/foo".
  // The ~ prefix forces an absolute path from the site root.
  const tabs = [
    { href: '~/app/', match: '/', label: 'Match', Icon: IllusionMatchIcon, isIllusion: true },
    { href: '~/app/messages', match: '/messages', label: 'Messages', Icon: MessageCircle, isIllusion: false },
    { href: '~/app/subscribe', match: '/subscribe', label: 'VIP Plans', Icon: Crown, isIllusion: false },
    { href: '~/app/gifts', match: '/gifts', label: 'Gift Store', Icon: Gift, isIllusion: false },
    { href: '~/app/profile', match: '/profile', label: 'Profile', Icon: User, isIllusion: false },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg z-10 border-t border-gray-100">
      <div className="flex justify-around">
        {tabs.map((tab) => {
          const isActive = location === tab.match || (tab.match === '/' && location === '');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`py-3 flex flex-col items-center relative flex-1 ${isActive ? 'text-primary' : 'text-gray-400'}`}
            >
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-0.5 bg-primary rounded-b-md" />
              )}
              <tab.Icon
                className={`w-5 h-5 ${isActive && !tab.isIllusion ? 'fill-primary text-primary' : ''}`}
                strokeWidth={isActive ? 2.5 : 1.75}
              />
              <span className={`text-[11px] font-medium mt-1 ${isActive ? 'text-primary' : 'text-gray-400'}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
