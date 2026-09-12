import { useState } from 'react';
import { Building2, Loader2, Search, Stethoscope, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { AdminPagination } from '@/components/admin/AdminPagination';
import {
  useAccountDetail,
  useAdminAccounts,
  type AccountKind,
  type DirectoryRow,
} from '@/hooks/useAdminAccounts';
import { formatBytes } from '@/lib/storage-constants';
import { formatDay, formatDayTime } from '@/lib/format-date';

const KINDS: Array<{ value: AccountKind; label: string }> = [
  { value: 'all', label: 'Everyone' },
  { value: 'tenant', label: 'Tenants' },
  { value: 'clinician', label: 'Clinicians' },
  { value: 'patient', label: 'Patients' },
];

const ICON = {
  tenant: Building2,
  clinician: Stethoscope,
  patient: User,
} as const;

/** One directory across tenants, clinicians and patients. */
export function AdminAccountsPanel() {
  const {
    rows,
    total,
    page,
    setPage,
    pageCount,
    pageSize,
    kind,
    setKind,
    search,
    setSearch,
    needsSearch,
    minSearchLength,
    isLoading,
    isFetching,
  } = useAdminAccounts();
  const [open, setOpen] = useState<DirectoryRow | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-base">Accounts</CardTitle>
            <CardDescription>
              Tenants are browsable, since they are OneCare's business customers. A clinician or
              patient only surfaces once you search for them by name or email — nobody's account
              is a scroll away without a reason to look it up.
            </CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, hospital code or specialty"
                className="pl-9"
                aria-label="Search accounts"
              />
            </div>
            <ToggleGroup
              type="single"
              value={kind}
              onValueChange={(v) => v && setKind(v as AccountKind)}
              className="rounded-lg border bg-card p-0.5 shrink-0"
              aria-label="Account kind"
            >
              {KINDS.map((k) => (
                <ToggleGroupItem key={k.value} value={k.value} className="h-8 px-3 text-xs">
                  {k.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent>
          {needsSearch ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Search className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-sm">
                Search by name or email to look up a specific clinician or patient
                ({minSearchLength}+ characters). Individual accounts aren't listed until you do.
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              {search.trim() ? 'Nothing matches that search.' : 'No tenants yet.'}
            </p>
          ) : (
            <>
              <div className={`space-y-2 ${isFetching ? 'opacity-60' : ''}`}>
                {rows.map((r) => {
                  const Icon = ICON[r.kind] ?? User;
                  return (
                    <button
                      key={`${r.kind}-${r.id}`}
                      type="button"
                      onClick={() => setOpen(r)}
                      className="w-full text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3 hover:border-primary/40 transition-colors"
                    >
                      <div className="min-w-0 flex items-start gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{r.display_name}</span>
                            <Badge variant="secondary" className="capitalize">
                              {r.kind}
                            </Badge>
                            {r.detail && (
                              <span className="text-xs text-muted-foreground">{r.detail}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {r.email ?? 'No email'}
                            {r.tenant_name ? ` · ${r.tenant_name}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                        <span>{r.connections} connected</span>
                        <span>{formatBytes(Number(r.storage_bytes))}</span>
                        <span>
                          {r.last_seen ? `Seen ${formatDay(r.last_seen)}` : 'Never signed in'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <AdminPagination
                page={page}
                pageCount={pageCount}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
                label="accounts"
              />
            </>
          )}
        </CardContent>
      </Card>

      <AccountDrawer row={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function AccountDrawer({ row, onClose }: { row: DirectoryRow | null; onClose: () => void }) {
  const { detail, isLoading } = useAccountDetail(row?.kind ?? null, row?.id ?? null);

  const connections = detail?.connections;
  const connectionSummary =
    typeof connections === 'number'
      ? [['Connected patients', connections] as const]
      : connections
        ? ([
            ['Clinician shares', connections.clinician_shares],
            ['Institution shares', connections.institution_shares],
            ['Closed', connections.revoked],
          ] as const)
        : [];

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row?.display_name}</SheetTitle>
          <SheetDescription>
            {row?.email ?? 'No email on file'}
            {detail?.tier ? ` · ${detail.tier}` : ''}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !detail ? (
          <p className="text-sm text-muted-foreground py-6">Nothing to show for this account.</p>
        ) : (
          <div className="space-y-6 py-6">
            {row?.kind === 'tenant' && (
              <Section title="Tenant">
                <Fact label="Type" value={detail.tenant_type ?? 'practice'} />
                <Fact label="Hospital code" value={detail.slug ?? 'Not set'} />
                <Fact label="Location" value={detail.location ?? 'Not set'} />
                <Fact label="Members" value={detail.members ?? 0} />
                <Fact label="Departments" value={detail.departments ?? 0} />
                <Fact label="Pending invitations" value={detail.pending_invitations ?? 0} />
                <Fact label="Revenue share" value={`${detail.revenue_share_pct ?? 0}%`} />
                <Fact
                  label="Storage"
                  value={`${formatBytes(Number(detail.storage_bytes ?? 0))} / ${detail.storage_limit_gb ?? 0} GB`}
                />
              </Section>
            )}

            {row?.kind !== 'tenant' && (
              <Section title="Account">
                <Fact label="Email confirmed" value={detail.email_confirmed ? 'Yes' : 'No'} />
                <Fact
                  label="Last seen"
                  value={detail.last_seen ? formatDayTime(detail.last_seen) : 'Never signed in'}
                />
                <Fact
                  label="Joined"
                  value={detail.created_at ? formatDay(detail.created_at) : 'Unknown'}
                />
                {detail.specialty && <Fact label="Specialty" value={detail.specialty} />}
                {row?.kind === 'clinician' && (
                  <Fact label="Verified" value={detail.is_verified ? 'Yes' : 'No'} />
                )}
                {row?.kind === 'patient' && (
                  <Fact
                    label="Onboarding"
                    value={detail.onboarding_completed ? 'Complete' : 'Not finished'}
                  />
                )}
                <Fact
                  label="Storage"
                  value={formatBytes(Number(detail.storage_bytes ?? 0))}
                />
              </Section>
            )}

            {!!detail.roles?.length && (
              <Section title="Platform roles">
                <div className="flex flex-wrap gap-2">
                  {detail.roles.map((r) => (
                    <Badge key={r} variant="outline" className="capitalize">
                      {r}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {!!detail.tenants?.length && (
              <Section title="Workspaces">
                <div className="space-y-2">
                  {detail.tenants.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link to={`/admin/tenants/${t.id}`} className="hover:underline truncate">
                        {t.name}
                      </Link>
                      <span className="text-xs text-muted-foreground capitalize shrink-0">
                        {t.role} · {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {connectionSummary.length > 0 && (
              <Section title="Connections">
                {connectionSummary.map(([label, value]) => (
                  <Fact key={label} label={label} value={value} />
                ))}
              </Section>
            )}

            {detail.record_counts && (
              <Section title="Record size">
                <p className="text-xs text-muted-foreground -mt-1 mb-2">
                  How much is in the record, never what is in it.
                </p>
                <Fact label="Documents" value={detail.record_counts.documents} />
                <Fact label="Medications" value={detail.record_counts.medications} />
                <Fact label="Readings" value={detail.record_counts.vitals} />
              </Section>
            )}

            <Section title="Recent activity">
              {detail.recent_activity?.length ? (
                <div className="space-y-2">
                  {detail.recent_activity.map((a, i) => (
                    <div key={`${a.action}-${i}`} className="flex items-start justify-between gap-3">
                      <span className="text-sm capitalize">
                        {a.action.replace(/_/g, ' ')}
                        {a.resource_type ? ` · ${a.resource_type}` : ''}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDayTime(a.at)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              )}
            </Section>

            {row?.kind === 'tenant' && (
              <Button asChild variant="outline" className="w-full">
                <Link to={`/admin/tenants/${row.id}`}>Open the tenant</Link>
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
