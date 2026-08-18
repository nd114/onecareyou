import { Building2, Stethoscope, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useInstitutionCareTeam } from '@/hooks/useInstitutionCareTeam';

const ROLE_LABELS: Record<string, string> = {
  primary: 'Primary',
  covering: 'Covering',
  consulting: 'Consulting',
  support: 'Support',
};

/**
 * Who at each connected hospital can see this patient's record.
 *
 * Sharing with a hospital is not the same as sharing with a person: the
 * hospital decides which of its staff to put on your record. That decision was
 * invisible to the patient, who could see the hospital in their list and had no
 * way to find out whose hands their record was actually in.
 *
 * Kept separate from the directly-invited doctors rather than merged into one
 * list, because the patient's control over the two is different — a doctor you
 * invited you can remove; a hospital's staff you cannot, you can only end the
 * hospital connection. One combined list would imply a symmetry that is not
 * there.
 */
export function InstitutionCareTeamCard() {
  const { byPractice, isLoading } = useInstitutionCareTeam();

  // Nothing to say when no hospital has assigned anyone — the connection itself
  // is already shown by HospitalShareCard above.
  if (isLoading || byPractice.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Hospital care teams
        </CardTitle>
        <CardDescription>
          Staff your connected hospitals have put on your record
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {byPractice.map((group) => (
          <div key={group.practiceId}>
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h4 className="font-medium">{group.practiceName}</h4>
              <span className="text-xs text-muted-foreground">
                {group.members.length} {group.members.length === 1 ? 'person' : 'people'}
              </span>
            </div>

            <ul className="space-y-2">
              {group.members.map((member) => (
                <li
                  key={`${member.practiceId}-${member.clinicianUserId}`}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Stethoscope className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.clinicianName ?? 'Clinician at this hospital'}
                      </p>
                      {member.specialty && (
                        <p className="text-xs text-muted-foreground truncate">{member.specialty}</p>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {ROLE_LABELS[member.assignmentRole] ?? member.assignmentRole}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="flex gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            The hospital chooses which of its staff to put on your record. You cannot remove one of
            them individually — to end their access, disconnect from the hospital above, which stops
            all of them at once.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
