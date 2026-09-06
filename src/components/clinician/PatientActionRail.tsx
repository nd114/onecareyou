import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ClipboardList,
  FileSignature,
  MessageSquare,
  MoreHorizontal,
  NotebookPen,
  Share2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateTaskDialog } from '@/components/clinician/CreateTaskDialog';
import { ReferralDialog } from '@/components/clinician/ReferralDialog';
import { cn } from '@/lib/utils';

/**
 * The patient's chart is fifteen tabs deep. This follows you down it.
 *
 * Two things scrolled away together before: the actions a clinician takes on a
 * patient, which sat in the page header, and — more seriously — *whose chart
 * this is*. Somebody writing an encounter note two screens down had nothing on
 * screen naming the patient. Wrong-patient documentation is the ordinary way
 * that goes wrong, and it does not need an unusual sequence of events.
 *
 * So the rail sticks under the header, and the moment the page header leaves the
 * viewport it reveals the patient's name and risk alongside the actions. It is
 * in the normal flow rather than floating, which keeps it clear of the mobile
 * tab bar — the collision the roadmap flags between the bottom nav, the FAB
 * stack and sticky sub-tabs.
 *
 * It replaces a card that did the same job in an `lg`-and-up sidebar, and keeps
 * that card's rule: **a shortcut to something already on screen is not a
 * shortcut**, it is a second name for the same control. So the menu carries the
 * things that START something — an encounter, a task, a referral — and the two
 * tabs a clinician leaves the chart for, and nothing that merely re-points at a
 * tab already visible in the list below. Guidance and alerts sit in the bar
 * itself because they left the page header when this arrived; they are not
 * duplicated anywhere.
 */

export interface RailJump {
  key: string;
  label: string;
  icon: typeof MessageSquare;
  /** Tab to open. */
  tab: string;
  /** Hidden for non-clinical staff, who cannot reach the tab either. */
  clinicalOnly?: boolean;
}

const JUMPS: RailJump[] = [
  { key: 'encounters', label: 'Start encounter', icon: FileSignature, tab: 'encounters', clinicalOnly: true },
  { key: 'messages', label: 'Message', icon: MessageSquare, tab: 'messages' },
  { key: 'notes', label: 'My notes', icon: NotebookPen, tab: 'notes', clinicalOnly: true },
];

interface PatientActionRailProps {
  patientName: string;
  patientUserId: string;
  /** The risk chip, passed in so the rail does not re-derive the assessment. */
  riskChip?: ReactNode;
  /** Rendered as-is: these are dialog triggers that own their own state. */
  guidanceAction?: ReactNode;
  alertAction?: ReactNode;
  onJump: (tab: string) => void;
  isClinicalStaff: boolean;
  className?: string;
}

export function PatientActionRail({
  patientName,
  patientUserId,
  riskChip,
  guidanceAction,
  alertAction,
  onJump,
  isClinicalStaff,
  className,
}: PatientActionRailProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  useEffect(() => {
    const node = sentinel.current;
    // No IntersectionObserver (old browser, jsdom) means no identity strip —
    // the actions still work, which is the half that must not depend on it.
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { rootMargin: '-72px 0px 0px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const jumps = JUMPS.filter((j) => isClinicalStaff || !j.clinicalOnly);

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px" />
      <div
        className={cn(
          'sticky top-16 z-30 -mx-4 sm:-mx-6 mb-4 px-4 sm:px-6 py-2',
          'border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
          // Only reads as a bar once it is actually holding position.
          stuck ? 'border-border shadow-sm' : 'border-transparent',
          className,
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Who this chart belongs to, once the header carrying the name has
              scrolled away. Hidden rather than unmounted so the actions do not
              shift sideways as it appears. */}
          <div
            className={cn(
              'flex items-center gap-2 min-w-0 transition-opacity duration-150',
              stuck ? 'flex-1 opacity-100' : 'w-0 opacity-0 pointer-events-none overflow-hidden',
            )}
          >
            <span className="text-sm font-semibold truncate">{patientName}</span>
            {/* The chip is on the page header and explained in the panel there.
                On a phone the name has to win the space: a strip that crushes it
                to one letter has lost the only thing it is for. */}
            <span className="hidden sm:contents">{riskChip}</span>
          </div>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            {guidanceAction}
            {alertAction}
            {jumps.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More patient actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {jumps.map((jump) => (
                    <DropdownMenuItem key={jump.key} onClick={() => onJump(jump.tab)}>
                      <jump.icon className="h-4 w-4 mr-2" />
                      {jump.label}
                    </DropdownMenuItem>
                  ))}
                  {isClinicalStaff && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setTaskOpen(true)}>
                        <ClipboardList className="h-4 w-4 mr-2" />
                        Add task
                      </DropdownMenuItem>
                      <ReferralDialog
                        patientUserId={patientUserId}
                        trigger={
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <Share2 className="h-4 w-4 mr-2" />
                            Refer
                          </DropdownMenuItem>
                        }
                      />
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      <CreateTaskDialog open={taskOpen} onOpenChange={setTaskOpen} patientUserId={patientUserId} />
    </>
  );
}
