import { useEffect, useRef, useState } from "react";
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

const POLL_INTERVAL_MS = 1500;
const GIVE_UP_AFTER_MS = 5 * 60 * 1000;

type PollResult = {
  status: "pending" | "ready" | "failed" | "expired" | "consumed" | "unknown";
  token_hash?: string;
  error?: string;
};

/**
 * Sign in with KingsChat.
 *
 * KingsChat does not redirect the browser back with an authorization code — it
 * POSTs the code to the callback URL registered on the application, server to
 * server. So this window never sees the code, and the two halves are joined by
 * the nonce the server issues before the user leaves: KingsChat echoes it back
 * as `origin`, the callback stores the result against it, and this polls for it.
 *
 * The previous version used kingschat-web-sdk, which opens accounts.kingsch.at
 * and expects the token back by postMessage. That is a retired generation of
 * the API — today's login page is accounts.kingschat.online and the platform
 * ignores a redirect_uri passed at request time — so it could not have worked
 * regardless of configuration.
 */
export function KingsChatSignInButton({
  label = "Continue with KingsChat",
  redirectTo,
}: KingsChatSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const cancelled = useRef(false);
  const popup = useRef<Window | null>(null);

  // A login left in flight when the page changes should stop polling rather
  // than resolve into a component that is no longer mounted.
  useEffect(() => {
    return () => {
      cancelled.current = true;
      popup.current?.close();
    };
  }, []);

  const finish = (message: string) => {
    toast.error(message);
    popup.current?.close();
    setLoading(false);
  };

  const handleClick = async () => {
    setLoading(true);
    cancelled.current = false;

    // Opened before the await: a popup opened after one is blocked, because the
    // browser no longer counts it as a response to the click.
    popup.current = window.open("", "_blank", "width=520,height=680");

    try {
      const { data, error } = await supabase.functions.invoke("kingschat-start", { body: {} });
      if (error || !data?.url || !data?.nonce) {
        finish(data?.error || error?.message || "Could not start KingsChat sign-in");
        return;
      }

      if (popup.current && !popup.current.closed) {
        popup.current.location.href = data.url;
      } else {
        // Popups blocked: this tab goes instead. The login still completes —
        // the code reaches the server either way — but this window is replaced,
        // so the poll cannot finish here.
        window.location.href = data.url;
        return;
      }

      const startedAt = Date.now();
      while (!cancelled.current) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (cancelled.current) return;

        if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
          finish("KingsChat sign-in timed out. Please try again.");
          return;
        }

        const { data: poll, error: pollError } = await supabase.functions.invoke(
          "kingschat-poll",
          { body: { nonce: data.nonce } },
        );
        if (pollError) continue; // A dropped poll is not a failed login.

        const result = poll as PollResult;
        if (result.status === "pending") {
          // Give up early if they closed the window without finishing.
          if (popup.current?.closed) {
            finish("KingsChat sign-in was cancelled");
            return;
          }
          continue;
        }
        if (result.status === "ready" && result.token_hash) {
          popup.current?.close();
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: result.token_hash,
            type: "email",
          });
          if (verifyError) {
            finish(verifyError.message);
            return;
          }
          toast.success("Signed in with KingsChat");
          navigate(redirectTo ?? "/dashboard", { replace: true });
          return;
        }
        if (result.status === "failed") {
          finish(result.error ?? "KingsChat sign-in failed");
          return;
        }
        finish(
          result.status === "expired"
            ? "KingsChat sign-in took too long. Please try again."
            : "That KingsChat sign-in is no longer valid. Please try again.",
        );
        return;
      }
    } catch (err) {
      finish(err instanceof Error ? err.message : "KingsChat sign-in failed");
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
