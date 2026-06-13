import { useAuth } from '@/context/AuthContext';
import { Link, useLocation } from 'wouter';
import { Heart, ShieldCheck, Settings, Radio } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export default function NavigationBar() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = !!(user as any)?.isAdmin;

  // Poll for active livestream every 30s
  const liveQuery = useQuery<{ id: number; title: string } | null>({
    queryKey: ['/api/live/current'],
    staleTime: 1000 * 30,
    retry: false,
    queryFn: async () => {
      const res = await fetch('/api/live/current', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const isLive = !!liveQuery.data;

  return (
    <nav className="bg-gradient-to-r from-primary to-primary/90 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 flex items-center">
              <Heart className="w-6 h-6 mr-2 fill-white text-white" />
              <h1 className="text-white font-poppins font-bold text-xl">Tim Clever Date</h1>
            </div>
            {/* LIVE badge — shown to all users when admin is streaming */}
            {isLive && (
              <Link
                href="~/app/live"
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white rounded-full px-3 py-1 text-xs font-bold transition-colors animate-pulse shadow-lg"
              >
                <Radio className="w-3 h-3" />
                LIVE
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                href="~/admin"
                className="flex items-center gap-1 rounded-full px-3 py-1.5 bg-white/20 text-white hover:bg-white/30 transition-colors text-sm font-medium"
                data-testid="link-admin-dashboard"
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Owner</span>
              </Link>
            )}
            {user && (
              <button
                onClick={() => navigate('~/app/profile')}
                className="rounded-full p-1.5 bg-white/20 text-white hover:bg-white/30 focus:outline-none transition-colors"
                title="Profile & Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
