import { useState } from 'react';
import { Loader2, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminOps } from '@/hooks/useAdminOps';
import { useAuth } from '@/contexts/AuthContext';
import { AdminPagination, usePagination } from '@/components/admin/AdminPagination';

/** Delegate OneCare platform-admin access and review pending tenant owner invitations. */
export function AdminAccessPanel() {
  const { user } = useAuth();
  const {
    admins,
    isLoadingAdmins,
    invitations,
    isLoadingInvitations,
    grantAdmin,
    isGranting,
    revokeAdmin,
    cancelInvitation,
  } = useAdminOps();
  const [email, setEmail] = useState('');
  const adminPage = usePagination(admins, 10);
  const invitePage = usePagination(invitations, 10);

  const handleGrant = async () => {
    await grantAdmin(email.trim());
    setEmail('');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Platform admins
          </CardTitle>
          <CardDescription>
            Anyone here can manage every tenant on OneCare. They must already have a OneCare
            account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@onecare.you"
            />
            <Button onClick={handleGrant} disabled={isGranting || !email.includes('@')}>
              {isGranting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Grant access
            </Button>
          </div>

          {isLoadingAdmins ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {adminPage.pageItems.map((a) => (
                <div
                  key={a.user_id}
                  className="flex items-center justify-between rounded-lg border p-3 gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Since {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {a.user_id === user?.id ? (
                    <Badge variant="secondary">You</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => revokeAdmin(a.user_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove admin access</span>
                    </Button>
                  )}
                </div>
              ))}
              <AdminPagination
                page={adminPage.page}
                pageCount={adminPage.pageCount}
                total={adminPage.total}
                pageSize={adminPage.pageSize}
                onPageChange={adminPage.setPage}
                label="admins"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenant owner invitations</CardTitle>
          <CardDescription>
            People invited to run a hospital or practice on OneCare.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingInvitations ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No invitations yet.</p>
          ) : (
            <div className="space-y-2">
              {invitePage.pageItems.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{inv.email}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {inv.practice_name} · invited{' '}
                      {new Date(inv.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={inv.status === 'accepted' ? 'default' : 'secondary'}
                      className="capitalize"
                    >
                      {inv.status}
                    </Badge>
                    {inv.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelInvitation(inv.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <AdminPagination
                page={invitePage.page}
                pageCount={invitePage.pageCount}
                total={invitePage.total}
                pageSize={invitePage.pageSize}
                onPageChange={invitePage.setPage}
                label="invitations"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
