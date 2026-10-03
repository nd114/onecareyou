import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Loader2, RotateCw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOptionalScribeRecorder } from "@/contexts/ScribeRecorderContext";
import { cn } from "@/lib/utils";

export function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The always-there handle on a recording. It appears on every page while a
 * visit is being recorded, sent or waiting to be recovered, so leaving the
 * encounter never means losing it and coming back is one tap.
 *
 * Phones: above the bottom bar, centred. Larger screens: top, centred. Shows
 * no patient name or transcript, only state and time.
 */
export function ScribeRecordingPill() {
  const scribe = useOptionalScribeRecorder();
  const navigate = useNavigate();
  const [reviewOpen, setReviewOpen] = useState(false);
  if (!scribe) return null;

  const { recording, paused, elapsed, busy, unsent, result, target } = scribe;
  const returnTo = target?.returnTo ?? result?.returnTo;
  const goBack = () => {
    if (returnTo) navigate(returnTo, { state: { scribeReopen: Date.now() } });
  };

  let body: React.ReactNode = null;
  if (recording) {
    body = (
      <>
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-2 pl-3 pr-2 py-2 text-sm font-medium"
          aria-label={`${paused ? "Paused" : "Recording"} ${formatElapsed(elapsed)}. Return to the visit`}
        >
          <span
            className={cn("h-2.5 w-2.5 rounded-full bg-destructive", !paused && "animate-pulse")}
            aria-hidden
          />
          <span>
            {paused ? "Paused" : "Recording"} - {formatElapsed(elapsed)}
          </span>
        </button>
        <Button
          size="sm"
          variant="destructive"
          className="mr-1 h-7 gap-1 px-2"
          onClick={scribe.stop}
          aria-label="Stop recording"
        >
          <Square className="h-3 w-3" /> Stop
        </Button>
      </>
    );
  } else if (busy) {
    body = (
      <div className="flex items-center gap-2 px-3 py-2 text-sm" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {busy === "uploading" ? "Saving recording..." : "Drafting note..."}
      </div>
    );
  } else if (unsent.length > 0) {
    body = (
      <button
        type="button"
        onClick={() => setReviewOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden />
        Unsaved recording - Recover
      </button>
    );
  } else if (result) {
    body = (
      <>
        <button type="button" onClick={goBack} className="px-3 py-2 text-sm font-medium">
          Draft ready - Open
        </button>
        <button
          type="button"
          onClick={scribe.clearResult}
          className="mr-1 rounded-full p-1 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </>
    );
  }

  return (
    <>
      {body && (
        <div
          data-testid="scribe-pill"
          className={cn(
            "fixed z-40 left-1/2 -translate-x-1/2 flex items-center rounded-full border bg-background shadow-lg",
            // Above the phone bottom bar; at the top on larger screens.
            "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-auto md:top-3",
          )}
        >
          {body}
        </div>
      )}

      <Dialog open={reviewOpen && unsent.length > 0} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recover unsaved recording</DialogTitle>
            <DialogDescription>
              These recordings are kept on this device only. Retry sends them for drafting; Download
              saves the audio as a file.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3">
            {unsent.map((r) => (
              <li key={r.id} className="space-y-2 rounded-md border p-3 text-sm">
                <div className="text-muted-foreground">
                  {r.recovered ? "Recovered after an interruption" : "Not yet drafted"} -{" "}
                  {new Date(r.createdAt).toLocaleString()}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="gap-2" onClick={() => void scribe.retry(r.id)} disabled={!!busy}>
                    <RotateCw className="h-3.5 w-3.5" /> Retry
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => scribe.download(r.id)}>
                    <Download className="h-3.5 w-3.5" /> Download audio
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void scribe.discard(r.id)}>
                    Discard
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
