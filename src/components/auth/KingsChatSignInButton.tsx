import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import kingschatLogo from "@/assets/kingschat-logo.png.asset.json";

interface KingsChatSignInButtonProps {
  label?: string;
  redirectTo?: string;
}

const KINGSCHAT_AUTH_URL = "https://accounts.kingsch.at/";
const ALLOWED_ORIGINS = ["https://accounts.kingsch.at"];
// KingsChat app registered with redirect URL https://www.onecare.you/
const CLIENT_ID = "cb84e89e-9b79-4da6-b69a-36eda4ab6135";
// KingsChat validates redirect_uri against the exact value registered for the
// app, so it must be the registered origin — not the origin we happen to be on
// (preview, apex domain, etc.). The popup posts tokens back via postMessage,
// so no navigation to this URL actually happens.
const REDIRECT_URI = "https://www.onecare.you";


interface KingsChatTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresInMillis?: number;
  error?: string;
}

function openKingsChatLogin(): Promise<KingsChatTokenResponse> {
  const width = Math.min(Math.floor(window.outerWidth * 0.9), 950);
  const height = Math.min(Math.floor(window.outerHeight * 0.9), 600);
  const left = Math.floor(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.floor(window.screenY + (window.outerHeight - height) / 8);

  const url = new URL(KINGSCHAT_AUTH_URL);
  url.searchParams.append("client_id", CLIENT_ID);
  // KingsChat's auth page JSON.parse()es this param — it must be a JSON array, not a plain string.
  url.searchParams.append("scopes", JSON.stringify(["user"]));
  url.searchParams.append("redirect_uri", window.location.origin);
  url.searchParams.append("post_message", "1");

  const authWindow = window.open(
    url.href,
    "_blank",
    `toolbar=0,scrollbars=1,status=1,resizable=1,location=1,menuBar=0,width=${width},height=${height},left=${left},top=${top}`,
  );

  if (!authWindow) {
    return Promise.reject(new Error("Please allow popups to sign in with KingsChat"));
  }

  return new Promise((resolve, reject) => {
    const listener = (msg: MessageEvent) => {
      if (msg.source === window) return;
      if (!ALLOWED_ORIGINS.includes(msg.origin)) return;
      window.removeEventListener("message", listener as EventListener);
      clearInterval(interval);
      authWindow.close();
      if (msg.data?.error) {
        reject(new Error(msg.data.error));
      } else if (msg.data?.accessToken) {
        resolve(msg.data as KingsChatTokenResponse);
      } else {
        reject(new Error("KingsChat sign-in returned an unexpected response"));
      }
    };
    window.addEventListener("message", listener as EventListener, false);
    const interval = setInterval(() => {
      if (!authWindow.window || authWindow.closed) {
        window.removeEventListener("message", listener as EventListener);
        clearInterval(interval);
        reject(new Error("Sign-in window was closed before completing"));
      }
    }, 350);
  });
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
