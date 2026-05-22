import { Link, useLocation } from "react-router-dom";
import {
  PATIENT_PILLARS,
  CLINICIAN_PILLARS,
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
 */
export function SectionTabs({ section, variant = "patient" }: Props) {
  const { pathname, hash } = useLocation();
  const pillars = variant === "patient" ? PATIENT_PILLARS : CLINICIAN_PILLARS;
  const pillar = pillars.find((p) => p.key === section);
  if (!pillar || pillar.tabs.length <= 1) return null;

  // Detect whether THIS pillar uses any hash anchors
  const usesHashTabs = pillar.tabs.some((t) => t.to.includes("#"));

  return (
    <div className="border-b border-border/60 bg-background/60 backdrop-blur">
      <div className="container max-w-screen-2xl">
        <nav
          aria-label={`${pillar.label} sub-navigation`}
          className="flex items-center gap-1 overflow-x-auto scrollbar-none -mx-2 px-2 py-2"
        >
          {pillar.tabs.map((tab) => {
            const [tabPath, tabHash] = tab.to.split("#");
            let isActive: boolean;
            if (usesHashTabs) {
              // Hash-driven pillar (e.g. Practice → /clinician/settings#...).
              // Only one of the hash tabs should highlight at a time.
              if (tabHash) {
                isActive = pathname === tabPath && hash === `#${tabHash}`;
              } else {
                // The "root" tab (no hash) is active only when on the path with no hash
                isActive = pathname === tabPath && !hash;
              }
            } else {
              isActive =
                pathname === tabPath || pathname.startsWith(tabPath + "/");
            }
            return (
              <Link
                key={tab.to}
                to={tab.to}
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
      </div>
    </div>
  );
}
