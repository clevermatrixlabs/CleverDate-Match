import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleEdit = () => {
    // In a real app, this would navigate to an edit profile page
    console.log("Edit profile");
  };

  if (!user) {
    return (
      <div className="px-4">
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-5 p-6 text-center">
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4">
      <Card className="bg-white rounded-xl shadow-md overflow-hidden mb-5">
        <CardContent className="p-6">
          <div className="flex items-center mb-6">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200">
              {user.profilePicture ? (
                <img 
                  src={user.profilePicture} 
                  alt={`${user.firstName || 'User'}'s profile`} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <i className="ri-user-line text-2xl"></i>
                </div>
              )}
            </div>
            <div className="ml-4">
              <h2 className="font-poppins text-xl font-bold text-[#212529]">
                {user.firstName || user.email?.split('@')[0] || 'User'}{user.age ? `, ${user.age}` : ''}
              </h2>
              <div className="flex items-center text-sm text-accent">
                <i className="ri-verified-badge-fill mr-1"></i>
                <span>Verified Profile</span>
              </div>
            </div>
            <button 
              className="ml-auto p-2 text-gray-400 hover:text-gray-600"
              onClick={handleEdit}
            >
              <i className="ri-edit-line text-xl"></i>
            </button>
          </div>
          
          <div className="mb-6">
            <h3 className="font-medium text-[#212529] mb-2">About Me</h3>
            <p className="text-gray-700">
              {user.aboutMe || 'No bio provided yet. Add some information about yourself!'}
            </p>
          </div>
          
          <div className="mb-6">
            <h3 className="font-medium text-[#212529] mb-2">My Photos & Video</h3>
            <div className="grid grid-cols-3 gap-3">
              {user.profilePicture ? (
                <div className="aspect-square rounded-lg overflow-hidden">
                  <img 
                    src={user.profilePicture} 
                    alt="Primary" 
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-square rounded-lg bg-[#E9ECEF] flex items-center justify-center">
                  <i className="ri-image-line text-xl text-gray-400"></i>
                </div>
              )}
              
              {user.profileVideo ? (
                <div className="aspect-square rounded-lg overflow-hidden">
                  <video 
                    src={user.profileVideo}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-square rounded-lg bg-[#E9ECEF] flex items-center justify-center">
                  <i className="ri-video-line text-xl text-gray-400"></i>
                </div>
              )}
              
              {user.additionalPicture1 ? (
                <div className="aspect-square rounded-lg overflow-hidden">
                  <img 
                    src={user.additionalPicture1} 
                    alt="Additional" 
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-square rounded-lg bg-[#E9ECEF] flex items-center justify-center">
                  <i className="ri-add-line text-xl text-gray-400"></i>
                </div>
              )}
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="font-medium text-[#212529] mb-2">Interests</h3>
            {user.interests && user.interests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {user.interests.map((interest, index) => (
                  <span key={index} className="bg-[#E9ECEF] px-3 py-1 rounded-full text-sm text-gray-700">
                    {interest}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No interests added yet</p>
            )}
          </div>
          
          <div className="mb-6">
            <h3 className="font-medium text-[#212529] mb-2">Subscription Status</h3>
            <div className="bg-gray-50 border border-[#E9ECEF] rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-600">Current Plan</span>
                <span className="font-medium text-[#212529]">
                  {user.subscriptionTier && user.subscriptionTier !== 'none' 
                    ? user.subscriptionTier.charAt(0).toUpperCase() + user.subscriptionTier.slice(1)
                    : 'None'}
                </span>
              </div>
              {(!user.subscriptionTier || user.subscriptionTier === 'none') && (
                <Button 
                  className="w-full mt-3 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
                  onClick={() => navigate('/app/messages')}
                >
                  Subscribe Now
                </Button>
              )}
            </div>
          </div>
          
          <div>
            <h3 className="font-medium text-[#212529] mb-2">Follow Our Founder</h3>
            <div className="bg-gray-50 border border-[#E9ECEF] rounded-lg p-4 flex flex-wrap gap-2">
              <a href="https://instagram.com/timcleverdate" target="_blank" rel="noopener noreferrer" className="flex items-center bg-white border border-[#E9ECEF] rounded-lg px-3 py-2 hover:bg-gray-50">
                <i className="ri-instagram-line text-xl text-gray-700 mr-2"></i>
                <span className="text-sm text-gray-700">Instagram</span>
              </a>
              <a href="https://twitter.com/timcleverdate" target="_blank" rel="noopener noreferrer" className="flex items-center bg-white border border-[#E9ECEF] rounded-lg px-3 py-2 hover:bg-gray-50">
                <i className="ri-twitter-x-line text-xl text-gray-700 mr-2"></i>
                <span className="text-sm text-gray-700">Twitter</span>
              </a>
              <a href="https://youtube.com/c/timcleverdate" target="_blank" rel="noopener noreferrer" className="flex items-center bg-white border border-[#E9ECEF] rounded-lg px-3 py-2 hover:bg-gray-50">
                <i className="ri-youtube-line text-xl text-gray-700 mr-2"></i>
                <span className="text-sm text-gray-700">YouTube</span>
              </a>
            </div>
          </div>

          <Button 
            variant="destructive"
            className="w-full mt-6"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
