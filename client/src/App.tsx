import { useState, useEffect, lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "./lib/queryClient";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import OnboardingPage from "@/pages/OnboardingPage";
const VerificationPage = lazy(() => import("@/pages/VerificationPage"));
import ProfileCreationPage from "@/pages/ProfileCreationPage";
import MatchPage from "@/pages/MatchPage";
import MessagePage from "@/pages/MessagePage";
import WalletPage from "@/pages/WalletPage";
import ProfilePage from "@/pages/ProfilePage";
import AdminDashboardPage from "@/pages/AdminDashboardPage";
import { AuthProvider } from "@/context/AuthContext";
import { MatchProvider } from "@/context/MatchContext";
import { AppLoading } from "@/components/AppLoading";

// Check if the app is being launched from a home screen
const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
  || (window.navigator as any).standalone 
  || document.referrer.includes('android-app://');

function Router() {
  return (
    <Suspense fallback={<AppLoading />}>
      <Switch>
        <Route path="/" component={OnboardingPage} />
        <Route path="/verify" component={VerificationPage} />
        <Route path="/create-profile" component={ProfileCreationPage} />
        <Route path="/admin" component={AdminDashboardPage} />
        <Route path="/app" nest>
          <Layout>
            <Switch>
              <Route path="/" component={MatchPage} />
              <Route path="/messages" component={MessagePage} />
              <Route path="/wallet" component={WalletPage} />
              <Route path="/profile" component={ProfilePage} />
              <Route component={MatchPage} />
            </Switch>
          </Layout>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

import { WebSocketProvider } from "@/context/WebSocketContext";

function App() {
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
