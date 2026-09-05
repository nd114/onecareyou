import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Loader2, MapPin, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Badge } from '@/components/ui/badge';
import { Panel, PanelEmpty, PanelHeader, PanelRow, PanelRows } from '@/components/ui/panel';
import { useAppointments } from '@/hooks/useAppointments';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { groupByDay, scheduleBucket, scheduleCounts } from '@/lib/practice-schedule';
import { formatDay, formatTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';

/** FHIR statuses in the words a clinic uses, matching the per-patient tab. */
const STATUS_LABEL: Record<string, string> = {
  proposed: 'Proposed',
  pending: 'Pending',
  booked: 'Booked',
  arrived: 'Arrived',
  fulfilled: 'Completed',
  cancelled: 'Cancelled',
  noshow: 'Did not attend',
  waitlist: 'Waiting list',
};

const STATUS_STYLE: Record<string, string> = {
  booked: 'bg-primary/10 text-primary border-primary/20',
  arrived: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  fulfilled: 'bg-status-success/10 text-status-success border-status-success/20',
  cancelled: 'bg-muted text-muted-foreground',
  noshow: 'bg-severity-high/10 text-severity-high border-severity-high/20',
};

type Range = 'upcoming' | 'past';

/**
 * The practice diary.
 *
 * Appointments were only ever a tab inside one patient, so "what does my day
 * look like" had no answer short of opening every patient in turn. Same rows,
 * same row policies — a clinician sees the appointments of the patients they
 * can already reach — read across people instead of down one.
 *
 * Read-only by design. Booking and cancelling belong next to the patient they
 * concern, where the history and the consent are, so every row here links back
 * to that patient rather than repeating the controls.
 */
const ClinicianSchedule = () => {
  const { isClinician, isLoading: loadingProfile } = useClinicianProfile();
  const { appointments, isLoading } = useAppointments();
  const { patients } = useClinicianPatients();
  const [range, setRange] = useState<Range>('upcoming');

  // The detail page is keyed by invite code, not user id — same as the list —
  // so a row can only offer the link when this clinician has that patient.
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

  const counts = useMemo(() => scheduleCounts(appointments), [appointments]);

  const days = useMemo(() => {
    const wanted = appointments.filter((a) => {
      const bucket = scheduleBucket(a);
      if (!bucket) return false;
      return range === 'past' ? bucket === 'past' : bucket !== 'past';
    });
    const grouped = groupByDay(wanted);
    // Most recent first when looking back; next first when looking ahead.
    return range === 'past' ? [...grouped].reverse() : grouped;
  }, [appointments, range]);

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
      <SectionTabs section="today" variant="clinician" />

      <main className="container px-4 sm:px-6 py-6 sm:py-8 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6 flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">Schedule</h1>
              <p className="text-muted-foreground text-sm">
                Every appointment across your patients, in one diary.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Today', value: counts.today },
              { label: 'Still to come', value: counts.upcoming },
              { label: 'Awaiting a reply', value: counts.unconfirmed },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-bold tabular-nums">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="mb-4 flex gap-2">
            {(['upcoming', 'past'] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  range === r
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                {r === 'upcoming' ? 'Today and ahead' : 'Already been'}
              </button>
            ))}
          </div>

          {isLoading ? (
            <Panel>
              <PanelEmpty className="py-12">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
              </PanelEmpty>
            </Panel>
          ) : days.length === 0 ? (
            <Panel>
              <PanelEmpty className="py-12">
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-muted">
                  <CalendarClock className="h-7 w-7 text-muted-foreground" />
                </span>
                <p className="font-display text-lg leading-snug text-foreground">
                  {range === 'upcoming' ? 'Nothing booked yet' : 'Nothing behind you yet'}
                </p>
                <p className="mx-auto mt-2 max-w-sm">
                  Appointments are booked from a patient's own page, on their Appointments tab.
                </p>
              </PanelEmpty>
            </Panel>
          ) : (
            <div className="space-y-4">
              {days.map((day) => (
                <Panel key={day.key}>
                  <PanelHeader
                    eyebrow={formatDay(day.date)}
                    description={`${day.items.length} appointment${day.items.length === 1 ? '' : 's'}`}
                  />
                  <PanelRows>
                    {day.items.map((appointment) => {
                      const known = byUserId.get(appointment.patientUserId);
                      const name = known?.name ?? 'Patient';
                      const status = appointment.status as string;
                      return (
                        <PanelRow
                          key={appointment.id}
                          glyph={
                            <span className="w-[54px] text-center text-sm font-semibold tabular-nums">
                              {formatTime(appointment.start)}
                            </span>
                          }
                          label={name}
                          detail={appointment.visitType || appointment.description || undefined}
                          trailing={
                            <span className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn('text-[10px] sm:text-xs', STATUS_STYLE[status])}
                              >
                                {STATUS_LABEL[status] ?? status}
                              </Badge>
                            </span>
                          }
                        >
                          <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            {appointment.locationText && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {appointment.locationText}
                              </span>
                            )}
                            {/* Back to where this appointment can actually be
                                changed — booking belongs beside the patient. */}
                            {known?.inviteCode && (
                              <Link
                                to={`/clinician/patients/${known.inviteCode}`}
                                className="flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                              >
                                <User className="h-3 w-3 shrink-0" />
                                Open {name}
                              </Link>
                            )}
                          </span>
                        </PanelRow>
                      );
                    })}
                  </PanelRows>
                </Panel>
              ))}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default ClinicianSchedule;
