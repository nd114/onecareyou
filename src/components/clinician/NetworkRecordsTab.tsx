// Phase 4.2 — QHIN / Network Records tab (UI shell, wired to qhin_imports).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Network, Loader2, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  patientUserId: string;
}

export function NetworkRecordsTab({ patientUserId }: Props) {
  const { data: imports = [], isLoading } = useQuery({
    queryKey: ["qhin-imports", patientUserId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("qhin_imports")
        .select("*")
        .eq("user_id", patientUserId)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!patientUserId,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              Network Records
            </CardTitle>
            <CardDescription>
              Pull this patient's records from connected hospitals, clinics, and labs via the national health
              information network (QHIN).
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info("Network records request coming soon — your practice will be notified when Particle Health goes live for OneCare.")}
          >
            Request records
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : imports.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Network className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-60" />
            <p className="text-sm font-medium">No network records on file yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Once the QHIN integration is live, every record this patient has across the U.S. healthcare network
              will appear here — labs, imaging reports, discharge summaries, immunizations, and more.
            </p>
            <Badge variant="secondary" className="mt-3 text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Coming soon
            </Badge>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {imports.map((imp: any) => (
              <li key={imp.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{imp.scope || "Comprehensive record"}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(imp.created_at), "MMM d, yyyy 'at' HH:mm")}
                    {imp.match_count != null && ` • ${imp.match_count} matches`}
                    {imp.record_count != null && ` • ${imp.record_count} records`}
                  </p>
                </div>
                <Badge variant={imp.status === "completed" ? "default" : "secondary"} className="text-xs">
                  {imp.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
