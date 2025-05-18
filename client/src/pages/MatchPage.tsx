import { useState } from 'react';
import { useMatch } from '@/context/MatchContext';
import ProfileCard from '@/components/ProfileCard';
import MatchOverlay from '@/components/MatchOverlay';

export default function MatchPage() {
  const { potentialMatches, hasActiveMatch, isLoadingMatches, sendLike, sendPass } = useMatch();
  const [showMatchOverlay, setShowMatchOverlay] = useState(false);
  const [matchedUser, setMatchedUser] = useState<any>(null);

  const handleLike = async (userId: number) => {
    try {
      // In a real app, the sendLike function would return if it resulted in a match
      await sendLike(userId);
      
      // For demo purposes, simulate a match with a 30% chance
      if (Math.random() < 0.3) {
        // Find the user we just matched with
        const matchedUser = potentialMatches.find(user => user.id === userId);
        if (matchedUser) {
          setMatchedUser(matchedUser);
          setShowMatchOverlay(true);
        }
      }
    } catch (error) {
      console.error("Error liking profile:", error);
    }
  };

  const handlePass = async (userId: number) => {
    try {
      await sendPass(userId);
    } catch (error) {
      console.error("Error passing profile:", error);
    }
  };

  const handleCloseMatch = () => {
    setShowMatchOverlay(false);
  };

  return (
    <div className="px-4">
      {isLoadingMatches ? (
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Loading potential matches...</p>
        </div>
      ) : potentialMatches.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-5 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 mx-auto flex items-center justify-center mb-4">
            <i className="ri-search-line text-2xl text-primary"></i>
          </div>
          <h3 className="font-poppins font-medium text-lg mb-2">No potential matches found</h3>
          <p className="text-gray-600">
            We're looking for your perfect match. Check back soon!
          </p>
        </div>
      ) : (
        <ProfileCard 
          user={potentialMatches[0]}
          onLike={() => handleLike(potentialMatches[0].id)}
          onPass={() => handlePass(potentialMatches[0].id)}
        />
      )}

      {showMatchOverlay && matchedUser && (
        <MatchOverlay 
          matchedUser={matchedUser} 
          onClose={handleCloseMatch} 
          onSendMessage={handleCloseMatch}
        />
      )}
    </div>
  );
}
