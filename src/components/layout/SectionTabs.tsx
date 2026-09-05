import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  PATIENT_PILLARS,
  CLINICIAN_PILLARS,
  isNavTabActive,
  type PatientPillarKey,
  type ClinicianPillarKey,
} from "@/lib/nav-ia";

interface Props {
  section: PatientPillarKey | ClinicianPillarKey;
  variant?: "patient" | "clinician";
}

/**
 * Sub-tab bar rendered at the top of each pillar page.
 * Hidden when a pillar has only one tab (no value, just visual noise).
 * Not sticky — the parent header is already sticky, and the OfflineBanner
 * sits inside the header so a sticky offset would drift / overlap.
 *
 * On a phone the row is wider than the screen, and it scrolled with no
 * scrollbar and no other sign: the last tab sat half cut off at the right edge
 * and read as a rendering fault rather than as more to come. Two things fix
 * that — a fade over whichever end has content past it, and scrolling the
 * current tab into view, so landing on Adherence does not leave you looking at
 * Vitals with your own page off the edge.
 */
export function SectionTabs({ section, variant = "patient" }: Props) {
  const { pathname, hash } = useLocation();
  const pillars = variant === "patient" ? PATIENT_PILLARS : CLINICIAN_PILLARS;
  const pillar = pillars.find((p) => p.key === section);

  const scroller = useRef<HTMLElement | null>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflow({
      start: el.scrollLeft > 1,
      // A pixel of slack: fractional widths otherwise leave the fade on
      // permanently at the end of the scroll.
      end: el.scrollLeft < max - 1,
    });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, pillar]);

  // Bring the tab you are on into view, without dragging the page with it.
  // Read off the DOM rather than holding a ref on whichever link is active:
  // React detaches the old ref and attaches the new one, and which order that
  // lands in is not something to build on.
  useEffect(() => {
    scroller.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname, hash]);

  if (!pillar || pillar.tabs.length <= 1) return null;

  return (
    <div className="border-b border-border/60 bg-background/60 backdrop-blur">
      <div className="container max-w-screen-2xl">
        <div className="relative">
          <nav
            ref={scroller}
            aria-label={`${pillar.label} sub-navigation`}
            className="flex items-center gap-1 overflow-x-auto scrollbar-none -mx-2 px-2 py-2"
          >
            {pillar.tabs.map((tab) => {
              const isActive = isNavTabActive(tab, pillar.tabs, pathname, hash);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-current={isActive ? "page" : undefined}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          {/* There is more this way. Decoration only — the row scrolls by
              touch, wheel and keyboard regardless. */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent transition-opacity",
              overflow.start ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent transition-opacity",
              overflow.end ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      </div>
    </div>
  );
}
