import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { usePracticeAdminAccess } from '@/hooks/usePracticeAdmin';

/**
 * Guards the hospital administration surface.
 *
 * A third kind of access alongside patient and clinician: whoever manages the
 * institution. Anyone without a management role is sent back to the surface
 * that actually holds their data.
 */
export function PracticeAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isAdministrative, isLoading } = usePracticeAdminAccess();
  const { isClinician, isLoading: profileLoading } = useClinicianProfile();
  const location = useLocation();

  if (authLoading || isLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  if (!isAdministrative) {
    return <Navigate to={isClinician ? '/clinician/today' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}
