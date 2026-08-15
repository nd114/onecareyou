import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building, Loader2, Plus, ShieldCheck, X } from 'lucide-react';
import { usePractice } from '@/hooks/usePractice';
import { usePracticeTenant } from '@/hooks/usePracticeTenant';
import { usePracticeDepartments } from '@/hooks/usePracticeDepartments';

/**
 * Departments and their sub-admins, for a hospital's chief admin.
 *
 * Creating departments and appointing leads stays here with the owner/admin —
 * the database enforces the same boundary, so this is the honest surface for it
 * rather than the only guard.
 */
export const DepartmentsCard = () => {
  const { currentPractice, currentMembership, usePracticeMembers } = usePractice();
  const { tenant } = usePracticeTenant(currentPractice?.id);
  const { data: members = [] } = usePracticeMembers(currentPractice?.id || '');
  const {
    departments,
    members: departmentMembers,
    isLoading,
    createDepartment,
    isCreating,
    addMember,
    removeMember,
    setLead,
  } = usePracticeDepartments(currentPractice?.id);

  const [newName, setNewName] = useState('');
  const [pendingMember, setPendingMember] = useState<Record<string, string>>({});

  const isChiefAdmin =
    currentMembership?.role === 'owner' || currentMembership?.role === 'admin';

  // Departments are a hospital concept. A solo practice never needs this card.
  if (!currentPractice) return null;
  const isHospital = (tenant?.tenant_type ?? 'practice') === 'hospital';
  if (!isHospital && departments.length === 0) return null;
  if (!isChiefAdmin) return null;

  const memberLabel = (userId: string) => {
    const m = members.find((x) => x.user_id === userId);
    if (!m) return 'Team member';
    return m.clinician_profile
      ? `${m.clinician_profile.title || 'Dr.'} ${m.clinician_profile.first_name} ${m.clinician_profile.last_name}`
      : m.profile?.name || m.profile?.email || 'Team member';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building className="h-4 w-4 text-primary" />
              Departments
            </CardTitle>
            <CardDescription>
              Group your staff by department and appoint a sub-admin to run each one. Sub-admins
              assign patients to clinicians in their own department — they cannot change your team,
              billing or branding.
            </CardDescription>
          </div>
          <Badge variant="secondary">{departments.length}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="New department, e.g. Paediatrics"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                createDepartment({ name: newName }).then(() => setNewName(''));
              }
            }}
          />
          <Button
            onClick={() => createDepartment({ name: newName }).then(() => setNewName(''))}
            disabled={!newName.trim() || isCreating}
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : departments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No departments yet. Add one above — Emergency and Paediatrics are usually the first.
          </p>
        ) : (
          <div className="space-y-3">
            {departments.map((dept) => {
              const staff = departmentMembers.filter((m) => m.department_id === dept.id);
              const assignable = members.filter(
                (m) => !staff.some((s) => s.user_id === m.user_id),
              );

              return (
                <div key={dept.id} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{dept.name}</p>
                    <Badge variant="outline" className="text-xs">
                      {staff.length} {staff.length === 1 ? 'person' : 'people'}
                    </Badge>
                  </div>

                  {staff.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {staff.map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2 pr-1 text-xs"
                        >
                          {s.is_lead && <ShieldCheck className="h-3 w-3 text-primary" />}
                          {memberLabel(s.user_id)}
                          <button
                            type="button"
                            className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                            aria-label={`Toggle sub-admin for ${memberLabel(s.user_id)}`}
                            onClick={() => setLead({ memberRowId: s.id, isLead: !s.is_lead })}
                            title={s.is_lead ? 'Remove as sub-admin' : 'Make sub-admin'}
                          >
                            <ShieldCheck
                              className={`h-3 w-3 ${s.is_lead ? 'text-primary' : 'text-muted-foreground'}`}
                            />
                          </button>
                          <button
                            type="button"
                            className="rounded-full p-0.5 hover:bg-muted"
                            aria-label={`Remove ${memberLabel(s.user_id)} from ${dept.name}`}
                            onClick={() => removeMember(s.id)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {assignable.length > 0 && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select
                        value={pendingMember[dept.id] || ''}
                        onValueChange={(v) =>
                          setPendingMember((p) => ({ ...p, [dept.id]: v }))
                        }
                      >
                        <SelectTrigger className="sm:flex-1">
                          <SelectValue placeholder="Add someone to this department" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignable.map((m) => (
                            <SelectItem key={m.user_id} value={m.user_id}>
                              {memberLabel(m.user_id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!pendingMember[dept.id]}
                        onClick={async () => {
                          await addMember({
                            departmentId: dept.id,
                            userId: pendingMember[dept.id],
                            isLead: false,
                          });
                          setPendingMember((p) => ({ ...p, [dept.id]: '' }));
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    The shield marks a sub-admin. Only you can appoint one.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
