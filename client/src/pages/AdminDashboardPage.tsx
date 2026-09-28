import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Gift,
  CreditCard,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Share2,
  Trash2,
  Plus,
  Radio,
  Shield,
  ShieldAlert,
  UserX,
  UserCheck,
  MonitorOff,
} from 'lucide-react';

type AdminStats = {
  users: number;
  verified: number;
  suspended: number;
  subscribed: number;
  matches: number;
  messages: number;
};

type AdminUser = {
  id: number;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  country: string | null;
  age: number | null;
  isVerified: boolean;
  isAdmin: boolean;
  isSuspended: boolean;
  suspendedReason: string | null;
  subscriptionTier: string;
  walletBalance: string;
  createdAt: string;
};

type VerificationRecord = {
  id: number;
  userId: number;
  status: string;
  faceMatchScore: string | null;
  verificationData: string | null;
  verificationMethod: string | null;
  rejectedReason: string | null;
  createdAt: string;
  user?: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    profilePicture: string | null;
    selfiePhoto: string | null;
    deviceId: string | null;
    isSuspended: boolean;
    isBanned: boolean;
  };
};

type PayPalStatus = {
  configured: boolean;
  clientIdMasked: string;
  clientSecretMasked: string;
  environment: 'sandbox' | 'live';
  dashboardUrl: string;
};

type SocialLink = {
  id: number;
  platform: string;
  url: string;
  isActive: boolean | null;
  createdAt: string | null;
};

const PLATFORM_ICONS: Record<string, string> = {
  instagram: 'ri-instagram-line',
  twitter: 'ri-twitter-x-line',
  facebook: 'ri-facebook-circle-line',
  youtube: 'ri-youtube-line',
  tiktok: 'ri-tiktok-line',
  whatsapp: 'ri-whatsapp-line',
  telegram: 'ri-telegram-line',
  linkedin: 'ri-linkedin-box-line',
  snapchat: 'ri-snapchat-line',
  website: 'ri-global-line',
};

const PLATFORM_OPTIONS = [
  'instagram', 'twitter', 'facebook', 'youtube',
  'tiktok', 'whatsapp', 'telegram', 'linkedin', 'snapchat', 'website',
];

export default function AdminDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Gift subscription form
  const [giftUserId, setGiftUserId] = useState('');
  const [giftTier, setGiftTier] = useState('basic');
  const [giftDays, setGiftDays] = useState('30');

  // Social media form
  const [newPlatform, setNewPlatform] = useState('instagram');
  const [newUrl, setNewUrl] = useState('');

  // Guard: only admins
  useEffect(() => {
    if (!authLoading && (!user || !(user as any).isAdmin)) {
      navigate('/');
    }
  }, [authLoading, user, navigate]);

  const isAdmin = !!user && (user as any).isAdmin;

  const statsQuery = useQuery<AdminStats>({
    queryKey: ['/api/admin/stats'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch('/api/admin/stats', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  const usersQuery = useQuery<AdminUser[]>({
    queryKey: ['/api/admin/users'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
  });

  const paypalQuery = useQuery<PayPalStatus>({
    queryKey: ['/api/admin/paypal-status'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch('/api/admin/paypal-status', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const socialsQuery = useQuery<SocialLink[]>({
    queryKey: ['/api/admin/socials'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch('/api/admin/socials', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const verificationsQuery = useQuery<VerificationRecord[]>({
    queryKey: ['/api/admin/verifications'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch('/api/admin/verifications', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const suspendMutation = useMutation({
    mutationFn: async ({ id, suspend, reason }: { id: number; suspend: boolean; reason?: string }) => {
      const path = suspend ? `/api/admin/users/${id}/suspend` : `/api/admin/users/${id}/unsuspend`;
      return await apiRequest('POST', path, suspend ? { reason } : {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      toast({ title: 'User updated' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Failed', description: e?.message }),
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: number) => apiRequest('POST', `/api/admin/users/${id}/verify`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      toast({ title: 'User manually verified' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Failed', description: e?.message }),
  });

  const giftMutation = useMutation({
    mutationFn: async ({ userId, tier, days }: { userId: number; tier: string; days: number }) =>
      apiRequest('POST', '/api/admin/gift-subscription', { userId, tier, days }),
    onSuccess: (_data: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      toast({ title: 'Subscription gifted!', description: `${vars.tier} given to user #${vars.userId} for ${vars.days} days.` });
      setGiftUserId('');
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Gift failed', description: e?.message }),
  });

  const addSocialMutation = useMutation({
    mutationFn: async ({ platform, url }: { platform: string; url: string }) =>
      apiRequest('POST', '/api/socials', { platform, url, isActive: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/socials'] });
      toast({ title: 'Social link added' });
      setNewUrl('');
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Failed to add', description: e?.message }),
  });

  const deleteSocialMutation = useMutation({
    mutationFn: async (id: number) => apiRequest('DELETE', `/api/admin/socials/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/socials'] });
      toast({ title: 'Social link removed' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Failed to delete', description: e?.message }),
  });

  const toggleSocialMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest('PATCH', `/api/admin/socials/${id}/toggle`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/socials'] });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Failed to toggle', description: e?.message }),
  });

  const approveVerificationMutation = useMutation({
    mutationFn: async (userId: number) => apiRequest('POST', `/api/admin/users/${userId}/verify`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/verifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      toast({ title: 'User approved ✓' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Failed', description: e?.message }),
  });

  const banUserMutation = useMutation({
    mutationFn: async ({ id, reason, banDevice }: { id: number; reason: string; banDevice: boolean }) =>
      apiRequest('POST', `/api/admin/users/${id}/ban`, { reason, banDevice }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/verifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      toast({ title: 'User banned' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Failed', description: e?.message }),
  });

  const handleGift = () => {
    const uid = parseInt(giftUserId, 10);
    const d = parseInt(giftDays, 10);
    if (isNaN(uid) || uid <= 0) { toast({ variant: 'destructive', title: 'Invalid user ID' }); return; }
    if (isNaN(d) || d <= 0 || d > 3650) { toast({ variant: 'destructive', title: 'Days must be 1–3650' }); return; }
    giftMutation.mutate({ userId: uid, tier: giftTier, days: d });
  };

  const handleAddSocial = () => {
    if (!newUrl.trim()) { toast({ variant: 'destructive', title: 'URL is required' }); return; }
    addSocialMutation.mutate({ platform: newPlatform, url: newUrl.trim() });
  };

  if (authLoading || !user || !(user as any).isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Checking access...</p>
        </div>
      </div>
    );
  }

  const stats = statsQuery.data;
  const users = usersQuery.data || [];
  const socials = socialsQuery.data || [];
  const verifications = verificationsQuery.data || [];
  const pendingVerifications = verifications.filter(v => v.status === 'pending_review' || v.status === 'pending');
  const recentVerifications = verifications.slice(0, 50);

  const statCards = [
    { label: 'Total accounts', value: stats?.users ?? '–', color: 'bg-blue-50 text-blue-700', icon: 'ri-user-line' },
    { label: 'Verified', value: stats?.verified ?? '–', color: 'bg-green-50 text-green-700', icon: 'ri-shield-check-line' },
    { label: 'Suspended', value: stats?.suspended ?? '–', color: 'bg-red-50 text-red-700', icon: 'ri-forbid-line' },
    { label: 'Paying members', value: stats?.subscribed ?? '–', color: 'bg-purple-50 text-purple-700', icon: 'ri-vip-crown-line' },
    { label: 'Matches', value: stats?.matches ?? '–', color: 'bg-pink-50 text-pink-700', icon: 'ri-heart-3-line' },
    { label: 'Messages', value: stats?.messages ?? '–', color: 'bg-amber-50 text-amber-700', icon: 'ri-chat-3-line' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary to-primary/90 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="ri-shield-star-line text-2xl" />
            <div>
              <h1 className="font-poppins font-bold text-lg">Owner Dashboard</h1>
              <p className="text-xs text-white/80">Clever Date Match — admin view</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigate('/admin/live')}
              className="bg-red-600 hover:bg-red-500 text-white font-bold shadow-lg"
              size="sm"
            >
              <Radio className="h-4 w-4 mr-1.5 animate-pulse" />
              Go Live
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/app/')}>
              Back to app
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* ── Stats grid ───────────────────────────────────── */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {statCards.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-lg ${s.color} flex items-center justify-center mb-2`}>
                  <i className={`${s.icon} text-xl`} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* ── PayPal account status ──────────────────────────── */}
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-green-800">
              <CreditCard className="h-5 w-5" />
              PayPal Business payment account
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paypalQuery.isLoading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : (
              <div className="space-y-4">
                {/* Connection status */}
                <div className="flex items-center gap-3">
                  {paypalQuery.data?.configured ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  )}
                  <div>
                    <p className={`font-semibold text-sm ${paypalQuery.data?.configured ? 'text-green-700' : 'text-red-700'}`}>
                      {paypalQuery.data?.configured ? `Connected — ${paypalQuery.data.environment} payments` : 'Not connected — payments are disabled'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      All payments go directly to your PayPal Business account
                    </p>
                  </div>
                </div>

                {/* Key status rows */}
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Client ID</p>
                    <p className="font-mono text-sm text-gray-800 truncate">
                      {paypalQuery.data?.clientIdMasked || <span className="text-red-400 italic">Not set</span>}
                    </p>
                  </div>
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Client Secret</p>
                    <p className="font-mono text-sm text-gray-800 truncate">
                      {paypalQuery.data?.clientSecretMasked || <span className="text-red-400 italic">Not set</span>}
                    </p>
                  </div>
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Environment</p>
                    <p className={`text-sm font-medium ${paypalQuery.data?.environment === 'live' ? 'text-green-600' : 'text-amber-600'}`}>
                      {paypalQuery.data?.environment || 'unknown'}
                    </p>
                  </div>
                </div>

                {/* Setup instructions */}
                {!paypalQuery.data?.configured && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <p className="font-semibold mb-2">How to connect your PayPal Business account:</p>
                    <ol className="list-decimal list-inside space-y-1 text-amber-700">
                      <li>Open PayPal Developer Dashboard (link below)</li>
                      <li>Open <strong>Apps &amp; Credentials</strong> and choose the correct environment</li>
                      <li>Copy the app's <strong>Client ID</strong> and <strong>Secret</strong></li>
                      <li>Open the <strong>Replit Secrets panel</strong> (🔒 icon) and add:</li>
                    </ol>
                    <div className="mt-3 bg-amber-100 rounded-lg p-3 font-mono text-xs space-y-1">
                      <div><span className="text-amber-900">PAYPAL_CLIENT_ID</span> = your-client-id</div>
                      <div><span className="text-amber-900">PAYPAL_CLIENT_SECRET</span> = your-client-secret</div>
                      <div><span className="text-amber-900">PAYPAL_ENVIRONMENT</span> = sandbox or live</div>
                    </div>
                  </div>
                )}

                <a
                  href={paypalQuery.data?.dashboardUrl || 'https://developer.paypal.com/dashboard/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-green-700 hover:text-green-800 font-medium"
                >
                  Open PayPal Developer Dashboard <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Social media manager ──────────────────────────── */}
        <Card className="border-blue-200 bg-blue-50/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Share2 className="h-5 w-5" />
              Social media accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              These links appear in the app footer and profile pages. Toggle to show or hide each one.
            </p>

            {/* Add new */}
            <div className="grid sm:grid-cols-3 gap-3 items-end bg-white border rounded-xl p-4">
              <div className="space-y-1">
                <Label>Platform</Label>
                <Select value={newPlatform} onValueChange={setNewPlatform}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-1">
                <Label>Profile URL</Label>
                <Input
                  placeholder="https://instagram.com/yourpage"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSocial(); }}
                />
              </div>
              <Button
                onClick={handleAddSocial}
                disabled={addSocialMutation.isPending || !newUrl.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add link
              </Button>
            </div>

            {/* Current links */}
            {socialsQuery.isLoading ? (
              <p className="text-sm text-gray-500 py-4 text-center">Loading...</p>
            ) : socials.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No social links yet. Add one above.</p>
            ) : (
              <div className="space-y-2">
                {socials.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 bg-white border rounded-xl px-4 py-3">
                    <i className={`${PLATFORM_ICONS[s.platform] ?? 'ri-global-line'} text-xl text-gray-600`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize text-gray-800">{s.platform}</p>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline truncate block max-w-xs"
                      >
                        {s.url}
                      </a>
                    </div>
                    <Switch
                      checked={!!s.isActive}
                      onCheckedChange={(checked) => toggleSocialMutation.mutate({ id: s.id, isActive: checked })}
                      title={s.isActive ? 'Visible in app' : 'Hidden'}
                    />
                    <Badge variant={s.isActive ? 'default' : 'secondary'} className="text-xs w-14 justify-center">
                      {s.isActive ? 'Live' : 'Hidden'}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => {
                        if (confirm(`Remove ${s.platform} link?`)) deleteSocialMutation.mutate(s.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Gift subscription ─────────────────────────────── */}
        <Card className="border-purple-200 bg-purple-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-purple-700">
              <Gift className="h-5 w-5" />
              Gift a subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Give any user a paid subscription tier for free. Great for rewarding early users or testers.
            </p>
            <div className="grid sm:grid-cols-4 gap-3 items-end">
              <div className="space-y-1">
                <Label htmlFor="gift-user-id">User ID</Label>
                <Input
                  id="gift-user-id"
                  type="number"
                  placeholder="e.g. 42"
                  value={giftUserId}
                  onChange={(e) => setGiftUserId(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gift-tier">Plan</Label>
                <Select value={giftTier} onValueChange={setGiftTier}>
                  <SelectTrigger id="gift-tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="silver">Silver</SelectItem>
                    <SelectItem value="diamond">Diamond</SelectItem>
                    <SelectItem value="gold">Gold (1 year)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="gift-days">Days</Label>
                <Input
                  id="gift-days"
                  type="number"
                  min={1}
                  max={3650}
                  value={giftDays}
                  onChange={(e) => setGiftDays(e.target.value)}
                />
              </div>
              <Button
                onClick={handleGift}
                disabled={giftMutation.isPending || !giftUserId}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {giftMutation.isPending ? 'Gifting...' : 'Gift plan'}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Tip: click the "Gift" button next to any user in the table below to pre-fill the ID.
            </p>
          </CardContent>
        </Card>

        {/* ── Verification Queue ────────────────────────────── */}
        <Card className={`${pendingVerifications.length > 0 ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'}`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className={`h-5 w-5 ${pendingVerifications.length > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
              <span className={pendingVerifications.length > 0 ? 'text-amber-800' : ''}>
                Identity Verification
              </span>
              {pendingVerifications.length > 0 && (
                <Badge className="bg-amber-500 text-white ml-1">{pendingVerifications.length} pending</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {verificationsQuery.isLoading ? (
              <p className="text-sm text-gray-500 py-4 text-center">Loading verification data...</p>
            ) : recentVerifications.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No verifications yet.</p>
            ) : (
              <div className="space-y-3">
                {/* Pending review section */}
                {pendingVerifications.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4" /> Needs your review
                    </p>
                    {pendingVerifications.map((v) => (
                      <div key={v.id} className="bg-white border-2 border-amber-300 rounded-2xl p-4 shadow-sm">
                        <div className="flex gap-4 items-start">
                          {/* Selfie */}
                          <div className="flex-none">
                            <p className="text-xs text-gray-500 mb-1 text-center">Selfie</p>
                            {v.verificationData ? (
                              <img
                                src={`data:image/jpeg;base64,${v.verificationData}`}
                                alt="Selfie"
                                className="w-20 h-20 rounded-xl object-cover border-2 border-amber-200"
                              />
                            ) : v.user?.selfiePhoto ? (
                              <img
                                src={`data:image/jpeg;base64,${v.user.selfiePhoto}`}
                                alt="Selfie"
                                className="w-20 h-20 rounded-xl object-cover border-2 border-amber-200"
                              />
                            ) : (
                              <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center border">
                                <Shield className="w-8 h-8 text-gray-300" />
                              </div>
                            )}
                          </div>
                          {/* Profile photo */}
                          <div className="flex-none">
                            <p className="text-xs text-gray-500 mb-1 text-center">Profile</p>
                            {v.user?.profilePicture ? (
                              <img
                                src={v.user.profilePicture}
                                alt="Profile"
                                className="w-20 h-20 rounded-xl object-cover border-2 border-gray-200"
                                onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
                              />
                            ) : (
                              <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center border">
                                <span className="text-gray-300 text-xs">No photo</span>
                              </div>
                            )}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-800">
                                {v.user ? `${v.user.firstName || ''} ${v.user.lastName || ''}`.trim() || `User #${v.userId}` : `User #${v.userId}`}
                              </p>
                              <Badge variant={v.status === 'approved' ? 'default' : v.status === 'rejected' ? 'destructive' : 'secondary'} className={v.status === 'pending_review' ? 'bg-amber-100 text-amber-800 border-amber-300' : ''}>
                                {v.status.replace('_', ' ')}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{v.user?.email || v.user?.phone || 'No contact'}</p>
                            {v.faceMatchScore && (
                              <p className="text-xs mt-1">
                                <span className="font-medium text-gray-600">Face match score: </span>
                                <span className={parseFloat(v.faceMatchScore) < 0.45 ? 'text-green-600 font-bold' : parseFloat(v.faceMatchScore) < 0.65 ? 'text-amber-600 font-bold' : 'text-red-600 font-bold'}>
                                  {v.faceMatchScore} {parseFloat(v.faceMatchScore) < 0.45 ? '✓ Good' : parseFloat(v.faceMatchScore) < 0.65 ? '⚠ Borderline' : '✗ Mismatch'}
                                </span>
                              </p>
                            )}
                            {v.rejectedReason && <p className="text-xs text-red-500 mt-0.5 truncate">{v.rejectedReason}</p>}
                            {v.user?.deviceId && <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">Device: {v.user.deviceId}</p>}
                            <p className="text-xs text-gray-400 mt-0.5">{new Date(v.createdAt).toLocaleString()}</p>

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2 mt-3">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
                                onClick={() => approveVerificationMutation.mutate(v.userId)}
                                disabled={approveVerificationMutation.isPending}
                              >
                                <UserCheck className="w-3.5 h-3.5 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-300 hover:bg-red-50 h-8 text-xs"
                                onClick={() => {
                                  const reason = window.prompt('Ban reason?', 'Failed identity verification');
                                  if (reason !== null) banUserMutation.mutate({ id: v.userId, reason, banDevice: false });
                                }}
                                disabled={banUserMutation.isPending}
                              >
                                <UserX className="w-3.5 h-3.5 mr-1" /> Ban
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-700 border-red-400 hover:bg-red-50 h-8 text-xs"
                                onClick={() => {
                                  const reason = window.prompt('Ban reason (will also ban device)?', 'Failed identity verification');
                                  if (reason !== null) banUserMutation.mutate({ id: v.userId, reason, banDevice: true });
                                }}
                                disabled={banUserMutation.isPending}
                              >
                                <MonitorOff className="w-3.5 h-3.5 mr-1" /> Ban + Device
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => suspendMutation.mutate({ id: v.userId, suspend: false })}
                                disabled={suspendMutation.isPending}
                              >
                                Unsuspend
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent verifications summary */}
                <details className="group">
                  <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 list-none flex items-center gap-1">
                    <Shield className="w-4 h-4" />
                    View all recent verifications ({recentVerifications.length})
                    <span className="text-xs text-gray-400 ml-1 group-open:hidden">▶</span>
                    <span className="text-xs text-gray-400 ml-1 hidden group-open:inline">▼</span>
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentVerifications.map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="text-sm">
                              <div className="font-medium">{v.user ? `${v.user.firstName || ''} ${v.user.lastName || ''}`.trim() || `#${v.userId}` : `#${v.userId}`}</div>
                              <div className="text-xs text-gray-400">{v.user?.email || v.user?.phone || ''}</div>
                            </TableCell>
                            <TableCell className="text-xs">{v.verificationMethod || 'selfie+phone'}</TableCell>
                            <TableCell className="text-xs font-mono">{v.faceMatchScore || '—'}</TableCell>
                            <TableCell>
                              <Badge variant={v.status === 'approved' ? 'default' : v.status === 'rejected' ? 'destructive' : 'secondary'} className={`text-xs ${v.status === 'pending_review' ? 'bg-amber-100 text-amber-800' : v.status === 'approved' ? 'bg-green-100 text-green-800' : ''}`}>
                                {v.status.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">{new Date(v.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell className="space-x-1">
                              {v.status !== 'approved' && (
                                <Button size="sm" variant="outline" className="text-xs h-7 text-green-700 border-green-300"
                                  onClick={() => approveVerificationMutation.mutate(v.userId)}
                                  disabled={approveVerificationMutation.isPending}>
                                  Approve
                                </Button>
                              )}
                              {v.status !== 'rejected' && (
                                <Button size="sm" variant="outline" className="text-xs h-7 text-red-600 border-red-300"
                                  onClick={() => {
                                    const reason = window.prompt('Ban reason?', 'Policy violation');
                                    if (reason !== null) banUserMutation.mutate({ id: v.userId, reason, banDevice: false });
                                  }}
                                  disabled={banUserMutation.isPending}>
                                  Ban
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </details>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Users table ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <i className="ri-group-line" />
              All accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {usersQuery.isLoading ? (
              <p className="text-gray-500 text-sm py-8 text-center">Loading users...</p>
            ) : users.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center">No accounts yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs">{u.id}</TableCell>
                      <TableCell className="text-sm">
                        <div>{u.email || '—'}</div>
                        {u.phone && <div className="text-xs text-gray-500">{u.phone}</div>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(u.firstName || u.lastName)
                          ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
                          : <span className="text-gray-400">No profile</span>}
                        {u.gender && (
                          <div className="text-xs text-gray-500">
                            {u.gender}{u.age ? `, ${u.age}` : ''}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{u.country || '—'}</TableCell>
                      <TableCell className="space-y-1">
                        {u.isAdmin && <Badge className="bg-purple-600">Admin</Badge>}
                        {u.isSuspended ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : u.isVerified ? (
                          <Badge className="bg-green-600">Verified</Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{u.subscriptionTier}</TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        {!u.isVerified && !u.isAdmin && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => verifyMutation.mutate(u.id)}
                            disabled={verifyMutation.isPending}
                          >
                            Verify
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-purple-600 border-purple-300 hover:bg-purple-50"
                          onClick={() => {
                            setGiftUserId(String(u.id));
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          Gift
                        </Button>
                        {!u.isAdmin && (
                          u.isSuspended ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => suspendMutation.mutate({ id: u.id, suspend: false })}
                              disabled={suspendMutation.isPending}
                            >
                              Unsuspend
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                const reason = window.prompt('Reason for suspension?', 'Violated community guidelines');
                                if (reason !== null) suspendMutation.mutate({ id: u.id, suspend: true, reason });
                              }}
                              disabled={suspendMutation.isPending}
                            >
                              Suspend
                            </Button>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
