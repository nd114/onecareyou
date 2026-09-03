import { cn } from "@/lib/utils";

/**
 * The atmosphere behind the hero.
 *
 * Two soft emerald fields and one gold, drifting slowly. Built from CSS
 * gradients rather than an image: it stays sharp on any screen, weighs nothing
 * on a phone connection, and follows the theme instead of fighting it.
 *
 * The motion is deliberately almost too slow to notice — a health product
 * should feel calm, and a background that draws the eye is competing with the
 * thing the page is actually about. It stops entirely for anyone who has asked
 * for reduced motion.
 */
export function AuroraField({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className="oc-aurora oc-aurora-a" />
      <div className="oc-aurora oc-aurora-b" />
      <div className="oc-aurora oc-aurora-c" />
      {/* A fine grid, barely there, so the emptiness reads as considered rather
          than unfinished. */}
      <div className="oc-grid absolute inset-0" />
    </div>
  );
}
