import { Check, ChevronDown, Users, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useActiveFamilyMember } from '@/contexts/FamilyContext';
import { Link } from 'react-router-dom';

interface Props {
  /** Compact icon-only trigger (mobile) */
  compact?: boolean;
}

export function HeaderFamilySwitcher({ compact = false }: Props) {
  const { familyMembers, activeMemberId, activeMember, setActiveMemberId, isLoading } =
    useActiveFamilyMember();

  // Hide entirely when no family members exist — keeps header clean for solo users
  if (isLoading || familyMembers.length === 0) return null;

  const activeName = activeMember ? activeMember.name : 'Myself';
  const activeColor = activeMember?.avatar_color || 'hsl(var(--primary))';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-full pl-2 pr-2.5"
          aria-label={`Viewing as ${activeName}`}
        >
          <span
            className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
            style={{ backgroundColor: activeColor }}
          >
            {activeMember ? activeName.charAt(0).toUpperCase() : <UserIcon className="h-3 w-3" />}
          </span>
          {!compact && (
            <span className="text-xs font-medium max-w-[100px] truncate">{activeName}</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Viewing data for
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => setActiveMemberId(null)}
          className="flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <UserIcon className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm">Myself</span>
          </span>
          {activeMemberId === null && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        {familyMembers
          .filter((m) => m.is_active)
          .map((m) => (
            <DropdownMenuItem
              key={m.id}
              onClick={() => setActiveMemberId(m.id)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                  style={{ backgroundColor: m.avatar_color }}
                >
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm truncate">{m.name}</span>
                {m.relationship && (
                  <span className="text-[10px] text-muted-foreground">({m.relationship})</span>
                )}
              </span>
              {activeMemberId === m.id && <Check className="h-4 w-4 text-primary shrink-0" />}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/family" className="flex items-center gap-2 text-xs">
            <Users className="h-3.5 w-3.5" />
            Manage family members
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
