import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtra } from '@/integrations/supabase/db';
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  balanceMinor,
  isOutstanding,
  toMinor,
  type InvoiceItemRow,
  type InvoiceRow,
} from "@/lib/fhir/invoice";

/**
 * Invoices, read under the reader's own row policies.
 *
 * A patient calling this gets their own issued invoices; a clinician gets those
 * for patients they can reach. Neither is decided here — the database decides,
 * as it does everywhere else. Drafts never reach a patient because the policy
 * excludes them, not because this hook filters.
 */
export function useInvoices(patientUserId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["fhir-invoices", patientUserId ?? "mine", user?.id];

  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async (): Promise<InvoiceRow[]> => {
      let q = supabaseExtra
        .from("fhir_invoices")
        .select("*, items:fhir_invoice_items(*)")
        .order("issued_at", { ascending: false, nullsFirst: false });

      if (patientUserId) q = q.eq("patient_user_id", patientUserId);

      const { data, error } = await q;
      if (error) throw error;

      return ((data ?? []) as InvoiceRow[]).map((row) => ({
        ...row,
        items: [...((row.items ?? []) as InvoiceItemRow[])].sort(
          (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
        ),
      }));
    },
  });

  const invoices = query.data ?? [];

  /**
   * What the patient owes across every outstanding invoice.
   *
   * Summed in minor units and only over invoices in one currency at a time —
   * adding naira to dollars produces a number that is wrong in a way nobody
   * notices until they try to pay it.
   */
  const outstandingByCurrency = invoices.filter(isOutstanding).reduce<Record<string, number>>(
    (acc, invoice) => {
      acc[invoice.currency] = (acc[invoice.currency] ?? 0) + balanceMinor(invoice);
      return acc;
    },
    {},
  );

  const recordPayment = useMutation({
    mutationFn: async ({ id, amountMinor }: { id: string; amountMinor: number }) => {
      const invoice = invoices.find((i) => i.id === id);
      if (!invoice) throw new Error("That invoice is no longer loaded");

      const paid = toMinor(invoice.paid_minor) + amountMinor;
      const total = toMinor(invoice.total_minor);
      if (paid > total) throw new Error("That is more than the invoice is for");

      const { error } = await supabaseExtra
        .from("fhir_invoices")
        .update({ paid_minor: paid, status: paid >= total ? "balanced" : invoice.status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Payment recorded");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record that payment"),
  });

  return {
    invoices,
    isLoading: query.isLoading,
    outstandingByCurrency,
    recordPayment,
  };
}
