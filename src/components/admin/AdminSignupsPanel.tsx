import { useMemo, useState } from 'react';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminSignups } from '@/hooks/useAdminInsights';
import { AdminPagination, usePagination } from '@/components/admin/AdminPagination';

const WINDOWS: Record<string, number | null> = {
  all: null,
  '7': 7,
  '30': 30,
  '90': 90,
};

/** Recent sign-ups with role, timeframe and text filters, plus pagination. */
export function AdminSignupsPanel() {
  const { signups, isLoading } = useAdminSignups(500);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'all' | 'patient' | 'clinician'>('all');
  const [window, setWindow] = useState<keyof typeof WINDOWS>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const days = WINDOWS[window];
    const cutoff = days ? Date.now() - days * 86_400_000 : null;
    return signups.filter((s) => {
      if (role === 'clinician' && !s.is_clinician) return false;
      if (role === 'patient' && s.is_clinician) return false;
      if (cutoff && new Date(s.created_at).getTime() < cutoff) return false;
      if (q && ![s.name, s.email].some((v) => v?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [signups, search, role, window]);

  const { page, setPage, pageCount, pageItems, total, pageSize } = usePagination(filtered, 10);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Recent sign-ups
          </CardTitle>
          <CardDescription>The newest accounts on the platform, newest first.</CardDescription>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or email"
              className="pl-9"
              aria-label="Search sign-ups"
            />
          </div>
          <Select
            value={role}
            onValueChange={(v) => {
              setRole(v as typeof role);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-36" aria-label="Filter by account type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              <SelectItem value="patient">Patients</SelectItem>
              <SelectItem value="clinician">Clinicians</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={window}
            onValueChange={(v) => {
              setWindow(v as keyof typeof WINDOWS);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-36" aria-label="Filter by timeframe">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any time</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            {signups.length === 0 ? 'No accounts yet.' : 'No accounts match those filters.'}
          </p>
        ) : (
          <div className="space-y-2">
            {pageItems.map((s) => (
              <div
                key={s.user_id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.name || s.email || 'Account'}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={s.is_clinician ? 'default' : 'secondary'}>
                    {s.is_clinician ? 'Clinician' : 'Patient'}
                  </Badge>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
            <AdminPagination
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              label="accounts"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
