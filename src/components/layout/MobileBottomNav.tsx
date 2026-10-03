import { Link, useLocation } from "react-router-dom";
import {
  CalendarDays,
  HeartPulse,
  Users,
  BookOpen,
  Inbox,
  UserSquare2,
  MessageCircle,
  Building2,
  Mic,
  Lock,
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
import { Fragment, useEffect } from "react";
import { toast } from "sonner";
import { useScribeAccess } from "@/hooks/useScribeAccess";
import { useOptionalScribeRecorder } from "@/contexts/ScribeRecorderContext";
import { useOptionalVoiceMemoSheet } from "@/components/clinician/VoiceMemoSheet";
import { cn } from "@/lib/utils";

const PATIENT_ICONS: Record<PatientPillarKey, React.ElementType> = {
  today: CalendarDays,
  health: HeartPulse,
  team: Users,
  learn: BookOpen,
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
  const scribeAccess = useScribeAccess();
  const recorder = useOptionalScribeRecorder();
  const memoSheet = useOptionalVoiceMemoSheet();

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
      <ul className={cn("grid", isClinician ? "grid-cols-5" : "grid-cols-4")}>
        {pillars.map((p, index) => {
          const Icon = icons[p.key as PatientPillarKey & ClinicianPillarKey];
          const isActive = activeKey === p.key;
          return (
            <Fragment key={p.key}>
              {isClinician && index === 2 && (
                <li className="flex items-center justify-center">
                  {scribeAccess.allowed && memoSheet ? (
                    // The record control opens the capture sheet: a voice memo
                    // here, or Record visit for a patient conversation.
                    <button
                      type="button"
                      onClick={memoSheet.openSheet}
                      aria-label={recorder?.recording ? "Recording in progress. Open recorder" : "Record: voice memo or visit"}
                      className={cn(
                        "-mt-4 flex h-12 w-12 items-center justify-center rounded-full shadow-lg",
                        recorder?.recording
                          ? "bg-destructive text-destructive-foreground animate-pulse"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      <Mic className="h-5 w-5" aria-hidden />
                    </button>
                  ) : scribeAccess.allowed ? (
                    <Link
                      to="/clinician/scribe"
                      aria-label={recorder?.recording ? "Scribe - recording in progress" : "Start scribe"}
                      className={cn(
                        "-mt-4 flex h-12 w-12 items-center justify-center rounded-full shadow-lg",
                        recorder?.recording
                          ? "bg-destructive text-destructive-foreground animate-pulse"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      <Mic className="h-5 w-5" aria-hidden />
                    </Link>
                  ) : scribeAccess.locked ? (
                    <button
                      type="button"
                      aria-label={`Scribe locked. ${scribeAccess.reason}`}
                      aria-disabled="true"
                      onClick={() => toast.info(scribeAccess.reason)}
                      className="-mt-4 flex h-12 w-12 items-center justify-center rounded-full border bg-muted text-muted-foreground"
                    >
                      <Lock className="h-5 w-5" aria-hidden />
                    </button>
                  ) : null}
                </li>
              )}
            <li>
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
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
