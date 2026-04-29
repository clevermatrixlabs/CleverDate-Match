import { useAuth } from '@/context/AuthContext';
import { Link } from 'wouter';

export default function NavigationBar() {
  const { user } = useAuth();
  const isAdmin = !!(user as any)?.isAdmin;

  return (
    <nav className="bg-gradient-to-r from-primary to-primary/90 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <i className="ri-heart-3-fill text-2xl mr-2 text-white"></i>
              <h1 className="text-white font-poppins font-bold text-xl">Tim Clever Date</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-1 rounded-full px-3 py-1.5 bg-white/20 text-white hover:bg-white/30 transition-colors text-sm font-medium"
                data-testid="link-admin-dashboard"
              >
                <i className="ri-shield-star-line"></i>
                <span className="hidden sm:inline">Owner</span>
              </Link>
            )}
            {user && (
              <button className="rounded-full p-1.5 bg-white/20 text-white hover:bg-white/30 focus:outline-none transition-colors">
                <i className="ri-settings-3-line text-xl"></i>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
