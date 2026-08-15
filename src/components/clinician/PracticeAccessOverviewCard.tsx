import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, Loader2, ShieldCheck, Users } from 'lucide-react';
import { usePractice } from '@/hooks/usePractice';
import { usePracticeTenant } from '@/hooks/usePracticeTenant';
import {
  usePracticeDepartments,
  usePracticePatientOverview,
  usePracticeStaffOverview,
} from '@/hooks/usePracticeDepartments';

/**
 * "Who works here, who they can reach, and where each patient sits."
 *
 * Visible to the chief admin across the whole hospital, and to a sub-admin for
 * their own departments plus the not-yet-routed queue — the database scopes the
 * rows, so this renders whatever the caller is entitled to see.
 */
export const PracticeAccessOverviewCard = () => {
  const { currentPractice } = usePractice();
  const { tenant } = usePracticeTenant(currentPractice?.id);
  const { staff, isLoading: loadingStaff } = usePracticeStaffOverview(currentPractice?.id);
  const { patients, isLoading: loadingPatients, routeToDepartment, isRouting } =
    usePracticePatientOverview(currentPractice?.id);
  const { departments } = usePracticeDepartments(currentPractice?.id);

  const [search, setSearch] = useState('');
  const [pendingRoute, setPendingRoute] = useState<Record<string, string>>({});

  if (!currentPractice) return null;
  const isHospital = (tenant?.tenant_type ?? 'practice') === 'hospital';
  if (!isHospital) return null;
  // Nothing to oversee and no rights to see it — the RPCs return empty.
  if (!loadingStaff && !loadingPatients && staff.length === 0 && patients.length === 0) return null;

  const q = search.trim().toLowerCase();
  const matchedStaff = staff.filter(
    (s) =>
      !q ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      s.departments.some((d) => d.toLowerCase().includes(q)),
  );
  const matchedPatients = patients.filter(
    (p) =>
      !q ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      p.departments.some((d) => d.toLowerCase().includes(q)),
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Staff &amp; patient access
            </CardTitle>
            <CardDescription>
              Who works in which department, how many patients each clinician holds, and where every
              connected patient sits. Actions taken are recorded in the audit log.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Input
          placeholder="Search by name, email or department"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <Tabs defaultValue="staff">
          <TabsList>
            <TabsTrigger value="staff">Staff ({staff.length})</TabsTrigger>
            <TabsTrigger value="patients">Patients ({patients.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="staff" className="pt-3">
            {loadingStaff ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : matchedStaff.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No staff match.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {matchedStaff.map((s) => (
                  <div key={s.user_id} className="flex flex-wrap items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {s.name || s.email || 'Team member'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.departments.length > 0
                          ? s.departments.join(' · ')
                          : 'No department yet'}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {String(s.role).replace('_', ' ')}
                    </Badge>
                    {s.leads_departments.length > 0 && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <ShieldCheck className="h-3 w-3" />
                        Leads {s.leads_departments.join(', ')}
                      </Badge>
                    )}
                    {s.has_tenant_wide_view && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Eye className="h-3 w-3" />
                        Sees all patients
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {s.assigned_patient_count} assigned
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="patients" className="pt-3">
            {loadingPatients ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : matchedPatients.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No patients match.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {matchedPatients.map((p) => (
                  <div key={p.patient_user_id} className="space-y-2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {p.name || p.email || 'Patient'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.departments.length > 0
                            ? p.departments.join(' · ')
                            : 'Not routed to a department yet'}
                          {p.assigned_clinicians.length > 0 &&
                            ` — with ${p.assigned_clinicians.join(', ')}`}
                        </p>
                      </div>
                      <Badge variant={p.is_active ? 'default' : 'secondary'} className="text-xs">
                        {p.is_active ? 'Active' : 'Disconnected'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {p.share_all ? 'Full record' : 'Limited'}
                      </Badge>
                    </div>

                    {p.is_active && departments.length > 0 && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Select
                          value={pendingRoute[p.patient_user_id] || ''}
                          onValueChange={(v) =>
                            setPendingRoute((prev) => ({ ...prev, [p.patient_user_id]: v }))
                          }
                        >
                          <SelectTrigger className="sm:flex-1">
                            <SelectValue placeholder="Route to a department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments
                              .filter((d) => d.is_active && !p.department_ids.includes(d.id))
                              .map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!pendingRoute[p.patient_user_id] || isRouting}
                          onClick={async () => {
                            await routeToDepartment({
                              patientUserId: p.patient_user_id,
                              departmentId: pendingRoute[p.patient_user_id],
                            });
                            setPendingRoute((prev) => ({ ...prev, [p.patient_user_id]: '' }));
                          }}
                        >
                          Route
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
