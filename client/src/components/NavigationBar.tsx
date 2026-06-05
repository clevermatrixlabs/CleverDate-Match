import { useAuth } from '@/context/AuthContext';
import { Link, useLocation } from 'wouter';
import { Heart, ShieldCheck, Settings } from 'lucide-react';

export default function NavigationBar() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = !!(user as any)?.isAdmin;

  return (
    <nav className="bg-gradient-to-r from-primary to-primary/90 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Heart className="w-6 h-6 mr-2 fill-white text-white" />
              <h1 className="text-white font-poppins font-bold text-xl">Tim Clever Date</h1>
            </div>
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
