import { useState } from "react";
import { format } from "date-fns";
import { Receipt, ChevronDown, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useInvoices } from "@/hooks/useInvoices";
import { balanceMinor, formatMoney, isOutstanding, isOverdue, toMinor } from "@/lib/fhir/invoice";
import { cn } from "@/lib/utils";

/**
 * The patient's own bills.
 *
 * The reason billing belongs in a patient-controlled product at all: a bill you
 * can only see by asking is the same asymmetry the rest of the platform exists
 * to remove. Every line is shown, not just the total — a total without a
 * breakdown is a demand rather than a bill, and the patient cannot query what
 * they cannot see.
 *
 * Built in our own components rather than lifted, so there is one design system
 * and this looks like the rest of the product.
 */
export function BillingSummary() {
  const { invoices, isLoading, outstandingByCurrency } = useInvoices();
  const [openId, setOpenId] = useState<string | null>(null);

  // Nothing billed is not a state worth a card.
  if (isLoading || invoices.length === 0) return null;

  const owed = Object.entries(outstandingByCurrency).filter(([, minor]) => minor > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          Bills and payments
        </CardTitle>
        {owed.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Outstanding:{" "}
            {owed.map(([currency, minor], i) => (
              <span key={currency} className="font-medium text-foreground">
                {i > 0 && " + "}
                {formatMoney(minor, currency)}
              </span>
            ))}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {invoices.map((invoice) => {
          const outstanding = isOutstanding(invoice);
          const overdue = isOverdue(invoice);
          const balance = balanceMinor(invoice);
          const partly = outstanding && toMinor(invoice.paid_minor) > 0;

          return (
            <Collapsible
              key={invoice.id}
              open={openId === invoice.id}
              onOpenChange={(open) => setOpenId(open ? invoice.id : null)}
            >
              <div
                className={cn(
                  "rounded-lg border p-3",
                  overdue && "border-severity-high/40 bg-severity-high/5",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {formatMoney(invoice.total_minor, invoice.currency)}
                      </span>
                      {overdue && (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <AlertCircle className="h-3 w-3" /> Overdue
                        </Badge>
                      )}
                      {!outstanding && invoice.status === "balanced" && (
                        <Badge className="text-[10px] bg-status-success/10 text-status-success border-status-success/20">
                          Paid
                        </Badge>
                      )}
                      {invoice.status === "cancelled" && (
                        <Badge variant="secondary" className="text-[10px]">Cancelled</Badge>
                      )}
                    </div>
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

                  {(invoice.items?.length ?? 0) > 0 && (
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="shrink-0 h-7 text-xs gap-1">
                        {openId === invoice.id ? "Hide" : "What is this for?"}
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 transition-transform",
                            openId === invoice.id && "rotate-180",
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                  )}
                </div>

                <CollapsibleContent>
                  <div className="mt-3 pt-3 border-t space-y-1.5">
                    {invoice.items?.map((item) => (
                      <div key={item.id} className="flex justify-between gap-3 text-sm">
                        <span className="text-muted-foreground min-w-0">
                          {item.description}
                          {Number(item.quantity) !== 1 && ` × ${item.quantity}`}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatMoney(item.amount_minor, invoice.currency)}
                        </span>
                      </div>
                    ))}
                    {invoice.note && (
                      <p className="text-xs text-muted-foreground pt-1">{invoice.note}</p>
                    )}
                    {/* Paying here is not built yet, and a button that does
                        nothing is worse than no button. See
                        docs/billing-and-payments.md. */}
                    {outstanding && (
                      <p className="text-xs text-muted-foreground pt-2">
                        To pay this bill, contact the practice that issued it.
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}
