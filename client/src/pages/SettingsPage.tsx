import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft, Lock, Trash2, AlertTriangle, ChevronRight,
  Shield, Bell, Eye, UserCircle,
} from 'lucide-react';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // ── Change password ───────────────────────────────────
  const [pwSection, setPwSection] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const changePwMutation = useMutation({
    mutationFn: () =>
      apiRequest('PATCH', '/users/me', { currentPassword: currentPw, newPassword: newPw }),
    onSuccess: () => {
      toast({ title: 'Password updated', description: 'Your password has been changed.' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwSection(false);
    },
    onError: (e: any) =>
      toast({ variant: 'destructive', title: 'Failed', description: e.message || 'Could not update password.' }),
  });

  const handleChangePw = () => {
    if (newPw.length < 8) return toast({ variant: 'destructive', title: 'Too short', description: 'New password must be at least 8 characters.' });
    if (newPw !== confirmPw) return toast({ variant: 'destructive', title: 'Mismatch', description: "Passwords don't match." });
    changePwMutation.mutate();
  };

  // ── Delete account ───────────────────────────────────
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm1' | 'confirm2'>('idle');
  const [deleteText, setDeleteText] = useState('');

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/users/me', {}),
    onSuccess: async () => {
      toast({ title: 'Account deleted', description: 'All your data has been permanently removed.' });
      await logout();
      navigate('~/');
    },
    onError: (e: any) => {
      toast({ variant: 'destructive', title: 'Deletion failed', description: e.message || 'Please try again.' });
      setDeleteStep('idle');
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a237e] via-[#1565c0] to-[#0d47a1] text-white px-4 pt-10 pb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('~/app/profile')}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold font-poppins">Account Settings</h1>
        </div>
        {user && (
          <div className="mt-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 overflow-hidden flex items-center justify-center">
              {user.profilePicture
                ? <img src={user.profilePicture} alt="avatar" className="w-full h-full object-cover" />
                : <UserCircle className="w-7 h-7 text-white/70" />}
            </div>
            <div>
              <p className="font-semibold">{user.firstName || user.email?.split('@')[0] || 'User'}</p>
              <p className="text-sm text-white/70">{user.email || user.phone}</p>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-5 space-y-4 max-w-lg mx-auto">

        {/* Security */}
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Security</p>
            </div>

            {/* Change Password toggle */}
            <button
              onClick={() => setPwSection(v => !v)}
              className="w-full flex items-center px-4 py-4 hover:bg-gray-50 transition-colors"
            >
              <Lock className="w-5 h-5 text-blue-600 mr-3" />
              <span className="flex-1 text-left text-sm font-medium text-gray-800">Change Password</span>
              <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${pwSection ? 'rotate-90' : ''}`} />
            </button>

            {pwSection && (
              <div className="px-4 pb-4 space-y-3 border-t bg-gray-50">
                <div className="pt-3 space-y-2">
                  <Input
                    type="password"
                    placeholder="Current password"
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="New password (min 8 chars)"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                  />
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setPwSection(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-blue-700 hover:bg-blue-800 text-white"
                      onClick={handleChangePw}
                      disabled={!currentPw || !newPw || !confirmPw || changePwMutation.isPending}
                    >
                      {changePwMutation.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Privacy */}
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Privacy</p>
            </div>
            <div className="flex items-center px-4 py-4">
              <Shield className="w-5 h-5 text-blue-600 mr-3" />
              <span className="flex-1 text-sm font-medium text-gray-800">Profile Visibility</span>
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">Visible</span>
            </div>
            <div className="flex items-center px-4 py-4 border-t">
              <Eye className="w-5 h-5 text-blue-600 mr-3" />
              <span className="flex-1 text-sm font-medium text-gray-800">Show Age on Profile</span>
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">On</span>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Notifications</p>
            </div>
            <div className="flex items-center px-4 py-4">
              <Bell className="w-5 h-5 text-blue-600 mr-3" />
              <span className="flex-1 text-sm font-medium text-gray-800">New Match Alerts</span>
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">On</span>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone — Delete Account */}
        <Card className="border-red-100">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-red-100">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">Danger Zone</p>
            </div>

            {deleteStep === 'idle' && (
              <button
                onClick={() => setDeleteStep('confirm1')}
                className="w-full flex items-center px-4 py-4 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-5 h-5 text-red-500 mr-3" />
                <span className="flex-1 text-left text-sm font-medium text-red-600">Delete My Account</span>
                <ChevronRight className="w-4 h-4 text-red-300" />
              </button>
            )}

            {deleteStep === 'confirm1' && (
              <div className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Delete account permanently?</p>
                    <p className="text-xs text-red-600 mt-1">
                      Your profile, photos, messages, matches, and all personal data will be permanently erased.
                      This cannot be undone.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setDeleteStep('idle')}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="destructive" className="flex-1" onClick={() => setDeleteStep('confirm2')}>
                    Yes, continue
                  </Button>
                </div>
              </div>
            )}

            {deleteStep === 'confirm2' && (
              <div className="p-4 space-y-3">
                <p className="text-sm font-semibold text-red-700">Final step</p>
                <p className="text-xs text-red-600">
                  Type <strong>DELETE</strong> below to permanently remove your account.
                </p>
                <Input
                  value={deleteText}
                  onChange={e => setDeleteText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="border-red-300 focus-visible:ring-red-400"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setDeleteStep('idle'); setDeleteText(''); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    disabled={deleteText !== 'DELETE' || deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate()}
                  >
                    {deleteMutation.isPending ? 'Deleting…' : 'Delete forever'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 pb-6">
          Clever Date Match · Your data is protected and never sold.
        </p>
      </div>
    </div>
  );
}
