import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { Loader2, ShieldAlert } from 'lucide-react';

/**
 * The platform console is only served from our own address. Tenant addresses
 * (e.g. lmc.onecare.you) and any other host never expose admin surfaces.
 */
export function isAdminHostAllowed(host = window.location.hostname): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return true;
  if (h.endsWith('.lovable.app') || h.endsWith('.lovableproject.com')) return true;
  return h === 'onecare.you' || h === 'www.onecare.you';
}

/** Server-verified admin gate. Non-admins are sent to the dashboard. */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useAdminRole();
  const location = useLocation();

  if (!isAdminHostAllowed()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-3">
          <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
          <h1 className="font-display text-xl font-semibold">Not available on this address</h1>
          <p className="text-sm text-muted-foreground">
            The OneCare platform console is only reachable from onecare.you. Sign in there to
            continue.
          </p>
        </div>
      </div>
    );
  }

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
