import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, CheckCircle2, ImageIcon, Plus, Instagram, Twitter, Youtube, UserCircle, Settings, Shield, Clock, AlertTriangle, ArrowRight, ShieldCheck, PhoneCall, Smartphone } from 'lucide-react';
import { VideoProfilePlayer } from '@/components/VideoProfilePlayer';

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

  // Determine user identity verification standing
  const isVerified = Boolean(user.isVerified);
  const isPending = Boolean((user as any).isSuspended && (user as any).suspendedReason?.toLowerCase().includes('review'));
  const verificationStatus: 'Verified' | 'Pending' | 'Verification Required' =
    isVerified ? 'Verified' : isPending ? 'Pending' : 'Verification Required';

  return (
    <div className="px-4 pb-6 space-y-4 max-w-xl mx-auto">
      <Card className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <CardContent className="p-6">
          {/* Avatar + name + dynamic status badge */}
          <div className="flex items-center mb-6">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 shrink-0 border-2 border-white shadow-sm relative">
              {user.profilePicture ? (
                <img
                  src={user.profilePicture}
                  alt={`${user.firstName || 'User'}'s profile`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100">
                  <UserCircle className="w-9 h-9" />
                </div>
              )}
            </div>
            <div className="ml-4 flex-1 min-w-0">
              <h2 className="font-poppins text-xl font-bold text-gray-900 leading-tight">
                {user.firstName || user.email?.split('@')[0] || 'User'}
                {user.age ? `, ${user.age}` : ''}
              </h2>

              {/* Dynamic Verification Status Badge */}
              <div className="mt-1 flex items-center">
                {verificationStatus === 'Verified' && (
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Verified</span>
                  </div>
                )}

                {verificationStatus === 'Pending' && (
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                    <span>Pending Review</span>
                  </div>
                )}

                {verificationStatus === 'Verification Required' && (
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Verification Required</span>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => navigate('~/create-profile')}
              className="ml-2 p-2.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              title="Edit profile"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>

          {/* Identity Check & Account Standing Card */}
          <div className="mb-6 p-4 rounded-2xl border transition-all bg-slate-50 border-slate-200">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`w-5 h-5 ${isVerified ? 'text-emerald-600' : 'text-blue-600'}`} />
                <h3 className="font-bold text-sm text-gray-900">Identity Check Status</h3>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                isVerified ? 'bg-emerald-100 text-emerald-800' :
                isPending  ? 'bg-amber-100 text-amber-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {verificationStatus}
              </span>
            </div>

            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              {isVerified
                ? 'Your account has passed real-time 3D biometric liveness and face match security checks. Your profile displays an official verified badge.'
                : isPending
                ? 'Your biometric face scan is currently being reviewed by our trust & safety team. You will be notified shortly.'
                : 'Complete your 3D biometric face scan to confirm your identity and activate messaging, matching, and verified trust badge.'}
            </p>

            <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
              <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-gray-100">
                <Shield className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-600 truncate">
                  Biometrics: <strong className={isVerified ? 'text-emerald-600' : 'text-gray-700'}>{isVerified ? 'Confirmed ✓' : 'Required'}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-gray-100">
                <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-600 truncate">
                  Face Match: <strong className={isVerified ? 'text-emerald-600' : 'text-gray-700'}>{isVerified ? 'Active ✓' : 'Pending'}</strong>
                </span>
              </div>
            </div>

            {!isVerified && (
              <Button
                className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5"
                onClick={() => navigate('~/verify')}
              >
                <span>Complete Identity Verification</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          {/* Video Profile Player (Firebase Storage) */}
          <div className="mb-6">
            <VideoProfilePlayer user={user} isOwnProfile={true} />
          </div>

          {/* About Me */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">About Me</h3>
            <p className="text-gray-700 text-sm leading-relaxed">
              {user.aboutMe || 'No bio yet. Tap the pencil to add some information about yourself!'}
            </p>
          </div>

          {/* How I Want My Match to Be */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800">How I Want My Match to Be</h3>
              <button
                onClick={() => navigate('~/create-profile')}
                className="text-xs text-blue-600 font-medium hover:underline"
              >Edit</button>
            </div>
            <p className="text-gray-700 text-sm leading-relaxed bg-blue-50/60 border border-blue-100 rounded-xl p-3">
              {(user as any).idealMatch || 'Not specified yet. Tap Edit to describe the kind of 1-on-1 match you are looking for.'}
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
                <div className="aspect-square rounded-xl overflow-hidden shadow-xs">
                  <img src={user.profilePicture} alt="Primary" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-square rounded-xl bg-gray-100 flex flex-col items-center justify-center gap-1 text-gray-400">
                  <ImageIcon className="w-6 h-6" />
                  <span className="text-[10px]">Primary</span>
                </div>
              )}

              {(user as any).additionalPicture1 ? (
                <div className="aspect-square rounded-xl overflow-hidden shadow-xs">
                  <img src={(user as any).additionalPicture1} alt="Photo 2" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-square rounded-xl bg-gray-100 flex flex-col items-center justify-center gap-1 text-gray-400">
                  <Plus className="w-6 h-6" />
                  <span className="text-[10px]">Photo 2</span>
                </div>
              )}

              {(user as any).additionalPicture2 ? (
                <div className="aspect-square rounded-xl overflow-hidden shadow-xs">
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
            <h3 className="font-semibold text-gray-800 mb-2">My Interests</h3>
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
                  onClick={() => navigate('~/app/subscribe')}
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
              <a href="https://instagram.com/cleverdatematch" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors">
                <Instagram className="w-4 h-4 text-pink-500" />
                <span className="text-sm text-gray-700">Instagram</span>
              </a>
              <a href="https://twitter.com/cleverdatematch" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors">
                <Twitter className="w-4 h-4 text-sky-500" />
                <span className="text-sm text-gray-700">Twitter</span>
              </a>
              <a href="https://youtube.com/c/cleverdatematch" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors">
                <Youtube className="w-4 h-4 text-red-500" />
                <span className="text-sm text-gray-700">YouTube</span>
              </a>
            </div>
          </div>

          {/* Account Settings + Logout */}
          <Button
            variant="outline"
            className="w-full rounded-xl mb-3 border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-2"
            onClick={() => navigate('~/app/settings')}
          >
            <Settings className="w-4 h-4" />
            Account Settings
          </Button>

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
