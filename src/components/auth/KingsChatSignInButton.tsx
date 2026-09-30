import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import kingschatLogo from "@/assets/kingschat-logo.png.asset.json";
import { safeInternalPath } from "@/lib/safe-path";
import {
  KINGSCHAT_RESULT_CHANNEL,
  KINGSCHAT_RESULT_KEY,
  buildKingsChatLoginUrl,
  forgetPendingLogin,
  isResultMessage,
  savePendingLogin,
} from "@/lib/kingschat-login";

interface KingsChatSignInButtonProps {
  label?: string;
  redirectTo?: string;
}

const WATCH_INTERVAL_MS = 1500;
const GIVE_UP_AFTER_MS = 5 * 60 * 1000;
// A popup that finishes reports and then closes itself; give the report time
// to arrive before reading a closed window as a cancellation.
const CLOSED_GRACE_MS = 3000;

/**
 * Sign in with KingsChat.
 *
 * KingsChat does not hand this window the authorization code. It delivers it
 * to the callback URL registered on the application, and the two halves are
 * joined by the nonce issued before the user leaves: KingsChat echoes it back
 * as `origin`.
 *
 * The nonce is in the KingsChat link, so it cannot be what proves who gets the
 * session (20261009110000). Beginning also returns a browser secret, kept in
 * this browser's storage and never put in the link. The callback sends the
 * browser where the user approved back to /auth/kingschat/complete with a
 * completion code; that page claims the session with the code and the secret,
 * signs in, and reports here over a same-origin channel. A link begun by
 * someone else and approved here has no secret here, so it signs nobody in —
 * and the browser that began it never sees the code.
 *
 * Issuing and claiming go through database functions rather than edge functions.
 * They only ever touched one table, and every extra edge function is another
 * deployment that has to land before anyone can sign in — which is exactly what
 * failed: the browser's preflight to kingschat-start never returned an HTTP-ok
 * status. PostgREST is already there and already answers this browser correctly,
 * as every other query in the app demonstrates.
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
  // The logo is served from the preview host's asset store. Anywhere that
  // store is not mounted the request 404s and the browser draws its
  // broken-image glyph on a sign-in button, which reads as "this is broken"
  // about the whole login. Drop the image instead; the label already names
  // the service.
  const [logoBroken, setLogoBroken] = useState(false);
  const navigate = useNavigate();
  const popup = useRef<Window | null>(null);
  // Tears down whatever is watching for the current login's result.
  const stopWatching = useRef<(() => void) | null>(null);

  // A login left in flight when the page changes should stop watching rather
  // than resolve into a component that is no longer mounted.
  useEffect(() => {
    return () => {
      stopWatching.current?.();
      popup.current?.close();
    };
  }, []);

  const finish = (message: string) => {
    stopWatching.current?.();
    toast.error(message);
    popup.current?.close();
    setLoading(false);
  };

  /**
   * Wait for the completion page, in the popup, to report on this nonce. It
   * reports over a same-origin BroadcastChannel, and through a storage event
   * where that is missing; either way only this origin can speak on it.
   */
  const watchForResult = (nonce: string, landOn: string) => {
    let channel: BroadcastChannel | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let closedSince: number | null = null;
    const startedAt = Date.now();

    const stop = () => {
      channel?.close();
      if (timer) clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      stopWatching.current = null;
      forgetPendingLogin(window.localStorage, nonce);
    };

    const onResult = async (value: unknown) => {
      if (!isResultMessage(value) || value.nonce !== nonce) return;
      stop();
      popup.current?.close();
      if (value.outcome !== "signed-in") {
        finish(value.error ?? "KingsChat sign-in failed");
        return;
      }
      // The popup signed in on this origin; make sure this tab has the session
      // before moving on.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        finish("KingsChat sign-in did not complete. Please try again.");
        return;
      }
      toast.success("Signed in with KingsChat");
      navigate(landOn, { replace: true });
    };

    function onStorage(e: StorageEvent) {
      if (e.key !== KINGSCHAT_RESULT_KEY || !e.newValue) return;
      try {
        void onResult(JSON.parse(e.newValue));
      } catch {
        // Not ours.
      }
    }

    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(KINGSCHAT_RESULT_CHANNEL);
      channel.onmessage = (e) => void onResult(e.data);
    }
    window.addEventListener("storage", onStorage);

    timer = setInterval(() => {
      if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
        finish("KingsChat sign-in timed out. Please try again.");
        return;
      }
      if (popup.current?.closed) {
        closedSince ??= Date.now();
        if (Date.now() - closedSince > CLOSED_GRACE_MS) {
          finish("KingsChat sign-in was cancelled");
        }
      }
    }, WATCH_INTERVAL_MS);

    stopWatching.current = stop;
  };

  const handleClick = async () => {
    setLoading(true);
    stopWatching.current?.();

    // Opened before the await: a popup opened after one is blocked, because the
    // browser no longer counts it as a response to the click.
    popup.current = window.open("", "_blank", "width=520,height=680");

    try {
      // The generated types lag this function's current signature (they still
      // describe the first version, which took no arguments and returned a
      // string). types.ts is auto-generated, so the correct signature is
      // declared here at the call site instead.
      interface BegunLogin {
        nonce: string;
        browser_secret: string;
      }
      const { data: rows, error } = (await supabase.rpc(
        "kingschat_begin_login" as never,
        { _return_origin: window.location.origin } as never,
      )) as { data: BegunLogin[] | null; error: { message: string } | null };
      const begun = rows?.[0];
      if (error || !begun?.nonce || !begun?.browser_secret) {
        finish(error?.message || "Could not start KingsChat sign-in");
        return;
      }

      // Safe by construction: every caller passes a literal today, and nothing
      // here has to stay true for that to remain the case.
      const landOn = safeInternalPath(redirectTo, "/dashboard");
      const loginUrl = buildKingsChatLoginUrl(begun.nonce);
      const inPopup = !!popup.current && !popup.current.closed;

      // Kept before leaving: the completion page needs it to claim. It is the
      // one thing the KingsChat link does not carry.
      savePendingLogin(window.localStorage, {
        nonce: begun.nonce,
        secret: begun.browser_secret,
        redirectTo: landOn,
        mode: inPopup ? "popup" : "redirect",
      });

      if (inPopup) {
        watchForResult(begun.nonce, landOn);
        popup.current!.location.href = loginUrl;
      } else {
        // Popups blocked: this tab goes instead, and the completion page
        // finishes the sign-in in this tab when KingsChat sends it back.
        window.location.href = loginUrl;
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
      ) : logoBroken ? null : (
        <img
          src={kingschatLogo.url}
          alt=""
          aria-hidden="true"
          width={16}
          height={16}
          className="mr-2 h-4 w-4"
          onError={() => setLogoBroken(true)}
        />
      )}
      {label}
    </Button>
  );
}
