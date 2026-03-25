import { Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';

interface FamilyMemberSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  includeMyself?: boolean;
}

export function FamilyMemberSelector({ 
  value, 
  onChange, 
  label = 'For whom?',
  includeMyself = true,
}: FamilyMemberSelectorProps) {
  const { familyMembers, isLoading } = useFamilyMembers();

  if (isLoading || familyMembers.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        {label}
      </Label>
      <Select
        value={value || 'myself'}
        onValueChange={(v) => onChange(v === 'myself' ? null : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select person" />
        </SelectTrigger>
        <SelectContent>
          {includeMyself && (
            <SelectItem value="myself">Myself</SelectItem>
          )}
          {familyMembers.filter(m => m.is_active).map((member) => (
            <SelectItem key={member.id} value={member.id}>
              <span className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full inline-block"
                  style={{ backgroundColor: member.avatar_color }}
                />
                {member.name}
                {member.relationship && (
                  <span className="text-muted-foreground text-xs">({member.relationship})</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
