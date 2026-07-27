import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { Loader2 } from 'lucide-react';

interface ClinicianRouteProps {
  children: React.ReactNode;
}

/**
 * Guards clinician-only routes. Redirects:
 *  - unauthenticated users to /sign-in
 *  - authenticated non-clinicians (patients) to /dashboard
 */
export function ClinicianRoute({ children }: ClinicianRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { isClinician, isLoading: profileLoading } = useClinicianProfile();
  const location = useLocation();

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  if (!isClinician) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
