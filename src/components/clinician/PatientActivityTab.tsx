// Phase 4.1 — Patient activity timeline tab.
import { Loader2, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { usePatientActionLog } from "@/hooks/usePatientActionLog";
import { formatDistanceToNow } from "date-fns";

export function PatientActivityTab({ patientUserId }: { patientUserId: string }) {
  const { entries, isLoading } = usePatientActionLog(patientUserId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" /> Activity
        </CardTitle>
        <CardDescription>Recent care actions on this patient</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No activity yet.</div>
        ) : (
          <ul className="divide-y">
            {entries.map((e) => (
              <li key={e.id} className="p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium capitalize">{e.action.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </span>
                </div>
                {e.summary && <div className="text-xs text-muted-foreground mt-1">{e.summary}</div>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
