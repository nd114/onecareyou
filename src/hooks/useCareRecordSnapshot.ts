import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Care record snapshots — the Health Vault as system of record.
 *
 * Compiles everything a clinician told the patient (secure messages + guidance)
 * into an immutable, watermarked HTML record filed into the patient's own vault.
 * Generated on demand and automatically when a connection ends, so an ended
 * relationship always closes with a complete, legally defensible record.
 */

export const CARE_RECORD_SOURCE = 'care_record_snapshot';

interface SnapshotInput {
  /** Clinician the record covers. Null/undefined = unclaimed share, nothing to file. */
  clinicianUserId: string | null;
  /** Display name used on the record header. */
  clinicianLabel: string;
  /** Why the snapshot was generated. */
  reason?: 'manual' | 'connection_ended';
  /** Suppress toasts (used for automatic snapshots taken during another action). */
  silent?: boolean;
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

function buildHtml(opts: {
  patientLabel: string;
  clinicianLabel: string;
  generatedAt: Date;
  rangeStart: string | null;
  rangeEnd: string | null;
  reason: string;
  messages: { body: string; created_at: string; sender_user_id: string }[];
  guidance: {
    title: string;
    instruction: string;
    priority: string | null;
    due_date: string | null;
    status: string | null;
    created_at: string;
  }[];
  patientUserId: string;
}) {
  const rows = opts.messages
    .map(
      (m) => `<tr><td>${fmt(m.created_at)}</td><td>${
        m.sender_user_id === opts.patientUserId ? 'Patient' : esc(opts.clinicianLabel)
      }</td><td>${esc(m.body).replace(/\n/g, '<br/>')}</td></tr>`,
    )
    .join('');

  const guidanceRows = opts.guidance
    .map(
      (g) => `<tr><td>${fmt(g.created_at)}</td><td>${esc(g.title)}</td><td>${esc(g.instruction).replace(
        /\n/g,
        '<br/>',
      )}</td><td>${esc(g.priority ?? 'normal')}</td><td>${esc(g.due_date ?? '—')}</td><td>${esc(
        g.status ?? '—',
      )}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Care record — ${esc(opts.clinicianLabel)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#1f2a24;margin:40px;line-height:1.5}
  h1{font-size:22px;margin:0 0 4px}
  .meta{font-size:12px;color:#5b6b62;margin-bottom:24px}
  h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #d8e0da;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #d8e0da;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f2f6f3}
  .watermark{margin-top:32px;font-size:11px;color:#7a8b81;border-top:1px solid #d8e0da;padding-top:10px}
</style></head><body>
<h1>Care record — ${esc(opts.clinicianLabel)}</h1>
<div class="meta">
  Patient: ${esc(opts.patientLabel)}<br/>
  Period covered: ${opts.rangeStart ? fmt(opts.rangeStart) : '—'} to ${opts.rangeEnd ? fmt(opts.rangeEnd) : '—'}<br/>
  Generated: ${opts.generatedAt.toLocaleString()} · Reason: ${esc(opts.reason)}
</div>
<h2>Guidance and care instructions (${opts.guidance.length})</h2>
${
  guidanceRows
    ? `<table><thead><tr><th>Date</th><th>Title</th><th>Instruction</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead><tbody>${guidanceRows}</tbody></table>`
    : '<p style="font-size:12px">No guidance was recorded for this connection.</p>'
}
<h2>Secure messages (${opts.messages.length})</h2>
${
  rows
    ? `<table><thead><tr><th>Date</th><th>From</th><th>Message</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p style="font-size:12px">No messages were exchanged for this connection.</p>'
}
<div class="watermark">
  OneCare care record · immutable snapshot · generated for ${esc(opts.patientLabel)} on
  ${opts.generatedAt.toLocaleString()}. This document is a preserved copy of what was communicated between the
  patient and ${esc(opts.clinicianLabel)} and cannot be edited by either party.
</div>
</body></html>`;
}

export function useCareRecordSnapshot() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const generate = useMutation({
    mutationFn: async ({ clinicianUserId, clinicianLabel, reason = 'manual' }: SnapshotInput) => {
      if (!user?.id) throw new Error('Not authenticated');
      if (!clinicianUserId) throw new Error('unclaimed');

      const [{ data: msgs, error: msgErr }, { data: guides, error: gErr }] = await Promise.all([
        supabase
          .from('messages')
          .select('body, created_at, sender_user_id')
          .eq('patient_user_id', user.id)
          .eq('clinician_user_id', clinicianUserId)
          .order('created_at', { ascending: true }),
        supabase
          .from('clinician_guidance')
          .select('title, instruction, priority, due_date, status, created_at')
          .eq('patient_user_id', user.id)
          .eq('clinician_user_id', clinicianUserId)
          .order('created_at', { ascending: true }),
      ]);
      if (msgErr) throw msgErr;
      if (gErr) throw gErr;

      const messages = msgs ?? [];
      const guidance = guides ?? [];
      if (messages.length === 0 && guidance.length === 0) throw new Error('empty');

      const dates = [...messages, ...guidance].map((r) => r.created_at).sort();
      const generatedAt = new Date();
      const html = buildHtml({
        patientLabel: profile?.name || user.email || 'Patient',
        clinicianLabel: clinicianLabel || 'Provider',
        generatedAt,
        rangeStart: dates[0] ?? null,
        rangeEnd: dates[dates.length - 1] ?? null,
        reason: reason === 'connection_ended' ? 'connection ended' : 'requested by patient',
        messages,
        guidance,
        patientUserId: user.id,
      });

      const blob = new Blob([html], { type: 'text/html' });
      const stamp = generatedAt.toISOString().slice(0, 10);
      const safeLabel = (clinicianLabel || 'provider').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
      const fileName = `care-record-${safeLabel || 'provider'}-${stamp}.html`;
      const filePath = `${user.id}/${crypto.randomUUID()}.html`;

      const { error: upErr } = await supabase.storage
        .from('health-documents')
        .upload(filePath, blob, { contentType: 'text/html' });
      if (upErr) throw upErr;

      const { data, error } = await supabase
        .from('health_documents')
        .insert({
          user_id: user.id,
          file_path: filePath,
          file_name: fileName,
          file_size: blob.size,
          mime_type: 'text/html',
          title: `Care record — ${clinicianLabel || 'Provider'} (${stamp})`,
          category: 'care_record',
          document_date: stamp,
          notes: `Preserved record of ${guidance.length} guidance item(s) and ${messages.length} message(s).`,
          tags: [],
          source_context: CARE_RECORD_SOURCE,
          family_member_id: null,
        })
        .select()
        .single();
      if (error) throw error;

      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      if (!vars.silent) toast.success('Care record saved to your Health Vault');
    },
    onError: (error: Error, vars) => {
      if (vars?.silent) return;
      if (error.message === 'empty') {
        toast.info('Nothing to file yet — no messages or guidance from this provider.');
      } else if (error.message === 'unclaimed') {
        toast.info('This provider has not joined yet, so there is no record to file.');
      } else {
        toast.error(`Could not save the care record: ${error.message}`);
      }
    },
  });

  return { generate };
}
