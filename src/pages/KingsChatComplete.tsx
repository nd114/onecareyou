import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthHeader } from "@/components/layout/AuthHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  KINGSCHAT_RESULT_CHANNEL,
  KINGSCHAT_RESULT_KEY,
  parseCompletionFragment,
  takePendingLogin,
  type KingsChatResultMessage,
} from "@/lib/kingschat-login";

type View =
  | { kind: "working" }
  | { kind: "foreign" }
  | { kind: "failed"; message: string };

/** Tell a waiting sign-in button in another tab of this origin how it went. */
function report(message: KingsChatResultMessage) {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(KINGSCHAT_RESULT_CHANNEL);
      channel.postMessage(message);
      channel.close();
    }
  } catch {
    // Fall through to the storage event.
  }
  try {
    window.localStorage.setItem(KINGSCHAT_RESULT_KEY, JSON.stringify(message));
    window.localStorage.removeItem(KINGSCHAT_RESULT_KEY);
  } catch {
    // Nothing else to try; the button times out.
  }
}

function claimFailureMessage(status: string | undefined, error: string | null | undefined) {
  switch (status) {
    case "failed":
      return error || "KingsChat sign-in failed.";
    case "expired":
      return "KingsChat sign-in took too long. Please try again.";
    case "pending":
      return "KingsChat did not confirm this sign-in. Please try again.";
    default:
      return "That KingsChat sign-in is no longer valid. Please try again.";
  }
}

/**
 * Where KingsChat's callback sends the browser in which the user approved.
 *
 * The fragment carries the login's nonce and a completion code. The session is
 * claimed only if this browser also holds the secret it was given when it
 * began that login (20261009110000). A browser that approved a login someone
 * else began — the phishing case — has no such secret, claims nothing, and is
 * told so.
 */
const KingsChatComplete = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<View>({ kind: "working" });
  // The secret is taken on first read; a second run (StrictMode) must not
  // mistake its absence for a foreign login.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const parsed = parseCompletionFragment(window.location.hash);
    // Off the address bar and out of history before anything else happens.
    window.history.replaceState(null, "", window.location.pathname);

    const pending = parsed ? takePendingLogin(window.localStorage, parsed.nonce) : null;
    if (!parsed || !pending) {
      setView({ kind: "foreign" });
      return;
    }

    const fail = (message: string) => {
      report({ nonce: pending.nonce, outcome: "failed", error: message });
      setView({ kind: "failed", message });
    };

    (async () => {
      try {
        const { data, error } = await supabase.rpc("kingschat_claim_login", {
          _nonce: pending.nonce,
          _browser_secret: pending.secret,
          ...(parsed.code ? { _completion_code: parsed.code } : {}),
        });
        const result = data?.[0];
        if (error || !result || result.status !== "ready" || !result.token_hash) {
          fail(error ? "Could not finish KingsChat sign-in. Please try again."
                     : claimFailureMessage(result?.status, result?.error));
          return;
        }

        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: result.token_hash,
          type: "email",
        });
        if (verifyError) {
          fail(verifyError.message);
          return;
        }

        report({ nonce: pending.nonce, outcome: "signed-in" });
        if (pending.mode === "popup") {
          // The window that opened this takes it from here.
          window.close();
          // Still open (the opener is gone, or the browser refused): carry on here.
          setTimeout(() => navigate(pending.redirectTo, { replace: true }), 600);
        } else {
          navigate(pending.redirectTo, { replace: true });
        }
      } catch (err) {
        fail(err instanceof Error ? err.message : "KingsChat sign-in failed");
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AuthHeader />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md space-y-4">
          {view.kind === "working" && (
            <>
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Finishing KingsChat sign-in…</p>
            </>
          )}
          {view.kind === "foreign" && (
            <>
              <h1 className="text-xl font-semibold">This sign-in wasn't started here</h1>
              <p className="text-sm text-muted-foreground">
                For your security, a KingsChat sign-in can only be finished in the browser
                where it was started. Nobody has been signed in. If you didn't start a
                sign-in, you can close this page. Otherwise, start again from the OneCare
                sign-in page on this device.
              </p>
              <Button asChild>
                <Link to="/sign-in" replace>Go to sign in</Link>
              </Button>
            </>
          )}
          {view.kind === "failed" && (
            <>
              <h1 className="text-xl font-semibold">KingsChat sign-in didn't finish</h1>
              <p className="text-sm text-muted-foreground">{view.message}</p>
              <Button asChild>
                <Link to="/sign-in" replace>Back to sign in</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default KingsChatComplete;
