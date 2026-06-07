// PWA install routing (Plan Part D #6).
//
// When the PWA is launched in standalone display-mode and the user lands on
// the root `/` (the manifest start_url), redirect them to their role's
// "Today" pillar:
//   - clinicians → /clinician/dashboard
//   - everyone else → /dashboard
//
// Inside a normal browser tab (display-mode: browser), this component is a
// no-op so /` continues to render the marketing Landing page.

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useClinicianProfile } from "@/hooks/useClinicianProfile";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari legacy flag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window.navigator as any).standalone === true) return true;
  return false;
}

export function StandaloneLaunchRedirect() {
  const { user, loading: authLoading } = useAuth();
  const { isClinician, isLoading: clinicianLoading } = useClinicianProfile();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading || clinicianLoading) return;
    if (!user) return;
    if (location.pathname !== "/") return;
    if (!isStandalone()) return;

    navigate(isClinician ? "/clinician/dashboard" : "/dashboard", {
      replace: true,
    });
  }, [authLoading, clinicianLoading, user, isClinician, location.pathname, navigate]);

  return null;
}
