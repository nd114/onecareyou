import { supabase } from '@/integrations/supabase/client';
import { VITAL_CONFIG, VitalType } from '@/types/health';

/**
 * Approval-gated clinician AI actions.
 *
 * The clinician assistant only ever *proposes* (see the clinician-ai-chat edge
 * function). Nothing is sent or saved until the clinician approves it here.
 * Every write runs through the clinician's own session (RLS applies) and is
 * mirrored into the patient action log for audit.
 */
export type ClinicianActionType = 'send_message' | 'create_guidance' | 'set_alert_rule';

export interface ClinicianProposedAction {
  id: string;
  type: ClinicianActionType;
  params: Record<string, any>;
}

export interface ClinicianActionOutcome {
  id: string;
  ok: boolean;
  message: string;
}

const patientLabel = (p: Record<string, any>) => p.patient_name || 'patient';

export function describeClinicianAction(
  action: ClinicianProposedAction,
): { title: string; detail: string } {
  const p = action.params || {};
  switch (action.type) {
    case 'send_message':
      return {
        title: `Send message to ${patientLabel(p)}`,
        detail: String(p.body ?? ''),
      };
    case 'create_guidance':
      return {
        title: `Send guidance to ${patientLabel(p)}: ${p.title ?? ''}`,
        detail: [
          String(p.instruction ?? ''),
          p.priority ? `priority: ${p.priority}` : '',
          p.due_date ? `due ${p.due_date}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      };
    case 'set_alert_rule': {
      const cfg = VITAL_CONFIG[p.vital_type as VitalType];
      const value = p.threshold_secondary
        ? `${p.threshold_value}/${p.threshold_secondary}`
        : `${p.threshold_value}`;
      return {
        title: `Alert rule for ${patientLabel(p)}`,
        detail: `${cfg?.label ?? p.vital_type} ${p.condition} ${value} ${cfg?.unit ?? ''}`.trim(),
      };
    }
    default:
      return { title: 'Unsupported action', detail: '' };
  }
}

/** Find the active share row that authorises this clinician for the patient. */
async function findShare(clinicianId: string, clinicianEmail: string | undefined, patientId: string) {
  const { data } = await supabase
    .from('provider_shares')
    .select('id')
    .eq('user_id', patientId)
    .eq('is_active', true)
    .or(`clinician_user_id.eq.${clinicianId},provider_email.eq.${clinicianEmail ?? ''}`)
    .limit(1);
  return data?.[0]?.id ?? null;
}

/**
 * Record what the assistant did, on the patient's action rail.
 *
 * `actor_user_id` is NOT NULL and the read policy keys off it, so an entry
 * without one is rejected by the database and would be invisible to the
 * clinician who caused it even if it were not. It was missing here, and
 * because the failure was swallowed without a trace every assistant action
 * went unlogged and looked exactly like one that had been logged.
 *
 * Still best-effort — a failed audit write must not undo an action the
 * clinician already approved — but no longer silent.
 */
async function logAction(
  actorId: string,
  patientId: string,
  action: string,
  summary: string,
  refTable?: string,
  refId?: string | null,
) {
  try {
    const { error } = await supabase.from('patient_action_log').insert({
      actor_user_id: actorId,
      patient_user_id: patientId,
      action,
      summary,
      ref_table: refTable ?? null,
      ref_id: refId ?? null,
      metadata: { source: 'clinician_assistant', approved: true },
    });
    if (error) console.error('patient_action_log insert failed', error);
  } catch (err) {
    console.error('patient_action_log insert threw', err);
  }
}

export async function executeClinicianAction(
  action: ClinicianProposedAction,
  clinician: { id: string; email?: string },
): Promise<ClinicianActionOutcome> {
  const p = action.params || {};
  const patientId: string | undefined = p.patient_user_id;
  const fail = (message: string) => ({ id: action.id, ok: false, message });

  try {
    if (!patientId) return fail('No patient was identified for this action.');

    switch (action.type) {
      case 'send_message': {
        const body = String(p.body ?? '').trim();
        if (!body) return fail('Message body was empty — nothing sent.');
        const { error } = await supabase.from('messages').insert({
          clinician_user_id: clinician.id,
          patient_user_id: patientId,
          sender_user_id: clinician.id,
          body,
        });
        if (error) return fail(error.message);
        await logAction(clinician.id, patientId, 'message_sent', `Assistant-drafted message sent: ${body.slice(0, 120)}`, 'messages');
        return { id: action.id, ok: true, message: 'Message sent.' };
      }

      case 'create_guidance': {
        const title = String(p.title ?? '').trim();
        const instruction = String(p.instruction ?? '').trim();
        if (!title || !instruction) return fail('Guidance was incomplete — nothing saved.');
        const shareId = await findShare(clinician.id, clinician.email, patientId);
        const { data, error } = await supabase
          .from('clinician_guidance')
          .insert({
            clinician_user_id: clinician.id,
            patient_user_id: patientId,
            share_id: shareId,
            title,
            instruction,
            category: p.category ?? null,
            priority: p.priority ?? 'normal',
            due_date: p.due_date ?? null,
            status: 'sent',
          })
          .select('id')
          .single();
        if (error) return fail(error.message);
        await logAction(clinician.id, patientId, 'guidance_sent', `Assistant-drafted guidance: ${title}`, 'clinician_guidance', data?.id);
        return { id: action.id, ok: true, message: 'Guidance sent to the patient.' };
      }

      case 'set_alert_rule': {
        const vitalType = String(p.vital_type ?? '');
        if (!vitalType || p.threshold_value == null) return fail('Threshold was incomplete — nothing saved.');
        const shareId = await findShare(clinician.id, clinician.email, patientId);
        const { data, error } = await supabase
          .from('clinician_alert_rules')
          .insert({
            clinician_user_id: clinician.id,
            patient_user_id: patientId,
            share_id: shareId,
            vital_type: vitalType,
            condition: p.condition === 'below' ? 'below' : 'above',
            threshold_value: Number(p.threshold_value),
            threshold_secondary: p.threshold_secondary != null ? Number(p.threshold_secondary) : null,
            is_active: true,
          })
          .select('id')
          .single();
        if (error) return fail(error.message);
        await logAction(
          clinician.id,
          patientId,
          'alert_rule_created',
          `Assistant-drafted alert rule: ${vitalType} ${p.condition} ${p.threshold_value}`,
          'clinician_alert_rules',
          data?.id,
        );
        return { id: action.id, ok: true, message: 'Alert rule saved.' };
      }

      default:
        return fail('This action type is not supported.');
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.');
  }
}
