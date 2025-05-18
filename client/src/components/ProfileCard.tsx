import { User } from '@/types';

interface ProfileCardProps {
  user: User;
  onLike: () => void;
  onPass: () => void;
}

export default function ProfileCard({ user, onLike, onPass }: ProfileCardProps) {
  if (!user) return null;

  const interests = user.interests || [];

  return (
    <div className="relative bg-white rounded-xl shadow-lg overflow-hidden mb-5">
      <div className="relative">
        <img 
          src={user.profilePicture || 'https://via.placeholder.com/800x1000'} 
          alt={`Profile photo of ${user.firstName}`} 
          className="w-full h-96 object-cover" 
        />
        
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white">
          <div className="flex items-center">
            <h2 className="font-poppins text-2xl font-bold">{user.firstName}, {user.age}</h2>
            {user.isVerified && (
              <div className="ml-2 bg-accent rounded-full p-1">
                <i className="ri-verified-badge-fill"></i>
              </div>
            )}
          </div>
          <div className="flex items-center text-sm">
            <i className="ri-map-pin-line mr-1"></i>
            <span>{user.location || 'Unknown location'}</span>
            {user.religion && (
              <>
                <span className="mx-2">•</span>
                <i className="ri-christian-line mr-1"></i>
                <span>{user.religion}</span>
              </>
            )}
          </div>
        </div>

        {user.profileVideo && (
          <div className="absolute top-4 right-4 bg-secondary/90 text-white rounded-full px-3 py-1 text-xs font-medium flex items-center">
            <i className="ri-film-line mr-1"></i>
            <span>Has Video</span>
          </div>
        )}
      </div>

      <div className="p-5">
        <p className="text-gray-700 mb-5">{user.aboutMe || 'No bio provided'}</p>
        
        {interests.length > 0 && (
          <div className="mb-5">
            <h3 className="font-medium text-[#212529] mb-2">Interests</h3>
            <div className="flex flex-wrap gap-2">
              {interests.map((interest, index) => (
                <span key={index} className="bg-[#E9ECEF] px-3 py-1 rounded-full text-sm text-gray-700">
                  {interest}
                </span>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex justify-between">
          <button 
            className="bg-gray-200 w-14 h-14 rounded-full flex items-center justify-center text-gray-500"
            onClick={onPass}
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
          <button 
            className="bg-primary w-14 h-14 rounded-full flex items-center justify-center text-white shadow-md"
            onClick={onLike}
          >
            <i className="ri-heart-3-fill text-2xl"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
