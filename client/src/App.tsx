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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MatchProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </MatchProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
