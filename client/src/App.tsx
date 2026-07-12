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
import SettingsPage from "@/pages/SettingsPage";
import AdminDashboardPage from "@/pages/AdminDashboardPage";
const SubscribePage = lazy(() => import("@/pages/SubscribePage"));
const LiveStudioPage = lazy(() => import("@/pages/LiveStudioPage"));
const LiveWatchPage = lazy(() => import("@/pages/LiveWatchPage"));
import { AuthProvider } from "@/context/AuthContext";
import { MatchProvider } from "@/context/MatchContext";
import { AppLoading } from "@/components/AppLoading";
import { GoogleOAuthProvider } from "@react-oauth/google";

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || "";

function Router() {
  return (
    <Suspense fallback={<AppLoading />}>
      <Switch>
        <Route path="/" component={OnboardingPage} />
        <Route path="/verify" component={VerificationPage} />
        <Route path="/create-profile" component={ProfileCreationPage} />
        <Route path="/admin" component={AdminDashboardPage} />
        <Route path="/admin/live" component={LiveStudioPage} />
        <Route path="/app/subscribe" component={SubscribePage} />
        <Route path="/app/live" component={LiveWatchPage} />
        <Route path="/app" nest>
          <Layout>
            <Switch>
              <Route path="/" component={MatchPage} />
              <Route path="/messages" component={MessagePage} />
              <Route path="/wallet" component={WalletPage} />
              <Route path="/profile" component={ProfilePage} />
              <Route path="/settings" component={SettingsPage} />
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

function AppInner() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').catch(() => {});
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WebSocketProvider>
          <MatchProvider>
            <TooltipProvider>
              <div className="min-h-screen bg-background flex flex-col safe-area-top safe-area-bottom">
                <Toaster />
                <Router />
              </div>
            </TooltipProvider>
          </MatchProvider>
        </WebSocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  if (GOOGLE_CLIENT_ID) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AppInner />
      </GoogleOAuthProvider>
    );
  }
  return <AppInner />;
}
