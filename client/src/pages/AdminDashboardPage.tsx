import { useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';

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

export default function AdminDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Guard: only admins
  useEffect(() => {
    if (!authLoading && (!user || !(user as any).isAdmin)) {
      navigate('/');
    }
  }, [authLoading, user, navigate]);

  const statsQuery = useQuery<AdminStats>({
    queryKey: ['/api/admin/stats'],
    enabled: !!user && (user as any).isAdmin,
  });

  const usersQuery = useQuery<AdminUser[]>({
    queryKey: ['/api/admin/users'],
    enabled: !!user && (user as any).isAdmin,
  });

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
    onError: (e: any) => toast({ variant: 'destructive', title: 'Failed', description: e?.message || 'Try again' }),
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('POST', `/api/admin/users/${id}/verify`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      toast({ title: 'User manually verified' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Failed', description: e?.message || 'Try again' }),
  });

  if (authLoading || !user || !(user as any).isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Checking access...</p>
        </div>
      </div>
    );
  }

  const stats = statsQuery.data;
  const users = usersQuery.data || [];

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
      <header className="bg-gradient-to-r from-primary to-primary/90 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="ri-shield-star-line text-2xl"></i>
            <div>
              <h1 className="font-poppins font-bold text-lg">Owner Dashboard</h1>
              <p className="text-xs text-white/80">Tim Clever Date — admin view</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/app/')}
            data-testid="button-back-to-app"
          >
            Back to app
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Stats grid */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {statCards.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-lg ${s.color} flex items-center justify-center mb-2`}>
                  <i className={`${s.icon} text-xl`}></i>
                </div>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Users table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <i className="ri-group-line"></i>
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
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell className="font-mono text-xs">{u.id}</TableCell>
                      <TableCell className="text-sm">
                        <div>{u.email || '—'}</div>
                        {u.phone && <div className="text-xs text-gray-500">{u.phone}</div>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(u.firstName || u.lastName)
                          ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
                          : <span className="text-gray-400">No profile</span>}
                        {u.gender && <div className="text-xs text-gray-500">{u.gender}{u.age ? `, ${u.age}` : ''}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{u.country || '—'}</TableCell>
                      <TableCell className="space-y-1">
                        {u.isAdmin && <Badge variant="default" className="bg-purple-600">Admin</Badge>}
                        {u.isSuspended ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : u.isVerified ? (
                          <Badge variant="default" className="bg-green-600">Verified</Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{u.subscriptionTier}</TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        {!u.isVerified && !u.isAdmin && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => verifyMutation.mutate(u.id)}
                            disabled={verifyMutation.isPending}
                            data-testid={`button-verify-${u.id}`}
                          >
                            Verify
                          </Button>
                        )}
                        {!u.isAdmin && (
                          u.isSuspended ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => suspendMutation.mutate({ id: u.id, suspend: false })}
                              disabled={suspendMutation.isPending}
                              data-testid={`button-unsuspend-${u.id}`}
                            >
                              Unsuspend
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                const reason = window.prompt('Reason for suspension?', 'Violated community guidelines');
                                if (reason !== null) {
                                  suspendMutation.mutate({ id: u.id, suspend: true, reason });
                                }
                              }}
                              disabled={suspendMutation.isPending}
                              data-testid={`button-suspend-${u.id}`}
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
