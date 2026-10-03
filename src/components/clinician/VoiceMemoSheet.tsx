import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Download, Loader2, Mic, Pause, Play, RotateCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOptionalScribeRecorder } from "@/contexts/ScribeRecorderContext";
import { formatElapsed } from "@/components/clinician/ScribeRecordingPill";

/** The wording the clinician sees before they record. Kept in one place so tests and copy agree. */
export const VOICE_MEMO_NOTICE =
  "Dictate your own notes. Do not record the patient. For a conversation with a patient use Record visit.";

interface SheetState {
  open: boolean;
  openSheet: () => void;
  closeSheet: () => void;
}

const Ctx = createContext<SheetState | null>(null);

export function VoiceMemoSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSheet = useCallback(() => setOpen(true), []);
  const closeSheet = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, openSheet, closeSheet }), [open, openSheet, closeSheet]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <VoiceMemoSheet />
    </Ctx.Provider>
  );
}

/** Null outside the provider (public pages, tests), so entry points can fall back to a link. */
export function useOptionalVoiceMemoSheet() {
  return useContext(Ctx);
}

/**
 * Bottom-sheet capture for a clinician's own dictation. It is the front door
 * from the record control: record a memo here, or go on to Record visit for a
 * patient conversation. The recorder and its IndexedDB persistence are the
 * global ones; this only draws the controls.
 */
export function VoiceMemoSheet() {
  const sheet = useContext(Ctx);
  const scribe = useOptionalScribeRecorder();
  const location = useLocation();
  if (!sheet || !scribe) return null;

  const memoRecording = scribe.recording && scribe.target?.kind === "memo";
  const visitRecording = scribe.recording && !memoRecording;
  const unsentMemos = scribe.unsent.filter((r) => r.kind === "memo");

  return (
    <Sheet open={sheet.open} onOpenChange={(o) => (o ? sheet.openSheet() : sheet.closeSheet())}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SheetHeader className="text-left">
          <SheetTitle>Voice memo</SheetTitle>
          <SheetDescription>{VOICE_MEMO_NOTICE}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {memoRecording ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="destructive" className="gap-2" onClick={scribe.stop}>
                <Square className="h-4 w-4" /> Stop and save - {formatElapsed(scribe.elapsed)}
              </Button>
              {scribe.paused ? (
                <Button variant="outline" className="gap-2" onClick={scribe.resume}>
                  <Play className="h-4 w-4" /> Resume
                </Button>
              ) : (
                <Button variant="outline" className="gap-2" onClick={scribe.pause}>
                  <Pause className="h-4 w-4" /> Pause
                </Button>
              )}
              <span className="text-xs text-muted-foreground" role="status">
                {scribe.paused ? "Paused" : "Recording"}
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                className="gap-2"
                disabled={visitRecording || scribe.memoBusy}
                onClick={async () => {
                  await scribe.startMemo(`${location.pathname}${location.search}`);
                }}
              >
                {scribe.memoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                {scribe.memoBusy ? "Saving memo..." : "Record memo"}
              </Button>
              {visitRecording && (
                <p className="text-xs text-muted-foreground">A visit is being recorded. Stop it first.</p>
              )}
            </div>
          )}

          {unsentMemos.length > 0 && !memoRecording && (
            <div role="alert" className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              <div className="font-medium">
                Recover unsaved memo: {unsentMemos.length === 1 ? "a memo is" : `${unsentMemos.length} memos are`} saved on
                this device and not yet uploaded.
              </div>
              {unsentMemos.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2">
                  <Button size="sm" className="gap-2" disabled={scribe.memoBusy} onClick={() => void scribe.retry(r.id)}>
                    <RotateCw className="h-3.5 w-3.5" /> Upload now
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => scribe.download(r.id)}>
                    <Download className="h-3.5 w-3.5" /> Download audio
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void scribe.discard(r.id)}>
                    Discard
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3 border-t pt-3 text-sm">
            <Link to="/clinician/scribe" onClick={sheet.closeSheet} className="font-medium text-primary underline-offset-2 hover:underline">
              Record visit
            </Link>
            <Link to="/clinician/voice-memos" onClick={sheet.closeSheet} className="text-muted-foreground underline-offset-2 hover:underline">
              Open memo inbox
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
