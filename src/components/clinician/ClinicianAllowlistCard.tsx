import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Check, Loader2, ShieldCheck, Upload, UserMinus, X } from "lucide-react";
import { usePractice } from "@/hooks/usePractice";
import { usePracticeTenant } from "@/hooks/usePracticeTenant";
import { useClinicianAllowlist } from "@/hooks/useClinicianAllowlist";
import { parseStaffCsv } from "@/lib/staff-csv";

/**
 * How a hospital says who its clinicians are: an approved email domain, an
 * explicit allowlist, or a human decision on anyone else. Anybody who matches
 * nothing waits in pending approval with no access at all.
 */
export const ClinicianAllowlistCard = () => {
  const { currentPractice, currentMembership } = usePractice();
  const { tenant } = usePracticeTenant(currentPractice?.id);
  const {
    allowlist,
    pending,
    isLoading,
    addEntries,
    isAdding,
    removeEntry,
    setStatus,
    domains,
    saveDomains,
    isSavingDomains,
  } = useClinicianAllowlist(currentPractice?.id);

  const [domainInput, setDomainInput] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);

  const isChiefAdmin = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  if (!currentPractice || !isChiefAdmin) return null;
  if ((tenant?.tenant_type ?? "practice") !== "hospital") return null;

  const domainValue = domainInput ?? domains.join(", ");

  const handleCsv = async () => {
    const { entries, skipped } = parseStaffCsv(csv);
    if (entries.length === 0) return;
    await addEntries(entries);
    setCsv("");
    setCsvOpen(false);
    if (skipped > 0) {
      // Surfaced rather than silently dropped: a hospital pasting 200 rows
      // needs to know 3 of them had no usable email.
      console.warn(`[allowlist] ${skipped} row(s) skipped: no valid email`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Staff recognition
            </CardTitle>
            <CardDescription>
              Decide who counts as your clinician. Anyone who matches an approved domain or your staff list is
              affiliated straight away; anyone else waits here for your approval.
            </CardDescription>
          </div>
          {pending.length > 0 && <Badge variant="destructive">{pending.length} waiting</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Approved domains */}
        <div className="space-y-2">
          <Label htmlFor="allowed-domains">Approved email domains</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="allowed-domains"
              placeholder="lmc.org, lmc-hospital.ng"
              value={domainValue}
              onChange={(e) => setDomainInput(e.target.value)}
              className="sm:flex-1"
            />
            <Button
              variant="outline"
              disabled={isSavingDomains || domainInput === null}
              onClick={async () => {
                await saveDomains(domainValue);
                setDomainInput(null);
              }}
            >
              {isSavingDomains && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Staff with an email at these domains are recognised automatically. Leave empty to approve everyone by hand.
          </p>
        </div>

        {/* Pending approvals */}
        {pending.length > 0 && (
          <div className="space-y-2">
            <Label>Waiting for approval</Label>
            <div className="divide-y rounded-lg border">
              {pending.map((p) => (
                <div key={p.user_id} className="flex flex-wrap items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name || p.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatus({ userId: p.user_id, status: "active" })}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus({ userId: p.user_id, status: "rejected" })}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Allowlist + bulk import */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Staff list ({allowlist.length})</Label>
            <Button variant="outline" size="sm" onClick={() => setCsvOpen((v) => !v)}>
              <Upload className="h-4 w-4 mr-1" />
              Import CSV
            </Button>
          </div>

          {csvOpen && (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <Textarea
                rows={5}
                placeholder={"email,name,role\n jane@lmc.org,Dr Jane Evans,clinician\njohn@lmc.org,Nurse John,nurse"}
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                className="font-mono text-xs"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Paste your staff export. A header row is optional; email is the only column that matters. Existing
                  accounts keep their profile — this only tags the affiliation.
                </p>
                <Button size="sm" onClick={handleCsv} disabled={!csv.trim() || isAdding}>
                  {isAdding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Import
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : allowlist.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">
              No staff list yet. Import a CSV, or rely on an approved domain above.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allowlist.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2 pr-1 text-xs"
                >
                  {a.full_name || a.email}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted"
                    aria-label={`Remove ${a.email} from the staff list`}
                    onClick={() => removeEntry(a.id)}
                  >
                    <UserMinus className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Removing someone from this list does not end an affiliation they already hold — use the team list to offboard.
          Offboarding ends their access to your patients immediately and keeps everything they wrote, attributed to
          them.
        </p>
      </CardContent>
    </Card>
  );
};
