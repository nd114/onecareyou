import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useAdminRole } from '@/hooks/useAdminRole';
import { usePracticeAdminAccess } from '@/hooks/usePracticeAdmin';
import { Loader2 } from 'lucide-react';

interface PatientRouteProps {
  children: React.ReactNode;
}

/**
 * Guards patient-only routes. Redirects:
 *  - unauthenticated users to /sign-in
 *  - authenticated clinicians to /clinician/today (prevents cross-role leakage
 *    where a clinician account renders the patient dashboard as empty data).
 */
export function PatientRoute({ children }: PatientRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { isClinician, isLoading: profileLoading } = useClinicianProfile();
  const { isAdmin, isLoading: adminLoading } = useAdminRole();
  const { isAdministrative, isLoading: practiceAdminLoading } = usePracticeAdminAccess();
  const location = useLocation();

  if (authLoading || profileLoading || adminLoading || practiceAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  // Platform admins have their own console; patient surfaces would render empty for them.
  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (isClinician) {
    return <Navigate to="/clinician/today" replace />;
  }

  // Hospital owners and administrators manage the institution; they hold no
  // patient record of their own, so the patient dashboard would render empty.
  if (isAdministrative) {
    return <Navigate to="/practice" replace />;
  }

  return <>{children}</>;
}
