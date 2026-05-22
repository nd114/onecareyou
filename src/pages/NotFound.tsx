import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useClinicianProfile } from "@/hooks/useClinicianProfile";
import { Header } from "@/components/layout/Header";
import { ClinicianHeader } from "@/components/clinician/ClinicianHeader";
import { AuthHeader } from "@/components/layout/AuthHeader";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { isClinician } = useClinicianProfile();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  // Pick the header that matches the visitor's context so they always have a way out.
  const HeaderEl = !user ? AuthHeader : isClinician ? ClinicianHeader : Header;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <HeaderEl />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="mb-4 text-6xl font-bold text-primary">404</h1>
          <p className="mb-2 text-xl font-semibold">Page not found</p>
          <p className="mb-6 text-sm text-muted-foreground">
            The page <code className="font-mono">{location.pathname}</code>{" "}
            doesn't exist or has moved.
          </p>
          <div className="flex gap-2 justify-center">
            <Button asChild variant="outline">
              <Link to={-1 as unknown as string}>Go back</Link>
            </Button>
            <Button asChild>
              <Link
                to={
                  !user
                    ? "/"
                    : isClinician
                      ? "/clinician/dashboard"
                      : "/dashboard"
                }
              >
                {!user ? "Home" : "Dashboard"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
