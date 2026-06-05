import { useLocation, Link } from 'wouter';
import { Heart, MessageCircle, User, Wallet } from 'lucide-react';

export default function TabNavigation() {
  // Inside the nested /app route, useLocation() returns paths relative to /app
  // (e.g. "/", "/messages"). We compare against those relative paths.
  const [location] = useLocation();

  // Use ~ prefix for absolute paths — inside a wouter nest("/app") context,
  // plain "/foo" is resolved relative to the nest base and becomes "/app/foo".
  // The ~ prefix forces an absolute path from the site root.
  const tabs = [
    { href: '~/app/', match: '/', label: 'Match', Icon: Heart },
    { href: '~/app/messages', match: '/messages', label: 'Messages', Icon: MessageCircle },
    { href: '~/app/profile', match: '/profile', label: 'Profile', Icon: User },
    { href: '~/app/wallet', match: '/wallet', label: 'Wallet', Icon: Wallet },
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
                className={`w-5 h-5 ${isActive ? 'fill-primary text-primary' : ''}`}
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
