import { useAuth } from '@/context/AuthContext';
import { Link, useLocation } from 'wouter';
import { ShieldCheck, Settings, Radio } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export default function NavigationBar() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = !!(user as any)?.isAdmin;

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
    <nav style={{ background: 'linear-gradient(135deg, #040810 0%, #0a0f2e 100%)' }} className="text-white shadow-lg border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-3">
            {/* Cinematic logo */}
            <Link href="~/app/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              <span style={{
                fontFamily: "'Georgia','Times New Roman',serif",
                fontSize: 22,
                fontWeight: 900,
                fontStyle: 'italic',
                background: 'linear-gradient(135deg, #ffd700 0%, #ff9500 50%, #ffec6e 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '0.02em',
              }}>
                CLEVER DATE MATCH
              </span>
            </Link>
            {/* LIVE badge */}
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
                className="flex items-center gap-1 rounded-full px-3 py-1.5 bg-white/10 text-white hover:bg-white/20 transition-colors text-sm font-medium border border-white/20"
                data-testid="link-admin-dashboard"
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Owner</span>
              </Link>
            )}
            {user && (
              <button
                onClick={() => navigate('~/app/profile')}
                className="rounded-full p-1.5 bg-white/10 text-white hover:bg-white/20 focus:outline-none transition-colors border border-white/20"
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
