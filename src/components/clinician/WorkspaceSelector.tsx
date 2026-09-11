import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePractice } from '@/hooks/usePractice';

/**
 * A clinician with a personal practice plus one or more hospital posts used
 * to have no way to say which was current — every screen just took
 * `memberships[0]`. Nothing renders here for the common case of one
 * membership; there is nothing to choose.
 */
export function WorkspaceSelector() {
  const { practices, currentPractice, needsWorkspaceSelection, selectWorkspace } = usePractice();

  if (practices.length <= 1) return null;

  return (
    <Select value={currentPractice?.id ?? ''} onValueChange={selectWorkspace}>
      <SelectTrigger
        className="w-auto max-w-[200px] gap-2 border-none bg-muted/50 hover:bg-muted"
        aria-label="Choose workspace"
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder={needsWorkspaceSelection ? 'Choose a workspace' : undefined}>
          <span className="truncate">{currentPractice?.name}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {practices.map((practice) => (
          <SelectItem key={practice.id} value={practice.id}>
            {practice.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
