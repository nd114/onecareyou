// Phase 3.4 — Practice owner reports / KPI dashboard.
import { useQuery } from "@tanstack/react-query";
import { Activity, Users, Bell, MessageSquare, FileText, TrendingUp, Loader2 } from "lucide-react";
import { ClinicianHeader } from "@/components/clinician/ClinicianHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/seo/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useClinicianCapabilities } from "@/hooks/useClinicianCapabilities";
import { Navigate, Link } from "react-router-dom";
import { Download } from "lucide-react";

interface Stats {
  patientCount: number;
  activeAlertRules: number;
  unhandledAlerts: number;
  guidanceSent7d: number;
  guidanceAckRate: number;
  encounters30d: number;
  signedEncounters30d: number;
  messageThreads7d: number;
}

function useOwnerReports() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["owner-reports", user?.id],
    queryFn: async (): Promise<Stats> => {
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const sb = supabase as any;

      const [
        patientCount,
        activeAlertRules,
        unhandledAlerts,
        guidanceSent7d,
        guidance,
        encounters30d,
        signedEncounters30d,
        messageThreads7d,
      ] = await Promise.all([
        sb.from("provider_shares").select("id", { count: "exact", head: true }).eq("is_active", true),
        sb.from("clinician_alert_rules").select("id", { count: "exact", head: true }).eq("is_active", true),
        sb.from("alert_logs").select("id", { count: "exact", head: true }).eq("acknowledged", false),
        sb.from("clinician_guidance").select("id", { count: "exact", head: true }).gte("created_at", since7),
        sb.from("clinician_guidance").select("status").gte("created_at", since30),
        sb.from("encounters").select("id", { count: "exact", head: true }).gte("created_at", since30),
        sb.from("encounters").select("id", { count: "exact", head: true }).eq("status", "signed").gte("created_at", since30),
        sb.from("messages").select("id", { count: "exact", head: true }).gte("created_at", since7),
      ]);

      const guidanceRows: any[] = (guidance as any).data ?? [];
      const acked = guidanceRows.filter((g) => g.status === "acknowledged" || g.status === "completed").length;
      const ackRate = guidanceRows.length > 0 ? Math.round((acked / guidanceRows.length) * 100) : 0;

      return {
        patientCount: (patientCount as any).count ?? 0,
        activeAlertRules: (activeAlertRules as any).count ?? 0,
        unhandledAlerts: (unhandledAlerts as any).count ?? 0,
        guidanceSent7d: (guidanceSent7d as any).count ?? 0,
        guidanceAckRate: ackRate,
        encounters30d: (encounters30d as any).count ?? 0,
        signedEncounters30d: (signedEncounters30d as any).count ?? 0,
        messageThreads7d: (messageThreads7d as any).count ?? 0,
      };
    },
    enabled: !!user,
  });
}

const Tile = ({ icon: Icon, label, value, hint, tone = "primary" }: any) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="font-display text-3xl font-bold mt-1">{value}</p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
        <div className={`h-9 w-9 rounded-lg bg-${tone}/10 flex items-center justify-center`}>
          <Icon className={`h-4 w-4 text-${tone}`} />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function ClinicianReports() {
  const { can, loading: capsLoading } = useClinicianCapabilities();
  const { data, isLoading } = useOwnerReports();

  if (capsLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <ClinicianHeader />
        <SectionTabs section="practice" variant="clinician" />
        <main className="container py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></main>
      </div>
    );
  }
  if (!can("manage_team") && !can("view_audit")) return <Navigate to="/clinician/today" replace />;

  return (
    <div className="min-h-screen bg-muted/30">
      <SEOHead title="Practice Reports — OneCare" description="Operational KPIs for your practice." noIndex />
      <ClinicianHeader />
      <SectionTabs section="practice" variant="clinician" />
      <main className="container py-6 sm:py-10 px-4 sm:px-6 max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">Practice Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">Snapshot of activity across your practice.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/clinician/audit"><Download className="h-4 w-4 mr-1" /> Audit & exports</Link>
          </Button>
        </div>

        {isLoading || !data ? (
          <div className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Tile icon={Users} label="Active patients" value={data.patientCount} hint="With active share" />
              <Tile icon={Bell} label="Open alerts" value={data.unhandledAlerts} hint={`${data.activeAlertRules} rules active`} tone="amber-500" />
              <Tile icon={FileText} label="Encounters (30d)" value={data.encounters30d} hint={`${data.signedEncounters30d} signed`} />
              <Tile icon={MessageSquare} label="Messages (7d)" value={data.messageThreads7d} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Guidance engagement
                </CardTitle>
                <CardDescription>How patients respond to your catch-up reminders.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Sent (last 7d)</p>
                    <p className="font-display text-2xl font-bold">{data.guidanceSent7d}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ack rate (30d)</p>
                    <p className="font-display text-2xl font-bold flex items-center gap-2">
                      {data.guidanceAckRate}%
                      <Badge variant={data.guidanceAckRate >= 70 ? "default" : "secondary"} className="text-xs">
                        {data.guidanceAckRate >= 70 ? "Healthy" : "Watch"}
                      </Badge>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
