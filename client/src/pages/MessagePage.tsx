import { useState } from 'react';
import { useMatch } from '@/context/MatchContext';
import { useAuth } from '@/context/AuthContext';
import MessageThread from '@/components/MessageThread';
import SubscriptionCard from '@/components/SubscriptionCard';

const subscriptionPlans = [
  {
    id: 'basic',
    name: 'Basic',
    price: 14.99,
    badge: 'POPULAR',
    period: 'month',
    features: [
      'Send & receive unlimited messages',
      '1 match at a time',
      'Standard customer support'
    ],
    highlight: false,
    ctaText: 'Choose Basic'
  },
  {
    id: 'diamond',
    name: 'Diamond',
    price: 29.99,
    badge: 'BEST VALUE',
    period: 'month',
    features: [
      'All Basic features',
      'Send gifts with lower platform fees',
      'Priority customer support',
      'Exclusive access to owner livestreams'
    ],
    highlight: true,
    ctaText: 'Choose Diamond'
  }
] as const;

export default function MessagePage() {
  const { hasActiveMatch, matchedUser, messages, sendMessage } = useMatch();
  const { user } = useAuth();
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

  const startFreeTrial = () => {
    // In a real app, this would start the payment flow
    console.log("Starting free trial");
  };

  if (!hasActiveMatch || !matchedUser) {
    return (
      <div className="px-4">
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-5 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 mx-auto flex items-center justify-center mb-4">
            <i className="ri-chat-1-line text-2xl text-primary"></i>
          </div>
          <h3 className="font-poppins font-medium text-lg mb-2">No active match</h3>
          <p className="text-gray-600">
            You need to match with someone before you can start chatting
          </p>
        </div>
      </div>
    );
  }

  if (!hasSubscription) {
    return (
      <div className="px-4">
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-5">
          <div className="p-6">
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <i className="ri-lock-line text-3xl text-primary"></i>
              </div>
            </div>
            
            <h2 className="font-poppins text-xl font-bold text-[#212529] text-center mb-2">Subscribe to Message</h2>
            <p className="text-gray-600 text-center mb-6">You've matched with {matchedUser.firstName || 'someone special'}! Subscribe to start chatting.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {subscriptionPlans.map(plan => (
                <SubscriptionCard key={plan.id} plan={plan} />
              ))}
            </div>
            
            <div className="bg-[#E9ECEF] rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <i className="ri-gift-line text-accent"></i>
                </div>
                <div className="ml-3">
                  <h3 className="font-medium text-[#212529] text-sm">Try for free for 7 days</h3>
                  <p className="text-xs text-gray-500">Link a payment method for a free trial</p>
                </div>
                <button 
                  className="ml-auto bg-accent text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
                  onClick={startFreeTrial}
                >
                  Start Trial
                </button>
              </div>
            </div>
            
            <p className="text-xs text-gray-500 text-center">
              By subscribing, you agree to our <a href="#" className="text-secondary">Terms of Service</a> and <a href="#" className="text-secondary">Privacy Policy</a>
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
