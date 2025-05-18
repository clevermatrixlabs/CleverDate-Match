import { ReactNode } from 'react';
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

  // Redirect to login if not authenticated
  if (!isLoading && !isAuthenticated) {
    navigate('/');
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
