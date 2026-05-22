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
 * Sub-tab bar rendered at the top of every pillar page.
 * Lets users move between sibling pages inside a pillar without going back to the top nav.
 */
export function SectionTabs({ section, variant = "patient" }: Props) {
  const { pathname, hash } = useLocation();
  const pillars = variant === "patient" ? PATIENT_PILLARS : CLINICIAN_PILLARS;
  const pillar = pillars.find((p) => p.key === section);
  if (!pillar || pillar.tabs.length <= 1) return null;

  const current = pathname + (hash || "");

  return (
    <div className="border-b border-border/60 bg-background/60 backdrop-blur sticky top-16 z-30">
      <div className="container max-w-screen-2xl">
        <nav
          aria-label={`${pillar.label} sub-navigation`}
          className="flex items-center gap-1 overflow-x-auto scrollbar-none -mx-2 px-2 py-2"
        >
          {pillar.tabs.map((tab) => {
            const base = tab.to.split("#")[0];
            const isActive =
              tab.to.includes("#")
                ? current === tab.to
                : pathname === base || pathname.startsWith(base + "/");
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
