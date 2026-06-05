import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, CheckCircle2, ImageIcon, VideoIcon, Plus, Instagram, Twitter, Youtube, UserCircle } from 'lucide-react';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('~/');
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
    <div className="px-4 pb-4 space-y-4">
      <Card className="bg-white rounded-xl shadow-md overflow-hidden">
        <CardContent className="p-6">
          {/* Avatar + name */}
          <div className="flex items-center mb-6">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 shrink-0">
              {user.profilePicture ? (
                <img
                  src={user.profilePicture}
                  alt={`${user.firstName || 'User'}'s profile`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <UserCircle className="w-8 h-8" />
                </div>
              )}
            </div>
            <div className="ml-4 flex-1 min-w-0">
              <h2 className="font-poppins text-xl font-bold text-gray-900">
                {user.firstName || user.email?.split('@')[0] || 'User'}
                {user.age ? `, ${user.age}` : ''}
              </h2>
              <div className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verified Profile</span>
              </div>
            </div>
            <button
              onClick={() => navigate('~/create-profile')}
              className="ml-2 p-2 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              title="Edit profile"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>

          {/* About Me */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">About Me</h3>
            <p className="text-gray-700 text-sm leading-relaxed">
              {user.aboutMe || 'No bio yet. Tap the pencil to add some information about yourself!'}
            </p>
          </div>

          {/* Photos */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800">My Photos</h3>
              <button
                onClick={() => navigate('~/create-profile')}
                className="text-xs text-blue-600 font-medium hover:underline"
              >Edit photos</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {user.profilePicture ? (
                <div className="aspect-square rounded-xl overflow-hidden">
                  <img src={user.profilePicture} alt="Primary" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-square rounded-xl bg-gray-100 flex flex-col items-center justify-center gap-1 text-gray-400">
                  <ImageIcon className="w-6 h-6" />
                  <span className="text-[10px]">Primary</span>
                </div>
              )}

              {(user as any).additionalPicture1 ? (
                <div className="aspect-square rounded-xl overflow-hidden">
                  <img src={(user as any).additionalPicture1} alt="Photo 2" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-square rounded-xl bg-gray-100 flex flex-col items-center justify-center gap-1 text-gray-400">
                  <Plus className="w-6 h-6" />
                  <span className="text-[10px]">Photo 2</span>
                </div>
              )}

              {(user as any).additionalPicture2 ? (
                <div className="aspect-square rounded-xl overflow-hidden">
                  <img src={(user as any).additionalPicture2} alt="Photo 3" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-square rounded-xl bg-gray-100 flex flex-col items-center justify-center gap-1 text-gray-400">
                  <Plus className="w-6 h-6" />
                  <span className="text-[10px]">Photo 3</span>
                </div>
              )}
            </div>
          </div>

          {/* Interests */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">Interests</h3>
            {user.interests && user.interests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {user.interests.map((interest, index) => (
                  <span key={index} className="bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-full text-sm font-medium">
                    {interest}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No interests added yet</p>
            )}
          </div>

          {/* Subscription */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">Subscription Status</h3>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-600 text-sm">Current Plan</span>
                <span className="font-semibold text-gray-900">
                  {user.subscriptionTier && user.subscriptionTier !== 'none'
                    ? user.subscriptionTier.charAt(0).toUpperCase() + user.subscriptionTier.slice(1)
                    : 'None'}
                </span>
              </div>
              {(!user.subscriptionTier || user.subscriptionTier === 'none') && (
                <Button
                  className="w-full mt-3 bg-gradient-to-r from-blue-800 to-blue-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
                  onClick={() => navigate('~/app/messages')}
                >
                  Subscribe Now
                </Button>
              )}
            </div>
          </div>

          {/* Follow founder */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">Follow Our Founder</h3>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-wrap gap-2">
              <a href="https://instagram.com/timcleverdate" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors">
                <Instagram className="w-4 h-4 text-pink-500" />
                <span className="text-sm text-gray-700">Instagram</span>
              </a>
              <a href="https://twitter.com/timcleverdate" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors">
                <Twitter className="w-4 h-4 text-sky-500" />
                <span className="text-sm text-gray-700">Twitter</span>
              </a>
              <a href="https://youtube.com/c/timcleverdate" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors">
                <Youtube className="w-4 h-4 text-red-500" />
                <span className="text-sm text-gray-700">YouTube</span>
              </a>
            </div>
          </div>

          <Button
            variant="destructive"
            className="w-full rounded-xl"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
