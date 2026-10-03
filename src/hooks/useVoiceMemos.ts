import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { processMemo, VOICE_MEMOS_CHANGED, notifyVoiceMemosChanged } from "@/lib/voice-memo-pipeline";
import type { Database } from "@/integrations/supabase/types";

export type VoiceMemo = Database["public"]["Tables"]["voice_memos"]["Row"];

/** Plain words for the reason a memo failed. Never carries transcript text. */
export function memoFailureText(code: string | null): string {
  switch (code) {
    case "no_speech":
      return "No speech was heard in this memo.";
    case "audio_missing":
    case "audio_empty":
      return "The audio did not arrive. Record it again.";
    case "busy":
      return "Transcription is busy. Try again in a moment.";
    case "credits":
      return "AI credits are exhausted. Ask the workspace owner to top up.";
    default:
      return "Transcription did not finish. You can try again.";
  }
}

const KEY = "voice-memos";

export function useVoiceMemos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: [KEY, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voice_memos")
        .select("*")
        .neq("status", "discarded")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as VoiceMemo[];
    },
    // A memo being transcribed resolves on its own; poll gently while one is.
    refetchInterval: (q) =>
      (q.state.data as VoiceMemo[] | undefined)?.some((m) => m.status === "uploaded" || m.status === "transcribing")
        ? 5000
        : false,
  });

  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: [KEY] }), [qc]);

  useEffect(() => {
    window.addEventListener(VOICE_MEMOS_CHANGED, refresh);
    return () => window.removeEventListener(VOICE_MEMOS_CHANGED, refresh);
  }, [refresh]);

  const done = () => {
    refresh();
    notifyVoiceMemosChanged();
  };

  const retry = useMutation({ mutationFn: (id: string) => processMemo(id), onSettled: done });

  const discard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("voice_memos").update({ status: "discarded" }).eq("id", id);
      if (error) throw error;
    },
    onSettled: done,
  });

  /** Keep the transcript on its own: it stays in the inbox, audio follows the retention rule. */
  const keepTranscript = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("voice_memos")
        .update({ transcript_confirmed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: done,
  });

  const assign = useMutation({
    mutationFn: async (v: { id: string; patientUserId: string | null; practiceId?: string | null }) => {
      const { error } = await supabase.rpc("assign_voice_memo", {
        _memo_id: v.id,
        _patient_user_id: v.patientUserId as string,
        ...(v.practiceId ? { _practice_id: v.practiceId } : {}),
      });
      if (error) throw error;
    },
    onSettled: done,
  });

  return { ...query, memos: query.data ?? [], retry, discard, keepTranscript, assign };
}
