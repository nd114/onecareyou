import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Receipt, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Badge } from '@/components/ui/badge';
import { Panel, PanelEmpty, PanelHeader, PanelRow, PanelRows } from '@/components/ui/panel';
import { useInvoices } from '@/hooks/useInvoices';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { balanceMinor, formatMoney, isOverdue } from '@/lib/fhir/invoice';
import {
  filterInvoices,
  invoiceTotals,
  type InvoiceFilter,
} from '@/lib/practice-invoices';
import { formatDay } from '@/lib/format-date';
import { cn } from '@/lib/utils';

const FILTERS: { value: InvoiceFilter; label: string }[] = [
  { value: 'outstanding', label: 'Owed' },
  { value: 'overdue', label: 'Late' },
  { value: 'paid', label: 'Settled' },
  { value: 'draft', label: 'Drafts' },
  { value: 'all', label: 'Everything' },
];

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  balanced: 'Paid',
  cancelled: 'Cancelled',
  'entered-in-error': 'Voided',
};

/**
 * The practice ledger.
 *
 * Billing was a tab inside one patient, so "who owes us what" meant opening
 * every patient in turn. Same invoice rows, same policies, read across people.
 *
 * Read-only, like the schedule: an invoice is raised and settled beside the
 * patient it belongs to, where the encounter that produced it is. This answers
 * the question the per-patient tab cannot.
 */
const ClinicianInvoices = () => {
  const { isClinician, isLoading: loadingProfile } = useClinicianProfile();
  const { invoices, isLoading } = useInvoices();
  const { patients } = useClinicianPatients();
  const [filter, setFilter] = useState<InvoiceFilter>('outstanding');

  const byUserId = useMemo(() => {
    const map = new Map<string, { name: string; inviteCode: string | null }>();
    for (const p of patients) {
      if (!p.user_id) continue;
      map.set(p.user_id, {
        name: p.patient_name || p.patient_email || 'Patient',
        inviteCode: p.invite_code ?? null,
      });
    }
    return map;
  }, [patients]);

  const totals = useMemo(() => invoiceTotals(invoices), [invoices]);
  const shown = useMemo(() => filterInvoices(invoices, filter), [invoices, filter]);

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-muted/30">
        <ClinicianHeader />
        <main className="container py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!isClinician) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <ClinicianHeader />
      <SectionTabs section="practice" variant="clinician" />

      <main className="container px-4 sm:px-6 py-6 sm:py-8 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6 flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">Invoices</h1>
              <p className="text-muted-foreground text-sm">
                Every bill across your patients, and what is still owed.
              </p>
            </div>
          </div>

          {/* One set of figures per currency. Adding two currencies together
              gives a number that is wrong in both. */}
          {totals.map((t) => (
            <div key={t.currency} className="mb-4 grid grid-cols-3 gap-3">
              {[
                { label: `Billed (${t.currency})`, value: t.billedMinor },
                { label: 'Still owed', value: t.outstandingMinor },
                { label: 'Late', value: t.overdueMinor },
              ].map((cell, i) => (
                <div key={cell.label} className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{cell.label}</p>
                  <p
                    className={cn(
                      'text-lg sm:text-xl font-bold tabular-nums',
                      i === 2 && cell.value > 0 && 'text-severity-high',
                    )}
                  >
                    {formatMoney(cell.value, t.currency)}
                  </p>
                </div>
              ))}
            </div>
          ))}

          <div className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  filter === f.value
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Panel>
            <PanelHeader
              eyebrow="Ledger"
              description={`${shown.length} invoice${shown.length === 1 ? '' : 's'}`}
            />
            {isLoading ? (
              <PanelEmpty className="py-12">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
              </PanelEmpty>
            ) : shown.length === 0 ? (
              <PanelEmpty className="py-12">
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-muted">
                  <Receipt className="h-7 w-7 text-muted-foreground" />
                </span>
                <p className="font-display text-lg leading-snug text-foreground">
                  {filter === 'all' ? 'No invoices yet' : 'Nothing in this view'}
                </p>
                <p className="mx-auto mt-2 max-w-sm">
                  Invoices are raised from a patient's own page, on their Billing tab.
                </p>
              </PanelEmpty>
            ) : (
              <PanelRows>
                {shown.map((invoice) => {
                  const known = byUserId.get(invoice.patient_user_id);
                  const balance = balanceMinor(invoice);
                  const late = isOverdue(invoice);
                  return (
                    <PanelRow
                      key={invoice.id}
                      overline={invoice.invoice_number}
                      label={known?.name ?? 'Patient'}
                      detail={
                        invoice.issued_at
                          ? `Issued ${formatDay(invoice.issued_at)}`
                          : 'Not issued yet'
                      }
                      trailing={
                        <span className="flex items-center gap-2 sm:gap-3">
                          <span className="text-right">
                            <span className="block text-sm font-semibold tabular-nums">
                              {formatMoney(invoice.total_minor, invoice.currency)}
                            </span>
                            {balance > 0 && (
                              <span
                                className={cn(
                                  'block text-[11px] tabular-nums',
                                  late ? 'text-severity-high' : 'text-muted-foreground',
                                )}
                              >
                                {formatMoney(balance, invoice.currency)} owed
                              </span>
                            )}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] sm:text-xs',
                              late && 'border-severity-high/30 bg-severity-high/10 text-severity-high',
                            )}
                          >
                            {late ? 'Late' : STATUS_LABEL[invoice.status] ?? invoice.status}
                          </Badge>
                        </span>
                      }
                    >
                      <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        {invoice.due_at && <span>Due {formatDay(invoice.due_at)}</span>}
                        {known?.inviteCode && (
                          <Link
                            to={`/clinician/patients/${known.inviteCode}`}
                            className="flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                          >
                            <User className="h-3 w-3 shrink-0" />
                            Open {known.name}
                          </Link>
                        )}
                      </span>
                    </PanelRow>
                  );
                })}
              </PanelRows>
            )}
          </Panel>
        </motion.div>
      </main>
    </div>
  );
};

export default ClinicianInvoices;
