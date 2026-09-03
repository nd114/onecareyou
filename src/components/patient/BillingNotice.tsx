import { Link } from "react-router-dom";
import { Receipt, AlertCircle, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useInvoices } from "@/hooks/useInvoices";
import { formatMoney, isOutstanding, isOverdue } from "@/lib/fhir/invoice";
import { cn } from "@/lib/utils";

/**
 * A line about money owed, and only when there is some.
 *
 * This replaced a full billing card on the dashboard. A bill is not what a
 * patient should be met with on opening a health app, and a list of settled
 * invoices is not news — so the dashboard carries a notice when something needs
 * attention and nothing at all otherwise. The bills themselves live at
 * /billing, under Care Team, where they stay findable after they are paid.
 *
 * The same shape suits anything else billing grows into later: a payment
 * receipt, a plan renewal, an insurance response. A notice points at the place
 * that holds the detail; it does not try to be the place.
 */
export function BillingNotice() {
  const { invoices, isLoading, outstandingByCurrency } = useInvoices();

  const owed = Object.entries(outstandingByCurrency).filter(([, minor]) => minor > 0);
  // Wrapped, not passed by reference: Array.some hands the callback an index as
  // its second argument, which isOverdue takes as `now`. That silently compared
  // due dates against 1970 and nothing was ever overdue. The compiler caught it.
  const overdue = invoices.some((i) => isOverdue(i));
  const count = invoices.filter(isOutstanding).length;

  if (isLoading || owed.length === 0) return null;

  return (
    <Card className={cn(overdue && "border-severity-high/40 bg-severity-high/5")}>
      <CardContent className="py-3">
        <Link to="/billing" className="flex items-center gap-3 group">
          {overdue ? (
            <AlertCircle className="h-4 w-4 text-severity-high shrink-0" />
          ) : (
            <Receipt className="h-4 w-4 text-primary shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">
                {owed.map(([currency, minor], i) => (
                  <span key={currency}>
                    {i > 0 && " + "}
                    {formatMoney(minor, currency)}
                  </span>
                ))}
              </span>{" "}
              <span className="text-muted-foreground">
                {overdue ? "overdue" : "to pay"} on {count} {count === 1 ? "bill" : "bills"}
              </span>
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </CardContent>
    </Card>
  );
}
