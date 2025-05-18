import { useEffect, useRef } from 'react';
import { User, Message } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { format } from 'date-fns';

interface MessageThreadProps {
  matchedUser: User;
  messages: Message[];
  messageInput: string;
  setMessageInput: (input: string) => void;
  onSendMessage: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
}

export default function MessageThread({ 
  matchedUser, 
  messages, 
  messageInput, 
  setMessageInput, 
  onSendMessage,
  onKeyPress
}: MessageThreadProps) {
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Get the match date from the first message or use current date
  const matchDate = messages.length > 0 
    ? new Date(messages[0].timestamp) 
    : new Date();

  // Check if there's been a 5+ hour gap in messages (for reminder)
  const shouldShowReminder = () => {
    if (messages.length === 0) return false;
    
    const lastMessage = messages[messages.length - 1];
    const lastMessageTime = new Date(lastMessage.timestamp);
    const now = new Date();
    const hoursSinceLastMessage = (now.getTime() - lastMessageTime.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceLastMessage >= 5;
  };

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden mb-5">
      <div className="p-4 border-b flex items-center">
        <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden">
          <img 
            src={matchedUser.profilePicture || 'https://via.placeholder.com/100x100'} 
            alt={`${matchedUser.firstName}'s profile photo`} 
            className="w-full h-full object-cover" 
          />
        </div>
        <div className="ml-3">
          <h3 className="font-medium text-[#212529]">{matchedUser.firstName}</h3>
          <div className="flex items-center text-xs text-accent">
            <i className="ri-checkbox-circle-fill mr-1"></i>
            <span>Verified Match</span>
          </div>
        </div>
        <div className="ml-auto">
          <button className="text-gray-400 hover:text-gray-600">
            <i className="ri-information-line"></i>
          </button>
        </div>
      </div>
      
      <div className="h-96 p-4 overflow-y-auto bg-gray-50">
        <div className="flex flex-col space-y-3">
          {/* System message - match date */}
          <div className="bg-[#E9ECEF] rounded-lg py-2 px-3 max-w-xs mx-auto">
            <p className="text-xs text-center text-gray-500">
              You matched with {matchedUser.firstName} on {format(matchDate, 'MMMM d')}
            </p>
          </div>
          
          {/* Messages */}
          {messages.map((message, index) => {
            const isSender = message.senderId === user?.id;
            const messageTime = new Date(message.timestamp);
            
            return (
              <div key={index} className={`flex ${isSender ? 'justify-end' : ''}`}>
                <div className={`
                  ${isSender ? 'bg-primary/10 text-[#212529]' : 'bg-[#E9ECEF]'} 
                  rounded-2xl py-2 px-4 max-w-xs
                `}>
                  <p>{message.content}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {format(messageTime, 'h:mm a')}
                  </p>
                </div>
              </div>
            );
          })}
          
          {/* Reminder message */}
          {shouldShowReminder() && (
            <div className="bg-accent/10 rounded-lg py-2 px-3 max-w-sm mx-auto">
              <p className="text-xs text-center text-accent">
                {matchedUser.firstName} sent a message 5 hours ago. Keep the conversation going!
              </p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>
      
      <div className="p-3 border-t">
        <div className="flex items-center">
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <i className="ri-image-line text-xl"></i>
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <i className="ri-gift-2-line text-xl"></i>
          </button>
          <input 
            type="text" 
            className="flex-1 bg-[#E9ECEF] rounded-full px-4 py-2 mx-2 focus:outline-none" 
            placeholder="Type a message..." 
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={onKeyPress}
          />
          <button 
            className="p-2 text-primary hover:text-primary/80"
            onClick={onSendMessage}
            disabled={!messageInput.trim()}
          >
            <i className="ri-send-plane-fill text-xl"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
