import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Activity, Pill, CalendarClock, Receipt, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VITAL_CONFIG, type VitalType } from "@/types/health";
import { describeReadingStatus } from "@/lib/patient-risk";
import { formatMoney, balanceMinor, type InvoiceRow } from "@/lib/fhir/invoice";
import type { RecordQuery } from "@/lib/ai-record-query";
import { cn } from "@/lib/utils";

/**
 * Records the assistant asked to show, fetched here rather than in the prompt.
 *
 * The assistant returns a query; this runs it. Which means the rows come back
 * through the ordinary Supabase client under the signed-in user's row policies —
 * if the assistant names a patient the clinician cannot reach, the query returns
 * nothing and that is the whole enforcement. The model never held the data.
 *
 * It also means what is shown is current at the moment of asking rather than at
 * whatever point a prompt was assembled.
 */

interface Props {
  query: RecordQuery;
  patientUserId: string;
  patientName?: string;
}

export function RecordCards({ query, patientUserId, patientName }: Props) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);

    (async () => {
      try {
        const data = await fetchRecords(query, patientUserId);
        if (!cancelled) setRows(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Could not load those records");
      }
    })();

    return () => { cancelled = true; };
  }, [query, patientUserId]);

  if (error) {
    return <p className="mt-3 text-sm text-muted-foreground">{error}</p>;
  }

  if (rows === null) {
    return (
      <p className="mt-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading records…
      </p>
    );
  }

  if (rows.length === 0) {
    // Distinguishable from an error on purpose: "none recorded" is an answer.
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No {LABEL[query.kind]} recorded{patientName ? ` for ${patientName}` : ""}.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {ICON[query.kind]}
        <span className="uppercase tracking-wide font-medium">
          {rows.length} {LABEL[query.kind]}
          {patientName ? ` · ${patientName}` : ""}
        </span>
      </div>

      {rows.map((row, i) => (
        <RecordRow key={row.id ?? i} kind={query.kind} row={row} />
      ))}

      {patientUserId && (
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1">
          <Link to={`/clinician/patients/${patientUserId}`}>
            Open full record <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      )}
    </div>
  );
}

const LABEL: Record<RecordQuery["kind"], string> = {
  vitals: "readings",
  medications: "medications",
  appointments: "appointments",
  invoices: "invoices",
};

const ICON: Record<RecordQuery["kind"], JSX.Element> = {
  vitals: <Activity className="h-3.5 w-3.5" />,
  medications: <Pill className="h-3.5 w-3.5" />,
  appointments: <CalendarClock className="h-3.5 w-3.5" />,
  invoices: <Receipt className="h-3.5 w-3.5" />,
};

async function fetchRecords(query: RecordQuery, patientUserId: string): Promise<any[]> {
  const client = supabase as any;

  if (query.kind === "vitals") {
    let q = client
      .from("vitals")
      .select("*")
      .eq("user_id", patientUserId)
      .order("recorded_at", { ascending: false })
      .limit(query.limit);
    if (query.vitalType) q = q.eq("type", query.vitalType);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  if (query.kind === "medications") {
    const { data, error } = await client
      .from("medications")
      .select("*")
      .eq("user_id", patientUserId)
      .order("created_at", { ascending: false })
      .limit(query.limit);
    if (error) throw error;
    return data ?? [];
  }

  if (query.kind === "appointments") {
    const { data, error } = await client
      .from("fhir_appointments")
      .select("*")
      .eq("patient_user_id", patientUserId)
      .order("start_time", { ascending: false, nullsFirst: false })
      .limit(query.limit);
    if (error) throw error;
    return data ?? [];
  }

  const { data, error } = await client
    .from("fhir_invoices")
    .select("*")
    .eq("patient_user_id", patientUserId)
    .order("issued_at", { ascending: false, nullsFirst: false })
    .limit(query.limit);
  if (error) throw error;
  return data ?? [];
}

function RecordRow({ kind, row }: { kind: RecordQuery["kind"]; row: any }) {
  if (kind === "vitals") {
    const config = VITAL_CONFIG[row.type as VitalType];
    // The same clinical check the rest of the product uses, so the assistant's
    // cards never disagree with the clinician's own screen.
    const status = describeReadingStatus(row.type, row.value, row.secondary_value, row.unit);
    const concerning = status.toLowerCase() !== "normal";
    const reading =
      row.type === "blood_pressure" && row.secondary_value
        ? `${row.value}/${row.secondary_value}`
        : row.value;

    return (
      <div className={cn("rounded-lg border p-2.5", concerning && "border-severity-high/40 bg-severity-high/5")}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">
            {reading} <span className="text-xs font-normal text-muted-foreground">{row.unit ?? config?.unit}</span>
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {format(new Date(row.recorded_at), "d MMM yyyy")}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">{config?.label ?? row.type}</span>
          <Badge variant={concerning ? "destructive" : "secondary"} className="text-[10px]">
            {status}
          </Badge>
        </div>
      </div>
    );
  }

  if (kind === "medications") {
    return (
      <div className="rounded-lg border p-2.5">
        <p className="text-sm font-medium">
          {row.name} {row.dosage && <span className="font-normal text-muted-foreground">{row.dosage}</span>}
        </p>
        {row.frequency && <p className="text-xs text-muted-foreground mt-0.5">{row.frequency.replace(/_/g, " ")}</p>}
      </div>
    );
  }

  if (kind === "appointments") {
    return (
      <div className="rounded-lg border p-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">
            {row.start_time ? format(new Date(row.start_time), "EEE d MMM, h:mm a") : "Not scheduled"}
          </span>
          <Badge variant="secondary" className="text-[10px] shrink-0">{row.status}</Badge>
        </div>
        {row.description && <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>}
      </div>
    );
  }

  const invoice = row as InvoiceRow;
  const balance = balanceMinor(invoice);
  return (
    <div className="rounded-lg border p-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{formatMoney(invoice.total_minor, invoice.currency)}</span>
        <span className="text-xs text-muted-foreground shrink-0">{invoice.invoice_number}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">
        {balance > 0
          ? `${formatMoney(balance, invoice.currency)} outstanding`
          : invoice.status === "balanced" ? "Paid" : invoice.status}
      </p>
    </div>
  );
}
