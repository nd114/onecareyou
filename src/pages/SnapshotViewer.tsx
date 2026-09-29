import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { FileText, Loader2, Lock, Printer, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDay, formatDayTime } from '@/lib/format-date';
import { toClinicalList } from '@/lib/clinical-lists';
import { resolveVitalConfig } from '@/types/health';
import { VIEWER_MESSAGES, readSnapshotToken } from '@/lib/snapshot-links';

/**
 * The page somebody without an account sees when a patient sends them a
 * read-only link.
 *
 * Public, and deliberately a dead end: no header, no sign-up prompt, no link
 * into the app, nothing to reply to or claim. The token is read from the URL
 * fragment, which the browser never sends to a server; it goes to the
 * view-snapshot-link edge function in a POST body and nowhere else.
 */

interface Vital {
  type: string;
  value: number;
  secondary_value: number | null;
  unit: string | null;
  recorded_at: string;
}
interface Medication {
  name: string;
  dosage: string | null;
  frequency: string | null;
  instructions: string | null;
  start_date: string | null;
  prescriber: string | null;
}
interface SharedDocument {
  id: string;
  title: string;
  category: string | null;
  document_date: string | null;
  available: boolean;
}
interface Snapshot {
  sharer_first_name: string;
  created_at: string;
  expires_at: string;
  categories: string[];
  snapshot: {
    vitals?: Vital[];
    medications?: Medication[];
    conditions?: unknown;
    allergies?: unknown;
  };
  documents: SharedDocument[];
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'passcode'; firstName?: string; wrong: boolean }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'ok'; data: Snapshot };

async function callViewer(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('view-snapshot-link', { body });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    return { status: status === 429 ? 'rate_limited' : 'error' };
  }
  return (data ?? { status: 'error' }) as Record<string, unknown>;
}

export default function SnapshotViewer() {
  const [token] = useState(() => readSnapshotToken(window.location.hash));
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const load = useCallback(
    async (code?: string) => {
      if (!token) {
        setState({ kind: 'unavailable', reason: 'not_found' });
        return;
      }
      const r = await callViewer({ token, passcode: code ?? undefined });
      const status = String(r.status);
      if (status === 'ok') setState({ kind: 'ok', data: r as unknown as Snapshot });
      else if (status === 'passcode_required' || status === 'passcode_wrong')
        setState({
          kind: 'passcode',
          firstName: typeof r.sharer_first_name === 'string' ? r.sharer_first_name : undefined,
          wrong: status === 'passcode_wrong',
        });
      else setState({ kind: 'unavailable', reason: status });
    },
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  const submitPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await load(passcode.trim());
    setSubmitting(false);
  };

  const openDocument = async (doc: SharedDocument) => {
    setDocError(null);
    setDocBusy(doc.id);
    // Opened before the request so a popup blocker treats it as the user's
    // click; pointed at the signed URL once there is one.
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    const r = await callViewer({ token, passcode: passcode.trim() || undefined, documentId: doc.id });
    setDocBusy(null);
    if (r.status === 'ok' && typeof r.signedUrl === 'string') {
      if (win) win.location.href = r.signedUrl;
      else window.location.href = r.signedUrl;
      return;
    }
    win?.close();
    if (r.status === 'revoked' || r.status === 'expired' || r.status === 'locked') {
      setState({ kind: 'unavailable', reason: String(r.status) });
    } else {
      setDocError('That document is no longer available through this link.');
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      <Helmet>
        <title>Shared health snapshot · OneCare</title>
        <meta name="robots" content="noindex,nofollow,noarchive" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <p className="mb-4 font-display text-lg font-semibold text-primary">OneCare</p>

        {state.kind === 'loading' && (
          <div className="py-24 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {state.kind === 'unavailable' && (
          <section className="rounded-2xl border bg-card p-6 text-center">
            <h1 className="font-display text-xl font-semibold">This link is not available</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {VIEWER_MESSAGES[state.reason] ?? 'Something went wrong opening this link. Please try again later.'}
            </p>
          </section>
        )}

        {state.kind === 'passcode' && (
          <section className="mx-auto max-w-sm rounded-2xl border bg-card p-6">
            <Lock className="mb-3 h-6 w-6 text-primary" />
            <h1 className="font-display text-xl font-semibold">Enter the passcode</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {state.firstName ?? 'The person who shared this'} protected this link with a six-digit passcode.
              They will have sent it to you separately.
            </p>
            <form onSubmit={submitPasscode} className="mt-4 space-y-3">
              <Label htmlFor="passcode" className="sr-only">Passcode</Label>
              <Input
                id="passcode"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ''))}
                className="font-mono tracking-[0.3em]"
                aria-invalid={state.wrong}
              />
              {state.wrong && <p className="text-sm text-destructive">That passcode is not right.</p>}
              <Button type="submit" className="w-full" disabled={passcode.length !== 6 || submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                View
              </Button>
            </form>
          </section>
        )}

        {state.kind === 'ok' && (
          <SnapshotBody
            data={state.data}
            onOpenDocument={openDocument}
            docBusy={docBusy}
            docError={docError}
          />
        )}
      </main>
    </div>
  );
}

function SnapshotBody({
  data,
  onOpenDocument,
  docBusy,
  docError,
}: {
  data: Snapshot;
  onOpenDocument: (d: SharedDocument) => void;
  docBusy: string | null;
  docError: string | null;
}) {
  const has = (c: string) => data.categories.includes(c);
  const vitals = data.snapshot.vitals ?? [];
  const meds = data.snapshot.medications ?? [];

  return (
    <article className="space-y-6">
      <header className="rounded-2xl border border-primary/20 bg-card p-5">
        <h1 className="font-display text-2xl font-semibold">
          Shared by {data.sharer_first_name} via OneCare
        </h1>
        <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Read-only. A copy of what {data.sharer_first_name} chose to share on{' '}
            {formatDayTime(data.created_at)} — later changes are not shown. This link expires{' '}
            {formatDayTime(data.expires_at)}.
          </span>
        </p>
        <Button variant="outline" size="sm" className="mt-4 print:hidden" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
      </header>

      {has('vitals') && (
        <Section title="Vitals" note="Readings from the 90 days before this was shared.">
          {vitals.length === 0 ? (
            <Empty>No readings recorded in that period.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Reading</th>
                    <th className="py-2 pr-3 font-medium">Value</th>
                    <th className="py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {vitals.map((v, i) => (
                    <tr key={i} className="border-b last:border-0 break-inside-avoid">
                      <td className="py-2 pr-3">{resolveVitalConfig(v.type).label}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {v.value}
                        {v.secondary_value !== null && v.secondary_value !== undefined ? `/${v.secondary_value}` : ''}{' '}
                        {v.unit ?? ''}
                      </td>
                      <td className="py-2 text-muted-foreground">{formatDayTime(v.recorded_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {has('medications') && (
        <Section title="Medications" note="Medicines being taken when this was shared.">
          {meds.length === 0 ? (
            <Empty>No current medications recorded.</Empty>
          ) : (
            <ul className="divide-y">
              {meds.map((m, i) => (
                <li key={i} className="py-2.5 break-inside-avoid">
                  <p className="font-medium">
                    {m.name}
                    {m.dosage ? <span className="font-normal text-muted-foreground"> · {m.dosage}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[m.frequency, m.instructions, m.prescriber ? `Prescribed by ${m.prescriber}` : null,
                      m.start_date ? `Since ${formatDay(m.start_date)}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {has('conditions') && (
        <Section title="Conditions">
          <ClinicalList items={toClinicalList(data.snapshot.conditions)} empty="No conditions recorded." />
        </Section>
      )}

      {has('allergies') && (
        <Section title="Allergies">
          <ClinicalList items={toClinicalList(data.snapshot.allergies)} empty="No allergies recorded." />
        </Section>
      )}

      {has('documents') && (
        <Section title="Documents" note="Each opens for a minute at a time.">
          {docError && <p className="mb-2 text-sm text-destructive">{docError}</p>}
          <ul className="divide-y">
            {data.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {d.available
                      ? formatDay(d.document_date)
                      : 'No longer available — removed from view since this was shared'}
                  </span>
                </span>
                {d.available && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="print:hidden"
                    disabled={docBusy === d.id}
                    onClick={() => onOpenDocument(d)}
                  >
                    {docBusy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Open'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        This is a read-only copy shared by {data.sharer_first_name}. It may be incomplete and is not
        medical advice. You cannot reply to or change anything through this page. If you need
        more, ask {data.sharer_first_name} directly.
      </footer>
    </article>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 break-inside-avoid-page">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {note && <p className="mb-3 text-xs text-muted-foreground">{note}</p>}
      <div className={note ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function ClinicalList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((i) => (
        <li key={i} className="rounded-full bg-muted px-3 py-1 text-sm">{i}</li>
      ))}
    </ul>
  );
}
