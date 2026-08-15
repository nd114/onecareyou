import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Hospital, Loader2 } from 'lucide-react';
import { usePractice } from '@/hooks/usePractice';
import { usePracticeSharedPatients } from '@/hooks/usePracticeShares';
import { usePracticeTenant } from '@/hooks/usePracticeTenant';


export const HospitalPatientsCard = () => {
  const { currentPractice, currentMembership, usePracticeMembers } = usePractice();
  const { data: members = [] } = usePracticeMembers(currentPractice?.id || '');
  const { shares, isLoading, assign, isAssigning } = usePracticeSharedPatients(
    currentPractice?.id,
  );
  const { tenant } = usePracticeTenant(currentPractice?.id);

  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Record<string, string>>({});
  // A patient who disconnects is not removed, and the hospital is not notified —
  // the status changes and these views filter on it (consent model §3).
  const [status, setStatus] = useState<'all' | 'active' | 'ended'>('active');

  // Must match the RLS policy on practice_patient_assignments
  // (can_manage_practice), or the control is offered to people whose write the
  // database will refuse. can_view_all_patients is a read right, not a delegation.
  const canAssign =
    currentMembership?.role === 'owner' || currentMembership?.role === 'admin';

  const filtered = shares.filter((s) => {
    if (status === 'active' && !s.is_active) return false;
    if (status === 'ended' && s.is_active) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (s.patient?.name || '').toLowerCase().includes(q) ||
      (s.patient?.email || '').toLowerCase().includes(q)
    );
  });

  // Institution-shared patients only exist for hospital tenants or once shares arrive.
  if (!currentPractice) return null;
  if (!isLoading && shares.length === 0 && (tenant?.tenant_type ?? 'practice') !== 'hospital') {
    return null;
  }


  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hospital className="h-4 w-4 text-primary" />
              Institution-shared patients
            </CardTitle>
            <CardDescription>
              Patients who shared their record with {currentPractice.name} directly. Assign a
              clinician to each — assignment is logged.
            </CardDescription>
          </div>
          <Badge variant="secondary">{shares.filter((s) => s.is_active).length} active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          {shares.length > 3 && (
            <Input
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:flex-1"
            />
          )}
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="ended">Disconnected</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {shares.length === 0
              ? 'No institution shares yet. Patients connect using your hospital code.'
              : 'No patients match this filter.'}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((share) => (
              <div key={share.id} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {share.patient?.name || share.patient?.email || 'Patient'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Connected {new Date(share.connected_at).toLocaleDateString()} ·{' '}
                      {share.share_all ? 'Full record' : 'Limited'}
                    </p>
                  </div>
                  <Badge variant={share.is_active ? 'default' : 'secondary'}>
                    {share.is_active ? 'Active' : 'Ended'}
                  </Badge>
                </div>

                {share.is_active && canAssign && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select
                      value={pending[share.id] || ''}
                      onValueChange={(v) => setPending((p) => ({ ...p, [share.id]: v }))}
                    >
                      <SelectTrigger className="sm:flex-1">
                        <SelectValue placeholder="Assign a clinician" />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.clinician_profile
                              ? `${m.clinician_profile.title || 'Dr.'} ${m.clinician_profile.first_name} ${m.clinician_profile.last_name}`
                              : m.profile?.name || m.profile?.email || 'Team member'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!pending[share.id] || isAssigning}
                      onClick={async () => {
                        await assign({
                          patientUserId: share.user_id,
                          clinicianUserId: pending[share.id],
                        });
                        setPending((p) => ({ ...p, [share.id]: '' }));
                      }}
                    >
                      Assign
                    </Button>
                  </div>
                )}

                {share.assignedClinicianIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {share.assignedClinicianIds.length} clinician
                    {share.assignedClinicianIds.length === 1 ? '' : 's'} currently assigned
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
