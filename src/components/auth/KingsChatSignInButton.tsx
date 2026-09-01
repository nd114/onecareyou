import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import kingschatLogo from "@/assets/kingschat-logo.png.asset.json";
// Official SDK: builds the auth URL exactly the way KingsChat's login page
// expects (scopes as a JSON array, redirect_uri = window.location.origin,
// post_message=1) and resolves with the token via postMessage.
import kingschat from "kingschat-web-sdk";

interface KingsChatSignInButtonProps {
  label?: string;
  redirectTo?: string;
}

// KingsChat app registered for this site. The origin you sign in from must be
// registered as a redirect URL on this app, because the SDK always sends
// redirect_uri = window.location.origin.
const CLIENT_ID = "cb84e89e-9b79-4da6-b69a-36eda4ab6135";

interface KingsChatTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresInMillis?: number;
}

function openKingsChatLogin(): Promise<KingsChatTokenResponse> {
  return kingschat.login({
    clientId: CLIENT_ID,
    scopes: ["conference_calls"],
  }) as Promise<KingsChatTokenResponse>;
}


export function KingsChatSignInButton({
  label = "Continue with KingsChat",
  redirectTo,
}: KingsChatSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleClick = async () => {
    setLoading(true);
    try {
      // 1. KingsChat popup login → access token
      const tokens = await openKingsChatLogin();

      // 2. Server verifies the token, resolves identity, mints a magic-link token
      const { data, error } = await supabase.functions.invoke("kingschat-auth", {
        body: { accessToken: tokens.accessToken },
      });
      if (error || !data?.token_hash) {
        toast.error(data?.error || error?.message || "KingsChat sign-in failed");
        setLoading(false);
        return;
      }

      // 3. Exchange the one-time token for a real session
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "email",
      });
      if (verifyError) {
        toast.error(verifyError.message);
        setLoading(false);
        return;
      }

      toast.success("Signed in with KingsChat");
      navigate(redirectTo ?? "/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "KingsChat sign-in failed");
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
        <img src={kingschatLogo.url} alt="" aria-hidden="true" className="mr-2 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
