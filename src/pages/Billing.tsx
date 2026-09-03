import { useState } from "react";
import { format } from "date-fns";
import { Receipt, AlertCircle, Download, FolderPlus, ChevronDown } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SaveToVaultDialog } from "@/components/documents/SaveToVaultDialog";
import { useInvoices } from "@/hooks/useInvoices";
import { balanceMinor, formatMoney, isOutstanding, isOverdue, toMinor, type InvoiceRow } from "@/lib/fhir/invoice";
import { downloadInvoicePdf, invoicePdfFile } from "@/lib/invoice-pdf";
import { cn } from "@/lib/utils";

/**
 * The patient's bills, in one place they can always get back to.
 *
 * Deliberately its own page rather than a card on the dashboard. A bill is not
 * something a patient should be met with on opening the app, and it is not
 * something that should vanish once paid either — this is where the whole
 * history lives, paid and unpaid, and the dashboard only raises a small notice
 * when something actually needs attention.
 *
 * Every invoice can be saved into the Vault as a document. Until then it is a
 * notification about a row in the practice's system; afterwards it is a record
 * the patient holds, which survives the share ending.
 */
export default function Billing() {
  const { invoices, isLoading, outstandingByCurrency } = useInvoices();
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState<InvoiceRow | null>(null);

  const owed = Object.entries(outstandingByCurrency).filter(([, minor]) => minor > 0);
  const outstanding = invoices.filter(isOutstanding);
  const settled = invoices.filter((i) => !isOutstanding(i));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <SectionTabs section="team" variant="patient" />

      <main className="container max-w-3xl py-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> Bills
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything a clinic you are connected to has billed you for. Save any of them to
            your Health Vault to keep your own copy.
          </p>
        </div>

        {owed.length > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Outstanding</p>
              <p className="text-2xl font-semibold">
                {owed.map(([currency, minor], i) => (
                  <span key={currency}>
                    {i > 0 && " + "}
                    {formatMoney(minor, currency)}
                  </span>
                ))}
              </p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : invoices.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-1">
              <p className="text-sm font-medium">No bills yet</p>
              <p className="text-sm text-muted-foreground">
                When a clinic or clinician you are connected to bills you, it will appear here
                with everything it is for.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {outstanding.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-medium text-muted-foreground">To pay</h2>
                {outstanding.map((invoice) => (
                  <InvoiceRowCard
                    key={invoice.id}
                    invoice={invoice}
                    open={openId === invoice.id}
                    onOpenChange={(o) => setOpenId(o ? invoice.id : null)}
                    onSave={() => setSaving(invoice)}
                  />
                ))}
              </section>
            )}

            {settled.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-medium text-muted-foreground">Settled</h2>
                {settled.map((invoice) => (
                  <InvoiceRowCard
                    key={invoice.id}
                    invoice={invoice}
                    open={openId === invoice.id}
                    onOpenChange={(o) => setOpenId(o ? invoice.id : null)}
                    onSave={() => setSaving(invoice)}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </main>

      {saving && (
        <SaveToVaultDialog
          open
          onOpenChange={(o) => !o && setSaving(null)}
          getFile={async () => invoicePdfFile(saving)}
          defaultTitle={`Invoice ${saving.invoice_number}`}
          defaultCategory="insurance"
          defaultTags={["bill"]}
          sourceContext="invoice"
        />
      )}
    </div>
  );
}

function InvoiceRowCard({
  invoice,
  open,
  onOpenChange,
  onSave,
}: {
  invoice: InvoiceRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  const overdue = isOverdue(invoice);
  const balance = balanceMinor(invoice);
  const partly = isOutstanding(invoice) && toMinor(invoice.paid_minor) > 0;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <Card className={cn(overdue && "border-severity-high/40 bg-severity-high/5")}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                {formatMoney(invoice.total_minor, invoice.currency)}
                {overdue && (
                  <Badge variant="destructive" className="text-[10px] gap-1">
                    <AlertCircle className="h-3 w-3" /> Overdue
                  </Badge>
                )}
                {invoice.status === "balanced" && (
                  <Badge className="text-[10px] bg-status-success/10 text-status-success border-status-success/20">
                    Paid
                  </Badge>
                )}
                {(invoice.status === "cancelled" || invoice.status === "entered-in-error") && (
                  <Badge variant="secondary" className="text-[10px]">Cancelled</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {invoice.invoice_number}
                {invoice.issued_at && ` · ${format(new Date(invoice.issued_at), "d MMM yyyy")}`}
              </p>
              {partly && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatMoney(invoice.paid_minor, invoice.currency)} paid ·{" "}
                  {formatMoney(balance, invoice.currency)} remaining
                </p>
              )}
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 shrink-0">
                {open ? "Hide" : "What is this for?"}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <div className="space-y-1.5 border-t pt-3">
              {(invoice.items ?? []).map((item) => (
                <div key={item.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {item.description}
                    {Number(item.quantity) !== 1 && ` × ${item.quantity}`}
                  </span>
                  <span className="tabular-nums shrink-0">
                    {formatMoney(item.amount_minor, invoice.currency)}
                  </span>
                </div>
              ))}
              {invoice.note && (
                <p className="text-xs text-muted-foreground pt-1">{invoice.note}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onSave}>
                <FolderPlus className="h-3.5 w-3.5" /> Save to my records
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => downloadInvoicePdf(invoice)}
              >
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            </div>

            {isOutstanding(invoice) && (
              <p className="text-xs text-muted-foreground">
                To pay this, contact the practice that issued it. Paying in the app is not
                available yet.
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
