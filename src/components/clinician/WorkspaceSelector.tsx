import { Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePractice } from '@/hooks/usePractice';

function InactiveMark() {
  return (
    <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
      Inactive
    </Badge>
  );
}

/**
 * A clinician with a personal practice plus one or more hospital posts used
 * to have no way to say which was current — every screen just took
 * `memberships[0]`. Nothing renders here for the common case of one active
 * membership; there is nothing to choose.
 *
 * An inactive practice is listed and can be chosen, because the database
 * still counts its staff as members (see workspaceMemberships), but it is labelled Inactive in the list
 * and in the trigger. Without the label a practice patients can no longer find
 * looks exactly like a working one. A clinician whose only workspace is
 * inactive still sees the selector, so the label is somewhere to be seen.
 */
export function WorkspaceSelector() {
  const { practices, currentPractice, needsWorkspaceSelection, selectWorkspace } = usePractice();

  const currentIsInactive = currentPractice?.is_active === false;
  if (practices.length <= 1 && !currentIsInactive) return null;

  return (
    <Select value={currentPractice?.id ?? ''} onValueChange={selectWorkspace}>
      <SelectTrigger
        className="w-auto max-w-[240px] gap-2 border-none bg-muted/50 hover:bg-muted"
        aria-label="Choose workspace"
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder={needsWorkspaceSelection ? 'Choose a workspace' : undefined}>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{currentPractice?.name}</span>
            {currentIsInactive && <InactiveMark />}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {practices.map((practice) => (
          <SelectItem key={practice.id} value={practice.id}>
            <span className="flex items-center gap-2">
              <span>{practice.name}</span>
              {practice.is_active === false && <InactiveMark />}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
