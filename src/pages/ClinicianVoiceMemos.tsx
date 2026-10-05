import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Mic, RotateCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClinicianHeader } from "@/components/clinician/ClinicianHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useClinicianPatients } from "@/hooks/useClinicianPatients";
import { memoFailureText, useVoiceMemos, type VoiceMemo } from "@/hooks/useVoiceMemos";
import { useOptionalVoiceMemoSheet } from "@/components/clinician/VoiceMemoSheet";
import { ScribeNotInPlanNotice } from "@/components/clinician/ScribeNotInPlanNotice";
import { useScribePlan } from "@/hooks/useScribePlan";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Waiting",
  transcribing: "Transcribing",
  transcribed: "Ready",
  assigned: "Assigned",
  filed: "Filed to a note",
  failed: "Failed",
};

const NONE = "__none__";

function minutes(ms: number | null) {
  const s = Math.round((ms ?? 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The clinician's own voice memos. Nothing here is visible to a patient and
 * nothing reaches a chart until the clinician makes a draft note from a memo,
 * reviews it and signs it in the encounter.
 */
const ClinicianVoiceMemos = () => {
  const navigate = useNavigate();
  const sheet = useOptionalVoiceMemoSheet();
  const plan = useScribePlan();
  const { memos, isLoading, retry, discard, keepTranscript, assign } = useVoiceMemos();
  const { patients } = useClinicianPatients();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirmDiscard, setConfirmDiscard] = useState<VoiceMemo | null>(null);

  const active = useMemo(() => patients.filter((p) => p.share_active !== false), [patients]);
  const byUser = useMemo(() => new Map(patients.map((p) => [p.user_id, p])), [patients]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onAssign = (m: VoiceMemo, value: string) => {
    const patientUserId = value === NONE ? null : value;
    assign.mutate(
      { id: m.id, patientUserId },
      { onError: () => toast.error("Could not assign this memo. You need current access to that patient.") },
    );
  };

  const makeDraft = (m: VoiceMemo) => {
    const p = m.patient_user_id ? byUser.get(m.patient_user_id) : undefined;
    if (!p) {
      toast.error("Assign this memo to one of your patients first.");
      return;
    }
    navigate(`/clinician/patients/${p.invite_code}?tab=encounters&scribe=1&memo=${m.id}`);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <ClinicianHeader />
      <SectionTabs section="today" variant="clinician" />
      <main className="container max-w-2xl space-y-4 px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" /> Voice memos
            </CardTitle>
            <CardDescription>
              Your own dictated notes. Only you can see them. Nothing goes into a patient record until you make a
              draft note, review it and sign it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {plan.blocked && <ScribeNotInPlanNotice />}
            {sheet && !plan.blocked && (
              <Button className="gap-2" onClick={sheet.openSheet}>
                <Mic className="h-4 w-4" /> New voice memo
              </Button>
            )}
            <KeepAudioSetting />
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading memos...</p>
        ) : memos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No voice memos yet.</p>
        ) : (
          memos.map((m) => {
            const patient = m.patient_user_id ? byUser.get(m.patient_user_id) : undefined;
            const hasText = !!m.transcript;
            const working = m.status === "uploaded" || m.status === "transcribing";
            return (
              <Card key={m.id} data-testid="voice-memo">
                <CardContent className="space-y-3 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {new Date(m.created_at).toLocaleString()}{" "}
                      <span className="font-normal text-muted-foreground">({minutes(m.duration_ms)})</span>
                    </div>
                    <Badge variant={m.status === "failed" ? "destructive" : "outline"} className="gap-1">
                      {working && <Loader2 className="h-3 w-3 animate-spin" />}
                      {STATUS_LABEL[m.status] ?? m.status}
                    </Badge>
                  </div>

                  {m.status === "failed" && (
                    <p className="text-xs text-destructive" role="alert">
                      {memoFailureText(m.error_code)}
                    </p>
                  )}

                  {(m.status === "failed" || m.status === "uploaded") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(m.id)}
                    >
                      <RotateCw className="h-3.5 w-3.5" /> Retry
                    </Button>
                  )}

                  {hasText && (
                    <div className="space-y-2">
                      <Button size="sm" variant="ghost" className="px-0" onClick={() => toggle(m.id)}>
                        {open.has(m.id) ? "Hide transcript" : "View transcript"}
                      </Button>
                      {open.has(m.id) && (
                        <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs">{m.transcript}</p>
                      )}
                    </div>
                  )}

                  {hasText && m.status !== "filed" && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground" htmlFor={`assign-${m.id}`}>
                        Patient this memo is about
                      </Label>
                      <Select value={m.patient_user_id ?? NONE} onValueChange={(v) => onAssign(m, v)}>
                        <SelectTrigger id={`assign-${m.id}`} className="h-9" aria-label="Assign to patient">
                          <SelectValue placeholder="Not assigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Not assigned</SelectItem>
                          {active.map((p) => (
                            <SelectItem key={p.user_id} value={p.user_id}>
                              {p.patient_name || "Unnamed patient"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {hasText && m.status === "assigned" && (
                      <Button size="sm" onClick={() => makeDraft(m)}>
                        Make draft note
                      </Button>
                    )}
                    {hasText && m.status === "filed" && patient && (
                      <span className="text-xs text-muted-foreground">
                        Filed to a note for {patient.patient_name}.
                      </span>
                    )}
                    {hasText && m.status !== "filed" && !m.transcript_confirmed_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={keepTranscript.isPending}
                        onClick={() => keepTranscript.mutate(m.id)}
                      >
                        Keep transcript
                      </Button>
                    )}
                    {m.status !== "filed" && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(m)}>
                        Discard
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </main>

      <AlertDialog open={!!confirmDiscard} onOpenChange={(o) => !o && setConfirmDiscard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this memo?</AlertDialogTitle>
            <AlertDialogDescription>
              The transcript is deleted now and the audio within a day. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDiscard) discard.mutate(confirmDiscard.id);
                setConfirmDiscard(null);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** Memo audio is deleted 24 hours after you file, keep or discard a memo, unless you choose to keep it. */
function KeepAudioSetting() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["keep-memo-audio", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("clinician_profiles")
        .select("keep_memo_audio")
        .eq("user_id", user!.id)
        .maybeSingle();
      return Boolean(data?.keep_memo_audio);
    },
  });
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id="keep-memo-audio"
        checked={!!data}
        onCheckedChange={async (v) => {
          const { error } = await supabase
            .from("clinician_profiles")
            .update({ keep_memo_audio: v === true })
            .eq("user_id", user!.id);
          if (error) toast.error("Could not save that setting");
          void qc.invalidateQueries({ queryKey: ["keep-memo-audio"] });
        }}
      />
      <Label htmlFor="keep-memo-audio" className="text-xs font-normal text-muted-foreground">
        Keep memo audio. Otherwise it is deleted 24 hours after you file, keep or discard a memo, and after 30
        days at most.
      </Label>
    </div>
  );
}

export default ClinicianVoiceMemos;
