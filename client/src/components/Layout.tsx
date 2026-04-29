import { ReactNode, useEffect } from 'react';
import NavigationBar from './NavigationBar';
import TabNavigation from './TabNavigation';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'wouter';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();

  // Redirect to login if not authenticated — must run in an effect, never during render.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/');
    }
  }, [isLoading, isAuthenticated, navigate]);

  // While we're checking the session, show a spinner instead of a blank screen.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // If unauthenticated, the effect above will redirect — render nothing meanwhile.
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavigationBar />
      <main className="flex-1 overflow-y-auto pb-16 pt-4">
        {children}
      </main>
      <TabNavigation />
    </div>
  );
}
