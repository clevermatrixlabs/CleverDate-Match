import { useLocation, Link } from 'wouter';

export default function TabNavigation() {
  // Inside the nested /app route, useLocation() returns paths relative to /app
  // (e.g. "/", "/messages"). We compare against those relative paths.
  const [location] = useLocation();

  const tabs = [
    { href: '/app/', match: '/', label: 'Match', iconActive: 'ri-heart-3-fill', iconIdle: 'ri-heart-line' },
    { href: '/app/messages', match: '/messages', label: 'Messages', iconActive: 'ri-chat-1-fill', iconIdle: 'ri-chat-1-line' },
    { href: '/app/profile', match: '/profile', label: 'Profile', iconActive: 'ri-user-fill', iconIdle: 'ri-user-line' },
    { href: '/app/wallet', match: '/wallet', label: 'Wallet', iconActive: 'ri-wallet-3-fill', iconIdle: 'ri-wallet-3-line' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg z-10">
      <div className="flex justify-around">
        {tabs.map((tab) => {
          const isActive = location === tab.match || (tab.match === '/' && location === '');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`py-4 flex flex-col items-center relative ${isActive ? 'text-primary' : 'text-gray-400'}`}
            >
              {isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-primary rounded-b-md"></div>}
              <i className={`${isActive ? tab.iconActive : tab.iconIdle} text-2xl`}></i>
              <span className="text-xs font-medium mt-1">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
