import { ReactNode } from 'react';

/**
 * Single container that holds all floating action buttons in the bottom-right
 * thumb zone. Children stack vertically with consistent spacing so the bug
 * button, AI assistant button, and any future FAB never overlap each other
 * or crowd the offline banner / mobile nav.
 *
 * Each child is expected to be position-relative (not fixed). The stack
 * handles the fixed positioning.
 */
export function FabStack({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-3 pointer-events-none"
      aria-hidden={false}
    >
      {/* Each child must opt into pointer-events: enable on the actual control */}
      {children}
    </div>
  );
}
