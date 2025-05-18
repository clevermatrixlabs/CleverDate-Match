import { User } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'wouter';

interface MatchOverlayProps {
  matchedUser: User;
  onClose: () => void;
  onSendMessage: () => void;
}

export default function MatchOverlay({ matchedUser, onClose, onSendMessage }: MatchOverlayProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const handleSendMessage = () => {
    onSendMessage();
    navigate('/app/messages');
  };

  return (
    <div className="fixed inset-0 bg-primary/95 flex flex-col items-center justify-center px-6 z-20">
      <div className="text-center">
        <div className="mb-8">
          <div className="flex justify-center items-center">
            <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden -mr-4">
              <img 
                src={user?.profilePicture || 'https://via.placeholder.com/200x200'} 
                alt="Your profile photo" 
                className="w-full h-full object-cover" 
              />
            </div>
            <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden -ml-4">
              <img 
                src={matchedUser?.profilePicture || 'https://via.placeholder.com/200x200'} 
                alt={`${matchedUser?.firstName}'s profile photo`} 
                className="w-full h-full object-cover" 
              />
            </div>
          </div>
        </div>
        
        <h2 className="font-poppins text-3xl font-bold text-white mb-3">It's a Match!</h2>
        <p className="text-white/90 mb-8">
          You and {matchedUser?.firstName} have liked each other. Now's your chance to start a meaningful conversation.
        </p>
        
        <div className="space-y-3">
          <button 
            className="w-full py-3 bg-white text-primary font-medium rounded-lg shadow-md"
            onClick={handleSendMessage}
          >
            Send Message
          </button>
          <button 
            className="w-full py-3 bg-transparent border border-white text-white font-medium rounded-lg"
            onClick={onClose}
          >
            Keep Browsing
          </button>
        </div>
      </div>
    </div>
  );
}
