import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Single container that holds all floating action buttons in the bottom-right
 * thumb zone. Children stack vertically with consistent spacing so the bug
 * button, AI assistant button, and any future FAB never overlap each other
 * or crowd the offline banner / mobile nav.
 *
 * On routes that already have a sticky bottom input bar (Simple Mode,
 * Messages), the stack is raised above the input so the FABs never sit on
 * top of the send button.
 *
 * Each child is expected to be position-relative (not fixed). The stack
 * handles the fixed positioning.
 */
const RAISED_PREFIXES = ['/assist', '/messages', '/clinician/messages'];

export function FabStack({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const raised = RAISED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  return (
    <div
      className={cn(
        'fixed right-4 sm:right-6 z-50 flex flex-col items-end gap-3 pointer-events-none',
        raised ? 'bottom-24 sm:bottom-24' : 'bottom-4 sm:bottom-6',
      )}
      aria-hidden={false}
    >
      {/* Each child must opt into pointer-events: enable on the actual control */}
      {children}
    </div>
  );
}
