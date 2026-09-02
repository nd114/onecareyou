import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Receipt, Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useInvoices } from "@/hooks/useInvoices";
import {
  balanceMinor, DEFAULT_CURRENCY, formatMoney, isOutstanding, lineAmountMinor,
  minorUnitDigits, toMinorUnits, type CurrencyCode,
} from "@/lib/fhir/invoice";

interface Props {
  patientUserId: string;
  patientName: string;
  practiceId?: string | null;
}

interface DraftLine {
  description: string;
  quantity: string;
  /** Major units as typed. Converted to minor exactly once, on save. */
  unitPrice: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  balanced: "Paid",
  cancelled: "Cancelled",
  "entered-in-error": "Entered in error",
};

/**
 * Billing for one patient.
 *
 * A bill raised here is visible to the patient as soon as it is issued — the
 * row policy shows them their own issued invoices without anyone sending
 * anything. Drafts stay with the practice, because a patient watching a number
 * change while it is still being worked out cannot usefully ask about any
 * version of it.
 */
export function BillingTab({ patientUserId, patientName, practiceId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { invoices, isLoading } = useInvoices(patientUserId);

  // The tenant's currency, not the platform's guess at one. An invoice already
  // issued keeps whatever it was raised in, which is why this only seeds new ones.
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  useEffect(() => {
    if (!practiceId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("practices")
        .select("default_currency")
        .eq("id", practiceId)
        .maybeSingle();
      if (!cancelled && data?.default_currency) {
        setCurrency(data.default_currency as CurrencyCode);
      }
    })();
    return () => { cancelled = true; };
  }, [practiceId]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { description: "", quantity: "1", unitPrice: "" },
  ]);

  const totalMinor = lines.reduce((sum, line) => {
    const qty = Number(line.quantity);
    const major = Number(line.unitPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(major)) return sum;
    return sum + lineAmountMinor(qty, toMinorUnits(major, currency));
  }, 0);

  const usable = lines.filter((l) => l.description.trim() && Number(l.unitPrice) > 0);

  const reset = () => {
    setLines([{ description: "", quantity: "1", unitPrice: "" }]);
    setNote("");
    setDueDate("");
  };

  const issue = async () => {
    if (!user || usable.length === 0) return;
    setSaving(true);
    try {
      const { data: invoice, error } = await (supabase as any)
        .from("fhir_invoices")
        .insert({
          patient_user_id: patientUserId,
          practice_id: practiceId ?? null,
          created_by: user.id,
          status: "draft",
          currency,
          note: note.trim() || null,
          due_at: dueDate ? new Date(dueDate).toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: itemError } = await (supabase as any).from("fhir_invoice_items").insert(
        usable.map((line, index) => {
          const unit = toMinorUnits(Number(line.unitPrice), currency);
          const qty = Number(line.quantity) || 1;
          return {
            invoice_id: invoice.id,
            sequence: index + 1,
            description: line.description.trim(),
            quantity: qty,
            unit_price_minor: unit,
            amount_minor: lineAmountMinor(qty, unit),
          };
        }),
      );
      if (itemError) throw itemError;

      // Issued last, deliberately: the total is recalculated by the database
      // while the invoice is still a draft, and issuing freezes it. Doing it in
      // the other order would issue a bill for zero.
      const { error: issueError } = await (supabase as any)
        .from("fhir_invoices")
        .update({ status: "issued", issued_at: new Date().toISOString() })
        .eq("id", invoice.id);
      if (issueError) throw issueError;

      qc.invalidateQueries({ queryKey: ["fhir-invoices"] });
      toast.success(`Invoice issued to ${patientName}`);
      setOpen(false);
      reset();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not issue that invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" /> Billing
          </h3>
          <p className="text-sm text-muted-foreground">
            An issued invoice appears on {patientName}'s dashboard straight away.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> New invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New invoice</DialogTitle>
              <DialogDescription>
                {patientName} sees this, with every line, as soon as it is issued.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6 space-y-1">
                    {index === 0 && <Label className="text-xs">Description</Label>}
                    <Input
                      value={line.description}
                      placeholder="Consultation"
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, description: e.target.value } : l)),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {index === 0 && <Label className="text-xs">Qty</Label>}
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    {index === 0 && <Label className="text-xs">Price ({currency})</Label>}
                    <Input
                      type="number"
                      min="0"
                      step={minorUnitDigits(currency) === 0 ? "1" : `0.${"0".repeat(minorUnitDigits(currency) - 1)}1`}
                      value={line.unitPrice}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, unitPrice: e.target.value } : l)),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-1">
                    {lines.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() =>
                  setLines((prev) => [...prev, { description: "", quantity: "1", unitPrice: "" }])
                }
              >
                <Plus className="h-3 w-3" /> Add line
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Due date (optional)</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Note (optional)</Label>
                  <Input
                    value={note}
                    placeholder="Seen for follow-up"
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-between border-t pt-3 font-medium">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(totalMinor, currency)}</span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={issue} disabled={usable.length === 0 || saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Issue invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No invoices for {patientName} yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {invoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      {formatMoney(invoice.total_minor, invoice.currency)}
                      <Badge variant="secondary" className="text-[10px]">
                        {STATUS_LABEL[invoice.status] ?? invoice.status}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {invoice.invoice_number}
                      {invoice.issued_at &&
                        ` · issued ${format(new Date(invoice.issued_at), "d MMM yyyy")}`}
                    </CardDescription>
                  </div>
                  {isOutstanding(invoice) && (
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatMoney(balanceMinor(invoice), invoice.currency)} outstanding
                    </span>
                  )}
                </div>
              </CardHeader>
              {(invoice.items?.length ?? 0) > 0 && (
                <CardContent className="pt-0 space-y-1">
                  {invoice.items?.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm gap-3">
                      <span className="text-muted-foreground">
                        {item.description}
                        {Number(item.quantity) !== 1 && ` × ${item.quantity}`}
                      </span>
                      <span className="tabular-nums shrink-0">
                        {formatMoney(item.amount_minor, invoice.currency)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
