// Phase 3.2 — Practice audit & access viewer (owner/admin only).
import { useMemo, useState } from "react";
import { Shield, Download, Loader2, Search } from "lucide-react";
import { ClinicianHeader } from "@/components/clinician/ClinicianHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useClinicianCapabilities } from "@/hooks/useClinicianCapabilities";
import { SEOHead } from "@/components/seo/SEOHead";
import { format } from "date-fns";
import { Navigate } from "react-router-dom";

function toCsv(rows: any[]): string {
  if (rows.length === 0) return "";
  const headers = ["created_at", "user_id", "action", "resource_type", "resource_id", "patient_user_id", "ip_address"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => JSON.stringify((r as any)[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

export default function ClinicianAudit() {
  const { can, loading: capsLoading } = useClinicianCapabilities();
  const { data: entries = [], isLoading } = useAuditLog({ limit: 500 });
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.resource_type.toLowerCase().includes(q) ||
        (e.resource_id ?? "").toLowerCase().includes(q) ||
        (e.patient_user_id ?? "").toLowerCase().includes(q),
    );
  }, [entries, query]);

  const exportCsv = () => {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (capsLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <ClinicianHeader />
        <SectionTabs section="practice" variant="clinician" />
        <main className="container py-10 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!can("view_audit")) {
    return <Navigate to="/clinician/today" replace />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <SEOHead title="Audit & Access Log — OneCare" description="HIPAA-grade access timeline for your practice." noIndex />
      <ClinicianHeader />
      <SectionTabs section="practice" variant="clinician" />
      <main className="container py-6 sm:py-10 px-4 sm:px-6 max-w-6xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">Audit & Access</h1>
            <p className="text-sm text-muted-foreground">Who touched what, and when. Exportable for compliance reviews.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Recent activity</CardTitle>
                <CardDescription>Last 500 events</CardDescription>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter action, resource, patient…"
                    className="pl-8 w-full sm:w-72"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
                  <Download className="h-4 w-4 mr-1" />
                  CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No audit events match your filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left py-2 pr-3">When</th>
                      <th className="text-left py-2 pr-3">Action</th>
                      <th className="text-left py-2 pr-3">Resource</th>
                      <th className="text-left py-2 pr-3">Patient</th>
                      <th className="text-left py-2 pr-3">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => (
                      <tr key={e.id} className="border-b border-border/50 hover:bg-muted/40">
                        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                          {format(new Date(e.created_at), "MMM d, HH:mm")}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className="text-xs">{e.action}</Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-mono text-xs">{e.resource_type}</span>
                          {e.resource_id && <span className="text-xs text-muted-foreground"> / {e.resource_id.slice(0, 8)}…</span>}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                          {e.patient_user_id ? `${e.patient_user_id.slice(0, 8)}…` : "—"}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{e.ip_address ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
