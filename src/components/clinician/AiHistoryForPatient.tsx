import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Sparkles, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtra } from '@/integrations/supabase/db';
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toFhirCommunicationBundle, type AiMessageRow } from "@/lib/fhir/communication";

/**
 * What this clinician asked the assistant about this patient.
 *
 * Previously these sat in a chat table with no patient reference at all — a
 * conversation about somebody's care in a side channel, not exportable with
 * their record and not reviewable next to the notes it informed.
 *
 * Scoped to the caller on purpose: a clinician's working questions are theirs,
 * and one clinician reading another's is a different feature needing a
 * different conversation about consent. The function enforces that; this only
 * displays what it returns.
 */
export function AiHistoryForPatient({
  patientUserId,
  patientName,
}: {
  patientUserId: string;
  patientName: string;
}) {
  const { user } = useAuth();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["ai-messages-about", patientUserId, user?.id],
    enabled: !!user && !!patientUserId,
    queryFn: async (): Promise<AiMessageRow[]> => {
      const { data, error } = await supabaseExtra.rpc("ai_messages_about_patient", {
        _patient_user_id: patientUserId,
      });
      if (error) throw error;
      return (data ?? []) as AiMessageRow[];
    },
  });

  // Nothing asked is not a state worth a card.
  if (isLoading || messages.length === 0) return null;

  const exportBundle = () => {
    const bundle = toFhirCommunicationBundle(
      messages.map((m) => ({ ...m, patient_user_id: patientUserId, user_id: user?.id ?? "" })),
    );
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `assistant-notes-${format(new Date(), "yyyy-MM-dd")}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              What you asked the assistant
            </CardTitle>
            <CardDescription>
              Your own questions about {patientName}, and the answers. Only you see these.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportBundle}>
            <Download className="h-3.5 w-3.5" /> Export as FHIR
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <p className="text-xs text-muted-foreground">
              {m.role === "assistant" ? "Assistant" : "You"} ·{" "}
              {format(new Date(m.created_at), "d MMM yyyy, h:mm a")}
            </p>
            <p className="whitespace-pre-wrap mt-0.5">{m.content}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
