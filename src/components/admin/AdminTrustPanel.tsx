import { useState } from 'react';
import { Download, FileCheck, Loader2, Search, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminAuditSearchPanel } from '@/components/admin/AdminAuditSearchPanel';
import { AdminActivityPanel } from '@/components/admin/AdminActivityPanel';
import { useAdminTrust, useAuditExport, type AccessReviewRow } from '@/hooks/useAdminTrust';
import { formatDay } from '@/lib/format-date';
import { toast } from 'sonner';

/** Trust — who can see whom, what was agreed, and the record of both. */
export function AdminTrustPanel() {
  const {
    overview,
    rows,
    total,
    page,
    setPage,
    pageCount,
    pageSize,
    search,
    setSearch,
    needsSearch,
    minSearchLength,
    isLoading,
    isFetching,
    revoke,
    isRevoking,
  } = useAdminTrust();
  const [closing, setClosing] = useState<AccessReviewRow | null>(null);
  const [reason, setReason] = useState('');

  const shares = overview?.shares;
  const consent = overview?.consent;
  const legal = overview?.legal;

  const confirmClose = () => {
    if (!closing || !reason.trim()) return;
    revoke(
      { shareType: closing.share_type, shareId: closing.share_id, reason: reason.trim() },
      {
        onSuccess: () => {
          setClosing(null);
          setReason('');
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Live access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Clinician shares" value={shares?.clinician_active ?? 0} />
            <Row label="Institution shares" value={shares?.institution_active ?? 0} />
            <Row label="Whole-vault shares" value={shares?.share_all ?? 0} />
            <Row label="Granted this week" value={shares?.granted_7d ?? 0} />
            <Row label="Closed this week" value={shares?.revoked_7d ?? 0} />
            <Row
              label="Past expiry, still open"
              value={shares?.expired_but_active ?? 0}
              warn={(shares?.expired_but_active ?? 0) > 0}
            />
            <Row
              label="Suspended institutions"
              value={shares?.suspended_institutions ?? 0}
              warn={(shares?.suspended_institutions ?? 0) > 0}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Consent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="AI processing on" value={consent?.ai_processing_on ?? 0} />
            <Row label="AI actions on" value={consent?.ai_actions_on ?? 0} />
            <Row label="Record exchange agreed" value={consent?.qhin_consented ?? 0} />
            <Row label="Changes this week" value={consent?.changes_7d ?? 0} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" />
              Agreements
            </CardTitle>
            <CardDescription className="text-xs">
              Coverage means every document currently in force has been accepted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Fully accepted"
              value={`${legal?.fully_accepted ?? 0} of ${legal?.accounts ?? 0}`}
            />
            <Row label="Documents in force" value={legal?.current_documents ?? 0} />
            <Row label="Accepted this week" value={legal?.accepted_7d ?? 0} />
            <Row label="BAAs signed" value={overview?.baa.signed ?? 0} />
            <Row label="BAAs pending" value={overview?.baa.pending ?? 0} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-base">Access review</CardTitle>
            <CardDescription>
              A patient's relationship with a named clinician or institution is theirs, not a
              standing list for OneCare staff to browse. Search for a patient, clinician or
              institution you already have a reason to look up — it shows who can look and how
              widely, never what they would see. Closing a grant only narrows access and is
              always logged.
            </CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by patient, clinician or institution"
              className="pl-9"
              aria-label="Search access grants"
            />
          </div>
        </CardHeader>
        <CardContent>
          {needsSearch ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Search className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-sm">
                Nothing is listed until you search ({minSearchLength}+ characters). Relationships
                surface one lookup at a time, never as a browsable list.
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nothing matches that search.</p>
          ) : (
            <>
              <div className={`space-y-2 ${isFetching ? 'opacity-60' : ''}`}>
                {rows.map((r) => (
                  <div
                    key={`${r.share_type}-${r.share_id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{r.viewer_name}</span>
                        <span className="text-xs text-muted-foreground">can see</span>
                        <span className="font-medium text-sm truncate">{r.patient_name}</span>
                        <Badge variant="secondary" className="capitalize">
                          {r.share_type}
                        </Badge>
                        {r.share_all && <Badge variant="outline">Whole vault</Badge>}
                        {r.is_suspended && <Badge variant="destructive">Suspended</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.share_all
                          ? 'Everything in the record'
                          : `${r.permission_count} categor${r.permission_count === 1 ? 'y' : 'ies'}`}
                        {r.connected_at ? ` · since ${formatDay(r.connected_at)}` : ''}
                        {r.last_accessed_at ? ` · last opened ${formatDay(r.last_accessed_at)}` : ''}
                        {r.expires_at ? ` · expires ${formatDay(r.expires_at)}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setClosing(r);
                        setReason('');
                      }}
                    >
                      Close access
                    </Button>
                  </div>
                ))}
              </div>
              <AdminPagination
                page={page}
                pageCount={pageCount}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
                label="grants"
              />
            </>
          )}
        </CardContent>
      </Card>

      <AuditExportCard />

      <AdminAuditSearchPanel />

      <AdminActivityPanel />

      <Dialog
        open={!!closing}
        onOpenChange={(open) => {
          if (!open) {
            setClosing(null);
            setReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close this access</DialogTitle>
            <DialogDescription>
              {closing?.viewer_name} will no longer be able to see {closing?.patient_name}'s
              record. Only the patient can open it again. The reason is recorded on the share and
              in the admin log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Why</Label>
            <Textarea
              id="revoke-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Clinician account compromised, reported by the practice"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmClose}
              disabled={isRevoking || !reason.trim()}
            >
              {isRevoking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Close access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Pull an audit range out as a file, for a regulator or a customer's own review. */
function AuditExportCard() {
  const { exportRange, isExporting } = useAuditExport();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');

  const run = async () => {
    const rows = await exportRange({
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      action: action.trim() || undefined,
    });

    if (!rows.length) {
      toast.warning('Nothing in that range');
      return;
    }

    const header = ['when', 'action', 'resource', 'actor', 'subject'];
    const escape = (v: string | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      header.join(','),
      ...rows.map((r) =>
        [r.created_at, r.action, r.resource_type, r.actor_email, r.patient_email]
          .map(escape)
          .join(','),
      ),
    ].join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `onecare-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} entries exported`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          Audit export
        </CardTitle>
        <CardDescription>
          The access record over a date range, as a file. It carries what happened and who did it;
          the detail of the record itself never leaves the database.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-4 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="audit-from" className="text-xs">
              From
            </Label>
            <Input
              id="audit-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-to" className="text-xs">
              To
            </Label>
            <Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-action" className="text-xs">
              Action contains
            </Label>
            <Input
              id="audit-action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="view_record"
            />
          </div>
          <Button onClick={run} disabled={isExporting} className="gap-2">
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Leave the dates empty for the last 30 days. Capped at 5,000 entries per export.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-right ${warn ? 'text-destructive' : ''}`}>{value}</span>
    </div>
  );
}
