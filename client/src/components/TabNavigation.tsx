import { useLocation, Link } from 'wouter';

export default function TabNavigation() {
  const [location] = useLocation();
  
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg z-10">
      <div className="flex justify-around">
        <Link href="/app/">
          <a className={`py-4 flex flex-col items-center relative ${location === '/app/' ? 'text-primary' : 'text-gray-400'}`}>
            {location === '/app/' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-primary rounded-b-md"></div>}
            <i className={`${location === '/app/' ? 'ri-heart-3-fill' : 'ri-heart-line'} text-2xl`}></i>
            <span className="text-xs font-medium mt-1">Match</span>
          </a>
        </Link>
        <Link href="/app/messages">
          <a className={`py-4 flex flex-col items-center relative ${location === '/app/messages' ? 'text-primary' : 'text-gray-400'}`}>
            {location === '/app/messages' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-primary rounded-b-md"></div>}
            <i className={`${location === '/app/messages' ? 'ri-chat-1-fill' : 'ri-chat-1-line'} text-2xl`}></i>
            <span className="text-xs font-medium mt-1">Messages</span>
          </a>
        </Link>
        <Link href="/app/profile">
          <a className={`py-4 flex flex-col items-center relative ${location === '/app/profile' ? 'text-primary' : 'text-gray-400'}`}>
            {location === '/app/profile' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-primary rounded-b-md"></div>}
            <i className={`${location === '/app/profile' ? 'ri-user-fill' : 'ri-user-line'} text-2xl`}></i>
            <span className="text-xs font-medium mt-1">Profile</span>
          </a>
        </Link>
        <Link href="/app/wallet">
          <a className={`py-4 flex flex-col items-center relative ${location === '/app/wallet' ? 'text-primary' : 'text-gray-400'}`}>
            {location === '/app/wallet' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-primary rounded-b-md"></div>}
            <i className={`${location === '/app/wallet' ? 'ri-wallet-3-fill' : 'ri-wallet-3-line'} text-2xl`}></i>
            <span className="text-xs font-medium mt-1">Wallet</span>
          </a>
        </Link>
      </div>
    </div>
  );
}
