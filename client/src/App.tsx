import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "./lib/queryClient";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import OnboardingPage from "@/pages/OnboardingPage";
import VerificationPage from "@/pages/VerificationPage";
import ProfileCreationPage from "@/pages/ProfileCreationPage";
import MatchPage from "@/pages/MatchPage";
import MessagePage from "@/pages/MessagePage";
import WalletPage from "@/pages/WalletPage";
import ProfilePage from "@/pages/ProfilePage";
import { AuthProvider } from "@/context/AuthContext";
import { MatchProvider } from "@/context/MatchContext";
import { AppLoading } from "@/components/AppLoading";

// Check if the app is being launched from a home screen
const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
  || (window.navigator as any).standalone 
  || document.referrer.includes('android-app://');

function Router() {
  return (
    <Switch>
      <Route path="/" component={OnboardingPage} />
      <Route path="/verify" component={VerificationPage} />
      <Route path="/create-profile" component={ProfileCreationPage} />
      <Route path="/app" component={() => (
        <Layout>
          <Switch>
            <Route path="/app/" component={MatchPage} />
            <Route path="/app/messages" component={MessagePage} />
            <Route path="/app/wallet" component={WalletPage} />
            <Route path="/app/profile" component={ProfilePage} />
          </Switch>
        </Layout>
      )} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Import WebSocket provider
import { WebSocketProvider } from "@/context/WebSocketContext";

function App() {
  const [isLoading, setIsLoading] = useState(true);

  // Simulate app loading for a smooth experience
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  // Check for service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').catch(error => {
          console.log('Service worker registration failed:', error);
        });
      });
    }
  }, []);

  if (isLoading) {
    return <AppLoading />;
  }
  
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MatchProvider>
          <WebSocketProvider>
            <TooltipProvider>
              <div className="min-h-screen bg-background flex flex-col safe-area-top safe-area-bottom">
                <Toaster />
                <Router />
              </div>
            </TooltipProvider>
          </WebSocketProvider>
        </MatchProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
