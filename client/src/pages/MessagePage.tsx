import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMatch } from '@/context/MatchContext';
import { useAuth } from '@/context/AuthContext';
import MessageThread from '@/components/MessageThread';
import { Button } from '@/components/ui/button';
import { CreditCard, CheckCircle2, MessageCircle, Sparkles } from 'lucide-react';

export default function MessagePage() {
  const { hasActiveMatch, matchedUser, messages, sendMessage } = useMatch();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [messageInput, setMessageInput] = useState('');

  const hasSubscription = user?.subscriptionTier && user.subscriptionTier !== 'none';

  const handleSendMessage = () => {
    if (messageInput.trim()) {
      sendMessage(messageInput);
      setMessageInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!hasActiveMatch || !matchedUser) {
    return (
      <div className="px-4">
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-5 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 mx-auto flex items-center justify-center mb-4">
            <MessageCircle className="text-2xl text-primary h-8 w-8" />
          </div>
          <h3 className="font-poppins font-medium text-lg mb-2">No active match</h3>
          <p className="text-gray-600">You need to match with someone before you can start chatting.</p>
        </div>
      </div>
    );
  }

  if (!hasSubscription) {
    return (
      <div className="px-4 py-6 max-w-lg mx-auto">
        {/* Lock icon */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#1a237e] to-[#1565c0] p-8 text-center text-white">
            <div className="w-16 h-16 rounded-full bg-white/20 mx-auto flex items-center justify-center mb-4">
              <CreditCard className="h-8 w-8" />
            </div>
            <h2 className="font-poppins text-2xl font-bold mb-2">You've matched!</h2>
            <p className="text-white/85">
              {matchedUser.firstName || 'Someone special'} is waiting to chat with you.
              Subscribe to unlock messaging.
            </p>
          </div>

          <div className="p-6 space-y-4">
            {/* Trial notice */}
            {(user as any)?.trialActivated ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-800 text-sm">Free trial active!</p>
                  <p className="text-green-700 text-xs mt-0.5">
                    Your 14-day trial ends{' '}
                    {(user as any).trialExpiresAt
                      ? `on ${new Date((user as any).trialExpiresAt).toLocaleDateString()}`
                      : 'soon'}
                    . Messaging is included — tap below to subscribe and keep access.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-800 text-sm">Plans start at just $14.99/month</p>
                  <p className="text-blue-700 text-xs mt-0.5">
                    Pay in your local currency with real exchange rates. Cards, bank transfer, USSD & mobile money accepted.
                  </p>
                </div>
              </div>
            )}

            {/* Subscribe CTA */}
            <Button
              className="w-full bg-gradient-to-r from-[#1a237e] to-[#1565c0] text-white text-base py-6 rounded-xl"
              onClick={() => navigate('/app/subscribe')}
            >
              <CreditCard className="h-5 w-5 mr-2" />
              View plans &amp; subscribe
            </Button>

            <p className="text-xs text-gray-400 text-center">
              Secure checkout via Flutterwave · Cancel anytime
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4">
      <MessageThread
        matchedUser={matchedUser}
        messages={messages}
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        onSendMessage={handleSendMessage}
        onKeyPress={handleKeyPress}
      />
    </div>
  );
}
