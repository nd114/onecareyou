import { supabase } from '@/integrations/supabase/client';
import { VITAL_CONFIG, VitalType } from '@/types/health';

/**
 * Approval-gated AI actions.
 *
 * The assistant only ever *proposes* an action (see the patient-ai-chat edge
 * function). Nothing touches the database until the user explicitly approves
 * it here, and every write goes through the user's own session so RLS applies.
 */
export type ProposedActionType =
  | 'log_vital'
  | 'add_medication'
  | 'mark_dose_taken'
  | 'update_medication_times';

export interface ProposedAction {
  id: string;
  type: ProposedActionType;
  params: Record<string, any>;
}

export interface ActionOutcome {
  id: string;
  ok: boolean;
  message: string;
}

const pad = (t: string) => (/^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, '0') : t);

/** Human-readable summary of what approving an action will do. */
export function describeAction(action: ProposedAction): { title: string; detail: string } {
  const p = action.params || {};
  switch (action.type) {
    case 'log_vital': {
      const cfg = VITAL_CONFIG[p.type as VitalType];
      const label = cfg?.label ?? p.type;
      const value = p.secondary_value ? `${p.value}/${p.secondary_value}` : `${p.value}`;
      return {
        title: `Record ${label}`,
        detail: [
          `${value} ${cfg?.unit ?? ''}`.trim(),
          p.recorded_at ? `at ${new Date(p.recorded_at).toLocaleString()}` : 'now',
          p.notes ? `— ${p.notes}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }
    case 'add_medication': {
      const times = Array.isArray(p.times_of_day) ? p.times_of_day.map(pad).join(', ') : '';
      return {
        title: `Add medication: ${p.name}`,
        detail: [p.dosage, p.frequency, times && `at ${times}`, p.instructions]
          .filter(Boolean)
          .join(' · '),
      };
    }
    case 'mark_dose_taken':
      return {
        title: `Mark dose as taken: ${p.medication_name}`,
        detail: p.scheduled_time ? `Today's ${pad(p.scheduled_time)} dose` : "Today's next pending dose",
      };
    case 'update_medication_times': {
      const times = Array.isArray(p.times_of_day) ? p.times_of_day.map(pad).join(', ') : '';
      return {
        title: `Update reminder times: ${p.medication_name}`,
        detail: times ? `New times: ${times}` : 'New reminder times',
      };
    }
    default:
      return { title: 'Unsupported action', detail: '' };
  }
}

async function findMedication(userId: string, name: string) {
  const { data } = await supabase
    .from('medications')
    .select('id, name, times_of_day')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('family_member_id', null)
    .ilike('name', `%${name}%`)
    .limit(2);
  return data ?? [];
}

/** Execute one approved action against the signed-in user's own record. */
export async function executeAction(action: ProposedAction, userId: string): Promise<ActionOutcome> {
  const p = action.params || {};
  try {
    switch (action.type) {
      case 'log_vital': {
        const type = p.type as VitalType;
        const cfg = VITAL_CONFIG[type];
        if (!cfg) return { id: action.id, ok: false, message: `Unknown vital type "${p.type}"` };
        const value = Number(p.value);
        if (!Number.isFinite(value)) return { id: action.id, ok: false, message: 'Invalid value' };

        const { error } = await supabase.from('vitals').insert({
          user_id: userId,
          family_member_id: null,
          type,
          value,
          secondary_value: p.secondary_value != null ? Number(p.secondary_value) : null,
          unit: cfg.unit,
          notes: p.notes ?? null,
          source: 'manual',
          recorded_at: p.recorded_at ? new Date(p.recorded_at).toISOString() : new Date().toISOString(),
        });
        if (error) throw error;
        return { id: action.id, ok: true, message: `${cfg.label} recorded` };
      }

      case 'add_medication': {
        if (!p.name) return { id: action.id, ok: false, message: 'Missing medication name' };
        const times: string[] = Array.isArray(p.times_of_day) ? p.times_of_day.map(pad) : [];

        const { data, error } = await supabase
          .from('medications')
          .insert({
            user_id: userId,
            family_member_id: null,
            name: p.name,
            dosage: p.dosage ?? '',
            frequency: p.frequency ?? '',
            times_of_day: times,
            instructions: p.instructions ?? null,
          })
          .select('id')
          .single();
        if (error) throw error;

        if (data && times.length > 0) {
          const today = new Date().toISOString().split('T')[0];
          await supabase.from('schedule_entries').insert(
            times.map((time) => ({
              user_id: userId,
              medication_id: data.id,
              family_member_id: null,
              scheduled_time: `${today}T${time}:00`,
              status: 'pending' as const,
            }))
          );
        }
        return { id: action.id, ok: true, message: `${p.name} added` };
      }

      case 'mark_dose_taken': {
        if (!p.medication_name) return { id: action.id, ok: false, message: 'Missing medication name' };
        const meds = await findMedication(userId, p.medication_name);
        if (meds.length === 0) {
          return { id: action.id, ok: false, message: `No active medication matching "${p.medication_name}"` };
        }
        if (meds.length > 1) {
          return { id: action.id, ok: false, message: `"${p.medication_name}" matches more than one medication — mark it from the schedule instead` };
        }

        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        let query = supabase
          .from('schedule_entries')
          .select('id, scheduled_time')
          .eq('user_id', userId)
          .eq('medication_id', meds[0].id)
          .eq('status', 'pending')
          .gte('scheduled_time', dayStart.toISOString())
          .lt('scheduled_time', dayEnd.toISOString())
          .order('scheduled_time', { ascending: true });

        const { data: entries, error: fetchError } = await query;
        if (fetchError) throw fetchError;
        if (!entries || entries.length === 0) {
          return { id: action.id, ok: false, message: `No pending dose today for ${meds[0].name}` };
        }

        const wanted = p.scheduled_time ? pad(p.scheduled_time) : null;
        const target =
          (wanted && entries.find((e) => String(e.scheduled_time).slice(11, 16) === wanted)) || entries[0];

        const { error } = await supabase
          .from('schedule_entries')
          .update({ status: 'taken', taken_at: new Date().toISOString() })
          .eq('id', target.id);
        if (error) throw error;
        return { id: action.id, ok: true, message: `${meds[0].name} marked as taken` };
      }

      case 'update_medication_times': {
        const times: string[] = Array.isArray(p.times_of_day) ? p.times_of_day.map(pad) : [];
        if (times.length === 0) return { id: action.id, ok: false, message: 'No times provided' };
        const meds = await findMedication(userId, p.medication_name);
        if (meds.length === 0) {
          return { id: action.id, ok: false, message: `No active medication matching "${p.medication_name}"` };
        }
        if (meds.length > 1) {
          return { id: action.id, ok: false, message: `"${p.medication_name}" matches more than one medication — edit it from the medications page` };
        }

        const { error } = await supabase
          .from('medications')
          .update({ times_of_day: times })
          .eq('id', meds[0].id)
          .eq('user_id', userId);
        if (error) throw error;
        return { id: action.id, ok: true, message: `Reminder times updated for ${meds[0].name}` };
      }

      default:
        return { id: action.id, ok: false, message: 'Unsupported action' };
    }
  } catch (err) {
    console.error('AI action failed', action, err);
    return {
      id: action.id,
      ok: false,
      message: err instanceof Error ? err.message : 'Something went wrong',
    };
  }
}
