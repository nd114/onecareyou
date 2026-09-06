import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Archive,
  Building2,
  ClipboardList,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import { PracticeAdminHeader } from '@/components/layout/PracticeAdminHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SEOHead } from '@/components/seo/SEOHead';
import { InviteTeamMemberDialog } from '@/components/clinician/InviteTeamMemberDialog';
import { PracticeInvitationsCard } from '@/components/clinician/PracticeInvitationsCard';
import { TenantOwnerInvitationCard } from '@/components/clinician/TenantOwnerInvitationCard';
import { DepartmentsCard } from '@/components/clinician/DepartmentsCard';
import { CoverageCard } from '@/components/clinician/CoverageCard';
import { PracticeContactCard } from '@/components/clinician/PracticeContactCard';
import { PracticeBrandingCard } from '@/components/clinician/PracticeBrandingCard';
import { HospitalCodeCard } from '@/components/clinician/HospitalCodeCard';
import { PracticeStorageCard } from '@/components/clinician/PracticeStorageCard';
import { usePractice } from '@/hooks/usePractice';
import {
  usePracticeDepartments,
  usePracticePatientOverview,
  usePracticeStaffOverview,
} from '@/hooks/usePracticeDepartments';
import {
  useAdministeredPractice,
  useArchivedPracticeMembers,
  usePracticeAdminActions,
} from '@/hooks/usePracticeAdmin';
import { usePracticeAuditLog } from '@/hooks/useAuditLog';
import { format } from 'date-fns';

const PAGE_SIZE = 20;

/**
 * The administrative surface for a hospital or practice.
 *
 * Deliberately not the clinician app: this account manages who works here, who
 * they look after, and how the institution is set up. Nothing is deleted —
 * staff are archived and patient access is suspended, so the audit trail holds.
 */
const PracticeAdmin = () => {
  const { practice, practiceId, role, isChiefAdmin, isLoading } = useAdministeredPractice();
  const { usePracticeInvitations } = usePractice();
  const { data: invitations = [] } = usePracticeInvitations(practiceId || '');
  const { staff, isLoading: loadingStaff } = usePracticeStaffOverview(practiceId);
  const { patients, isLoading: loadingPatients } = usePracticePatientOverview(practiceId);
  const { departments, members: departmentMembers } = usePracticeDepartments(practiceId);
  const { archived } = useArchivedPracticeMembers(practiceId);
  const {
    archiveMember,
    restoreMember,
    isUpdatingMember,
    suspendPatient,
    isUpdatingPatient,
    assignClinician,
    isAssigning,
  } = usePracticeAdminActions(practiceId);

  const [staffSearch, setStaffSearch] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [patientPage, setPatientPage] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingAssign, setPendingAssign] = useState<Record<string, string>>({});
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const { data: auditEntries = [], isLoading: loadingAudit } = usePracticeAuditLog(
    practiceId,
    { search: auditSearch, limit: 500 },
  );

  const clinicians = useMemo(
    () => staff.filter((s) => !['owner', 'admin', 'sub_admin'].includes(s.role)),
    [staff],
  );

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q) ||
        s.departments.some((d) => d.toLowerCase().includes(q)),
    );
  }, [staff, staffSearch]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        p.departments.some((d) => d.toLowerCase().includes(q)),
    );
  }, [patients, patientSearch]);

  const pagedPatients = filteredPatients.slice(
    patientPage * PAGE_SIZE,
    patientPage * PAGE_SIZE + PAGE_SIZE,
  );
  const pagedAudit = auditEntries.slice(auditPage * PAGE_SIZE, auditPage * PAGE_SIZE + PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <PracticeAdminHeader />
        <main className="container py-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  const stats = [
    { label: 'Clinicians', value: clinicians.length, icon: Stethoscope },
    { label: 'Patients', value: patients.length, icon: Users },
    { label: 'Departments', value: departments.length, icon: Building2 },
    { label: 'Pending invitations', value: invitations.length, icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      <SEOHead title="Administration — OneCare" noIndex />
      <PracticeAdminHeader institutionName={practice?.name} />

      <main className="container max-w-screen-2xl py-6 sm:py-8 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-1"
        >
          <h1 className="font-display text-2xl font-bold">{practice?.name || 'Administration'}</h1>
          <p className="text-sm text-muted-foreground">
            You are signed in as {role === 'sub_admin' ? 'a department administrator' : 'a chief administrator'}.
            Every action here is written to the activity log against your account.
          </p>
        </motion.div>

        <TenantOwnerInvitationCard />

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <s.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold leading-none">{s.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="clinicians" className="space-y-4">
          <TabsList className="flex w-full overflow-x-auto scrollbar-none">
            <TabsTrigger value="coverage">Coverage</TabsTrigger>
            <TabsTrigger value="clinicians">Clinicians</TabsTrigger>
            <TabsTrigger value="patients">Patients</TabsTrigger>
            <TabsTrigger value="departments">Departments</TabsTrigger>
            <TabsTrigger value="admins">Administrators</TabsTrigger>
            <TabsTrigger value="activity">Activity log</TabsTrigger>
            <TabsTrigger value="institution">Institution</TabsTrigger>
          </TabsList>

          {/* ---------------- Coverage ---------------- */}
          <TabsContent value="coverage">
            <CoverageCard
              staff={staff}
              patients={patients}
              departments={departments}
              members={departmentMembers}
            />
          </TabsContent>

          {/* ---------------- Clinicians ---------------- */}
          <TabsContent value="clinicians">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Clinicians and staff</CardTitle>
                    <CardDescription>
                      Archive keeps a person's record and past actions — nothing is deleted.
                    </CardDescription>
                  </div>
                  {isChiefAdmin && (
                    <Button size="sm" onClick={() => setInviteOpen(true)}>
                      Invite clinician
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Search by name, email, role or department"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                />
                {loadingStaff ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredStaff.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No staff match that search.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredStaff.map((s) => (
                      <div
                        key={s.user_id}
                        className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {s.name || s.email || 'Team member'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {s.email} · {s.assigned_patient_count} assigned patients
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {s.role.replace('_', ' ')}
                            </Badge>
                            {s.departments.map((d) => (
                              <Badge key={d} variant="outline" className="text-[10px]">
                                {d}
                              </Badge>
                            ))}
                            {s.leads_departments.length > 0 && (
                              <Badge className="text-[10px] gap-1">
                                <ShieldCheck className="h-3 w-3" />
                                sub-admin
                              </Badge>
                            )}
                          </div>
                        </div>
                        {isChiefAdmin && s.role !== 'owner' && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isUpdatingMember}
                            onClick={() => archiveMember(s.user_id)}
                          >
                            <Archive className="h-3.5 w-3.5 mr-1.5" />
                            Archive
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isChiefAdmin && archived.length > 0 && (
                  <div className="pt-2 border-t space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Archived ({archived.length}) — kept for audit
                    </p>
                    {archived.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg border border-dashed p-3 flex items-center justify-between gap-3"
                      >
                        <p className="text-xs text-muted-foreground truncate">
                          {a.role.replace('_', ' ')} · archived account
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isUpdatingMember}
                          onClick={() => restoreMember(a.user_id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          Restore
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Patients ---------------- */}
          <TabsContent value="patients">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Patients</CardTitle>
                <CardDescription>
                  Assign a clinician, route to a department, or suspend this institution's access.
                  The patient's own record always stays theirs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Search patients by name, email or department"
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    setPatientPage(0);
                  }}
                />
                {loadingPatients ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : pagedPatients.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No patients to show yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pagedPatients.map((p) => (
                      <div key={p.patient_user_id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {p.name || p.email || 'Patient'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {p.email} · connected {format(new Date(p.connected_at), 'd MMM yyyy')}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {p.departments.map((d) => (
                                <Badge key={d} variant="outline" className="text-[10px]">
                                  {d}
                                </Badge>
                              ))}
                              {p.assigned_clinicians.map((c) => (
                                <Badge key={c} variant="secondary" className="text-[10px]">
                                  {c}
                                </Badge>
                              ))}
                              {!p.is_active && (
                                <Badge variant="destructive" className="text-[10px]">
                                  suspended
                                </Badge>
                              )}
                            </div>
                          </div>
                          {isChiefAdmin && p.is_active && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isUpdatingPatient}
                              onClick={() => suspendPatient(p.patient_user_id)}
                            >
                              Suspend access
                            </Button>
                          )}
                        </div>

                        {clinicians.length > 0 && (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Select
                              value={pendingAssign[p.patient_user_id] || ''}
                              onValueChange={(v) =>
                                setPendingAssign((s) => ({ ...s, [p.patient_user_id]: v }))
                              }
                            >
                              <SelectTrigger className="sm:flex-1">
                                <SelectValue placeholder="Assign a clinician" />
                              </SelectTrigger>
                              <SelectContent>
                                {clinicians.map((c) => (
                                  <SelectItem key={c.user_id} value={c.user_id}>
                                    {c.name || c.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!pendingAssign[p.patient_user_id] || isAssigning}
                              onClick={async () => {
                                await assignClinician({
                                  patientUserId: p.patient_user_id,
                                  clinicianUserId: pendingAssign[p.patient_user_id],
                                  departmentId: p.department_ids[0] ?? null,
                                });
                                setPendingAssign((s) => ({ ...s, [p.patient_user_id]: '' }));
                              }}
                            >
                              Assign
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {filteredPatients.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-muted-foreground">
                      {patientPage * PAGE_SIZE + 1}–
                      {Math.min((patientPage + 1) * PAGE_SIZE, filteredPatients.length)} of{' '}
                      {filteredPatients.length}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={patientPage === 0}
                        onClick={() => setPatientPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={(patientPage + 1) * PAGE_SIZE >= filteredPatients.length}
                        onClick={() => setPatientPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Departments ---------------- */}
          <TabsContent value="departments" className="space-y-4">
            <DepartmentsCard />
          </TabsContent>

          {/* ---------------- Administrators ---------------- */}
          <TabsContent value="admins" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Administrative accounts</CardTitle>
                    <CardDescription>
                      Each administrator gets their own login — credentials are never shared, so the
                      activity log always names one person.
                    </CardDescription>
                  </div>
                  {isChiefAdmin && (
                    <Button size="sm" onClick={() => setInviteOpen(true)}>
                      Invite administrator
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {staff
                  .filter((s) => ['owner', 'admin', 'sub_admin'].includes(s.role))
                  .map((s) => (
                    <div
                      key={s.user_id}
                      className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.name || s.email}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {s.role.replace('_', ' ')}
                          {s.leads_departments.length > 0 &&
                            ` · leads ${s.leads_departments.join(', ')}`}
                        </p>
                      </div>
                      {isChiefAdmin && s.role !== 'owner' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isUpdatingMember}
                          onClick={() => archiveMember(s.user_id)}
                        >
                          <Archive className="h-3.5 w-3.5 mr-1.5" />
                          Archive
                        </Button>
                      )}
                    </div>
                  ))}
              </CardContent>
            </Card>
            <PracticeInvitationsCard />
          </TabsContent>

          {/* ---------------- Activity log ---------------- */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity log</CardTitle>
                <CardDescription>
                  Who did what, inside this institution only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Search by person or action"
                  value={auditSearch}
                  onChange={(e) => {
                    setAuditSearch(e.target.value);
                    setAuditPage(0);
                  }}
                />
                {loadingAudit ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : pagedAudit.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No activity recorded yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pagedAudit.map((e) => (
                      <div key={e.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium truncate">
                            {e.actor_name || e.actor_email || 'Team member'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(e.created_at), 'd MMM yyyy, HH:mm')}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {e.action} · {e.resource_type}
                          {e.patient_name ? ` · ${e.patient_name}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {auditEntries.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-muted-foreground">
                      {auditPage * PAGE_SIZE + 1}–
                      {Math.min((auditPage + 1) * PAGE_SIZE, auditEntries.length)} of{' '}
                      {auditEntries.length}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={auditPage === 0}
                        onClick={() => setAuditPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={(auditPage + 1) * PAGE_SIZE >= auditEntries.length}
                        onClick={() => setAuditPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Institution ---------------- */}
          <TabsContent value="institution" className="space-y-4">
            <PracticeContactCard />
            <HospitalCodeCard />
            <PracticeBrandingCard />
            <PracticeStorageCard />
          </TabsContent>
        </Tabs>
      </main>

      {practiceId && (
        <InviteTeamMemberDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          practiceId={practiceId}
        />
      )}
    </div>
  );
};

export default PracticeAdmin;
