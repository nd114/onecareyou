import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable/index";

interface GoogleSignInButtonProps {
  label?: string;
  redirectTo?: string;
}

export function GoogleSignInButton({
  label = "Continue with Google",
  redirectTo,
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleClick = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });

      if (result.error) {
        toast.error(result.error.message || "Google sign-in failed");
        setLoading(false);
        return;
      }

      if (result.redirected) {
        // Browser will navigate away
        return;
      }

      // Popup flow: session already set
      toast.success("Signed in with Google");
      navigate(redirectTo ?? "/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M12 10.2v3.9h5.5c-.24 1.4-1.68 4.1-5.5 4.1-3.31 0-6.01-2.74-6.01-6.12S8.69 5.96 12 5.96c1.88 0 3.14.8 3.86 1.49l2.63-2.53C16.85 3.44 14.65 2.5 12 2.5 6.99 2.5 2.94 6.55 2.94 11.57S6.99 20.64 12 20.64c6.93 0 9.34-4.87 9.34-8.55 0-.58-.06-1.02-.14-1.46H12z"
          />
        </svg>
      )}
      {label}
    </Button>
  );
}
