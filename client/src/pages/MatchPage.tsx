import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useMatch } from '@/context/MatchContext';
import { queryClient } from '@/lib/queryClient';
import ProfileCard from '@/components/ProfileCard';
import MatchOverlay from '@/components/MatchOverlay';
import MatchKey from '@/components/MatchKey';
import PayPalButton from '@/components/PayPalButton';
import { SUBSCRIPTION_PLANS, type PlanId } from '@/lib/subscription-plans';
import { MatchCandidate } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, HeartHandshake, Clock, KeyRound, Sparkles, CreditCard, Lock } from 'lucide-react';

function getTimeUntilNextUtcMidnight() {
  const now = new Date();
  const nextMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
  );
  const diffMs = Math.max(0, nextMidnight.getTime() - now.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

function DailyResetTimer() {
  const [timeLeft, setTimeLeft] = useState(getTimeUntilNextUtcMidnight);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeUntilNextUtcMidnight());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-4 inline-flex flex-col items-center bg-amber-50/90 border border-amber-200 rounded-2xl px-5 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
        Check back later
      </span>
      <span className="mt-1 font-mono text-lg font-bold text-gray-900 tracking-wide">
        {timeLeft.hours}h : {timeLeft.minutes}m : {timeLeft.seconds}s
      </span>
      <span className="text-[11px] text-gray-500 mt-0.5">
        Next 5 daily matches unlock at midnight UTC
      </span>
    </div>
  );
}

function MandatorySubscriptionPrompt({ onSubscribed }: { onSubscribed: () => void }) {
  const [, navigate] = useLocation();
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>('basic');
  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.id === selectedPlanId) || SUBSCRIPTION_PLANS[0];

  return (
    <div className="px-4 py-6 max-w-md mx-auto">
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
        <div className="bg-gradient-to-r from-[#1a237e] via-[#1565c0] to-[#0d47a1] p-6 text-center text-white">
          <div className="w-14 h-14 rounded-full bg-white/15 mx-auto flex items-center justify-center mb-3 border border-white/25">
            <Lock className="w-7 h-7 text-amber-300" />
          </div>
          <h2 className="font-poppins text-xl font-bold mb-1">
            7-Day Free Trial Ended
          </h2>
          <p className="text-white/85 text-xs leading-relaxed">
            Add your card or pay with PayPal to unlock full 1-on-1 dating access and daily AI matches.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Select Subscription Duration
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SUBSCRIPTION_PLANS.map((plan) => {
                const isSelected = plan.id === selectedPlanId;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="font-bold text-sm text-gray-900">{plan.name}</div>
                    <div className="text-xs text-blue-700 font-semibold">${plan.usdPrice.toFixed(2)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-1">
            <PayPalButton
              planId={selectedPlanId}
              buttonText={`Pay $${selectedPlan.usdPrice.toFixed(2)} (${selectedPlan.name})`}
              buttonStyle={{
                layout: 'vertical',
                color: 'gold',
                shape: 'rect',
                label: 'paypal',
                height: 44,
              }}
              onSuccess={onSubscribed}
            />
          </div>

          <button
            type="button"
            onClick={() => navigate('~/app/subscribe')}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 font-medium hover:underline pt-1"
          >
            <CreditCard className="w-3.5 h-3.5" />
            View all subscription details
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MatchPage() {
  const {
    potentialMatches,
    hasActiveMatch,
    matchedUser: activeMatchedUser,
    hasActiveSubscription,
    dailyStatus,
    discoveryState,
    resetDiscovery,
    sendLike,
    sendPass,
    unmatch,
  } = useMatch();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showMatchOverlay, setShowMatchOverlay] = useState(false);
  const [matchedUser, setMatchedUser] = useState<MatchCandidate | null>(null);

  const handleLike = async (userId: number) => {
    try {
      const liked = potentialMatches.find(u => u.id === userId);
      const res = await sendLike(userId);
      if (res?.isMatched && liked) {
        setMatchedUser(liked);
        setShowMatchOverlay(true);
      } else {
        toast({
          title: 'Interest sent!',
          description: "If they like you back, you'll be paired 1-on-1.",
        });
      }
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to like',
        description: e?.message || 'Daily match limit reached or active match exists.',
      });
    }
  };

  const handlePass = async (userId: number) => {
    try {
      await sendPass(userId);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to pass',
        description: e?.message || 'Daily match limit reached.',
      });
    }
  };

  // Mandatory card/PayPal subscription gate after 7-day trial expires
  if (user && !hasActiveSubscription) {
    return (
      <MandatorySubscriptionPrompt
        onSubscribed={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
          queryClient.invalidateQueries({ queryKey: ['/api/matches/potential'] });
          queryClient.invalidateQueries({ queryKey: ['/api/matches/daily-status'] });
        }}
      />
    );
  }

  const candidate = potentialMatches[0];
  const { remainingToday, dailyLimit, dailyLimitReached } = dailyStatus;

  return (
    <div className="px-4 pb-6 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between py-3">
        <div>
          <h1 className="font-poppins font-semibold text-gray-800">AI 1-on-1 Match</h1>
          <p className="text-xs text-gray-500">
            {remainingToday} of {dailyLimit} daily matches remaining
          </p>
        </div>
        <button
          onClick={() => navigate('~/create-profile')}
          className="flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-full px-3 py-1.5 text-xs font-medium hover:bg-blue-100 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Edit Match Bio
        </button>
      </div>

      {/* Active 1-on-1 Match View */}
      {hasActiveMatch && (
        <div className="bg-white rounded-2xl shadow-md p-6 text-center mt-4 border border-blue-100">
          <div className="w-16 h-16 rounded-full bg-blue-50 mx-auto flex items-center justify-center mb-4">
            <HeartHandshake className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="font-poppins font-semibold text-lg text-gray-800 mb-1">
            You&apos;re in a 1-on-1 Match{activeMatchedUser?.firstName ? ` with ${activeMatchedUser.firstName}` : ''}
          </h3>
          <p className="text-gray-500 text-sm mb-5 max-w-sm mx-auto">
            Clever Date Match is a dedicated 1-on-1 dating experience. Focus on building a genuine connection with your match.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('~/app/messages')}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-800 to-blue-500 text-white rounded-full px-6 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <MessageCircle className="w-4 h-4" />
              Open 1-on-1 Chat
            </button>
            <button
              onClick={() => unmatch()}
              className="bg-gray-100 text-gray-700 rounded-full px-5 py-2.5 text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              End Match &amp; Meet Someone New
            </button>
          </div>
        </div>
      )}

      {/* Daily Limit Reached (5/5) */}
      {!hasActiveMatch && dailyLimitReached && (
        <div className="bg-white rounded-2xl shadow-md p-8 text-center mt-4 border border-amber-100">
          <div className="w-16 h-16 rounded-full bg-amber-50 mx-auto flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-amber-500" />
          </div>
          <h3 className="font-poppins font-semibold text-lg text-gray-800 mb-2">
            No matches available
          </h3>
          <p className="text-gray-500 text-sm mb-2 max-w-sm mx-auto">
            You&apos;ve used all 5 of your daily 1-on-1 matches. Every member receives 5 curated matches per day to keep dating intentional.
          </p>
          <DailyResetTimer />
        </div>
      )}

      {/* Central Glowing Key inside the Optical Illusion Circle (idle or searching) */}
      {!hasActiveMatch && !dailyLimitReached && (discoveryState === 'idle' || discoveryState === 'searching') && (
        <MatchKey />
      )}

      {/* Revealed Match */}
      {!hasActiveMatch && !dailyLimitReached && discoveryState === 'revealed' && candidate && (
        <ProfileCard
          user={candidate}
          onLike={() => handleLike(candidate.id)}
          onPass={() => handlePass(candidate.id)}
        />
      )}

      {/* No Matches Available */}
      {!hasActiveMatch && !dailyLimitReached && (discoveryState === 'no_matches' || (discoveryState === 'revealed' && !candidate)) && (
        <div className="bg-white rounded-2xl shadow-md p-8 text-center mt-4 border border-slate-100">
          <div className="w-16 h-16 rounded-full bg-amber-50 mx-auto flex items-center justify-center mb-4">
            <KeyRound className="w-8 h-8 text-amber-500" />
          </div>
          <h3 className="font-poppins font-semibold text-lg text-gray-800 mb-2">
            No matches available
          </h3>
          <p className="text-gray-500 text-sm mb-5 max-w-xs mx-auto">
            There is no match available for you right now. Please come back or check back soon!
          </p>
          <button
            onClick={resetDiscovery}
            className="bg-gradient-to-r from-blue-800 to-blue-500 text-white rounded-full px-6 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Back to Illusion Key
          </button>
        </div>
      )}

      {/* Match overlay */}
      {showMatchOverlay && matchedUser && (
        <MatchOverlay
          matchedUser={matchedUser}
          onClose={() => setShowMatchOverlay(false)}
          onSendMessage={() => setShowMatchOverlay(false)}
        />
      )}
    </div>
  );
}
