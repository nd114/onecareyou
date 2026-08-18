import { Link, useLocation } from "react-router-dom";
import {
  CalendarDays,
  HeartPulse,
  Users,
  Bot,
  Inbox,
  UserSquare2,
  MessageCircle,
  Building2,
} from "lucide-react";
import {
  PATIENT_PILLARS,
  CLINICIAN_PILLARS,
  getPatientPillarForRoute,
  getClinicianPillarForRoute,
  type PatientPillarKey,
  type ClinicianPillarKey,
} from "@/lib/nav-ia";
import { useAuth } from "@/contexts/AuthContext";
import { useClinicianProfile } from "@/hooks/useClinicianProfile";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

const PATIENT_ICONS: Record<PatientPillarKey, React.ElementType> = {
  today: CalendarDays,
  health: HeartPulse,
  team: Users,
  ai: Bot,
};

const CLINICIAN_ICONS: Record<ClinicianPillarKey, React.ElementType> = {
  today: Inbox,
  patients: UserSquare2,
  communicate: MessageCircle,
  practice: Building2,
};

// Hide on auth + marketing + onboarding shells
const HIDE_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/clinician/sign-up",
  "/clinician/portal",
  "/clinician/pricing",
  "/clinician/subscription-success",
  "/subscription-success",
  "/install",
];

// Hide on the landing/public marketing pages
const PUBLIC_EXACT = new Set([
  "/",
  "/about",
  "/features",
  "/pricing",
  "/contact",
  "/help",
  "/careers",
  "/for-clinicians",
  "/ehr-comparison",
  "/privacy",
  "/terms",
  "/data-processing",
  "/disclaimer",
  "/sitemap",
]);

/**
 * Bottom tab bar shown on mobile only.
 * Hidden on auth/marketing routes and when the user is not signed in.
 */
export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { isClinician } = useClinicianProfile();
  const { isAdmin } = useAdminRole();

  // Hooks must run on every render, before any early return: the visibility
  // conditions below depend on async auth/role state, so a hook placed after
  // them changes the hook count between renders and crashes the shell.
  const hidden =
    !user ||
    isAdmin ||
    pathname.startsWith("/admin") ||
    HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    PUBLIC_EXACT.has(pathname);

  // Tell the document the tab bar is present so the shell reserves room for it;
  // pages then cannot forget their own bottom padding.
  useEffect(() => {
    if (hidden) {
      delete document.body.dataset.appChrome;
      return;
    }
    document.body.dataset.appChrome = "mobile-nav";
    return () => {
      delete document.body.dataset.appChrome;
    };
  }, [hidden]);

  if (hidden) return null;

  const pillars = isClinician ? CLINICIAN_PILLARS : PATIENT_PILLARS;
  const activeKey = isClinician
    ? getClinicianPillarForRoute(pathname)
    : getPatientPillarForRoute(pathname);
  const icons = isClinician ? CLINICIAN_ICONS : PATIENT_ICONS;



  return (
    <nav
      aria-label="Primary"
      className={cn(
        "md:hidden fixed bottom-0 inset-x-0 z-40",
        "border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <ul className="grid grid-cols-4">
        {pillars.map((p) => {
          const Icon = icons[p.key as PatientPillarKey & ClinicianPillarKey];
          const isActive = activeKey === p.key;
          return (
            <li key={p.key}>
              <Link
                to={p.primary}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="leading-none">{p.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
