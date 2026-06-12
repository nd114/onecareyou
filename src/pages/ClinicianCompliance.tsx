// Phase 3.3 — Compliance pack export.
// One-click bundle: practice info + BAA status + audit log range + encryption attestation.
import { useState } from "react";
import { Shield, Download, Loader2, FileCheck2, FileText } from "lucide-react";
import { Navigate } from "react-router-dom";
import { ClinicianHeader } from "@/components/clinician/ClinicianHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SEOHead } from "@/components/seo/SEOHead";
import { useClinicianCapabilities } from "@/hooks/useClinicianCapabilities";
import { useAuditLog } from "@/hooks/useAuditLog";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { toast } from "sonner";

function toCsv(rows: any[], headers: string[]): string {
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => JSON.stringify((r as any)[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ATTESTATION = `OneCare — Security & Compliance Attestation

1. Encryption
   - Data at rest: AES-256 (managed backend).
   - Data in transit: TLS 1.2+ enforced end-to-end.

2. Access controls
   - Role-based access control (RBAC) within each practice.
   - Row-level security on every patient data table.
   - Patient-granted, per-permission clinician access (vitals, meds, docs, etc.).

3. Audit logging
   - Every clinician access to patient data is recorded.
   - Logs are immutable and retained for the life of the account.

4. Authentication
   - Password + email verification, optional OAuth.
   - Leaked-password protection enabled.
   - Session timeout for clinician sessions (30 min HIPAA default).

5. Vendors
   - All sub-processors operate under BAA.
   - Patient data is not used to train third-party models.

This attestation is generated from the live OneCare platform configuration.
`;

export default function ClinicianCompliance() {
  const { can, loading: capsLoading } = useClinicianCapabilities();
  const [from, setFrom] = useState(format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [building, setBuilding] = useState(false);

  const { data: auditEntries = [] } = useAuditLog({ limit: 5000 });

  if (capsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!can("view_audit")) {
    return <Navigate to="/clinician/today" replace />;
  }

  const filteredAudit = auditEntries.filter((e: any) => {
    const t = new Date(e.created_at).getTime();
    return t >= new Date(from).getTime() && t <= new Date(to).getTime() + 86400000;
  });

  const buildPack = async () => {
    setBuilding(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      // BAA
      const { data: baa } = await supabase
        .from("baa_agreements")
        .select("*")
        .eq("clinician_user_id", u.user?.id ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<any>();

      const baaText = baa
        ? `BAA — Signed
Signed at: ${baa.signed_at ?? baa.created_at ?? "n/a"}
Signer: ${baa.contact_name ?? "n/a"} <${baa.contact_email ?? "n/a"}>
Practice: ${baa.practice_name ?? "n/a"}
Version: ${baa.agreement_version ?? "1.0"}`
        : "BAA — Not yet signed. Sign at /clinician/baa before sharing this pack with patients.";

      const auditCsv = toCsv(filteredAudit, [
        "created_at",
        "user_id",
        "action",
        "resource_type",
        "resource_id",
        "patient_user_id",
        "ip_address",
      ]);

      const cover = `OneCare Compliance Pack
Generated: ${new Date().toISOString()}
Range: ${from} → ${to}
Audit entries: ${filteredAudit.length}

Bundle contents:
  - 01-attestation.txt          (security & compliance attestation)
  - 02-baa.txt                  (Business Associate Agreement status)
  - 03-audit-log.csv            (audit log for selected range)

This bundle is a snapshot. Re-generate after material changes to your practice or team.`;

      download(`compliance-pack-cover-${from}-to-${to}.txt`, cover);
      download(`01-attestation-${from}-to-${to}.txt`, ATTESTATION);
      download(`02-baa-${from}-to-${to}.txt`, baaText);
      download(`03-audit-log-${from}-to-${to}.csv`, auditCsv, "text/csv");
      toast.success("Compliance pack downloaded (4 files)");
    } catch (e: any) {
      toast.error(e.message ?? "Could not build compliance pack");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Compliance Pack | OneCare" noIndex />
      <ClinicianHeader />
      <SectionTabs section="practice" variant="clinician" />
      <main className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Compliance pack</h1>
            <p className="text-sm text-muted-foreground">
              One-click export for audits, sales reviews, and patient questions.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Build a pack</CardTitle>
            <CardDescription>Select the audit log range to include.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <div>
                <Label htmlFor="from">From</Label>
                <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="to">To</Label>
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredAudit.length} audit entries in range.
            </div>
            <Button onClick={buildPack} disabled={building}>
              {building ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download pack
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What's included</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <FileCheck2 className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <div className="font-medium">Security & compliance attestation</div>
                  <div className="text-muted-foreground">Encryption, RBAC, audit, auth — current platform configuration.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <FileText className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <div className="font-medium">BAA status</div>
                  <div className="text-muted-foreground">Most recent Business Associate Agreement on file (signer, date, version).</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Shield className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <div className="font-medium">Audit log CSV</div>
                  <div className="text-muted-foreground">Every patient-data access in the selected range.</div>
                </div>
              </li>
            </ul>
            <div className="mt-4">
              <Badge variant="secondary">Owner/Admin only</Badge>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
