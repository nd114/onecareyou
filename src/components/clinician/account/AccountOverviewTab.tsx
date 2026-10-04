import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LimitBanner } from '@/components/LimitBanner';
import type { PracticeAccountOverview } from '@/hooks/usePracticeAccount';
import { clinicianTierName } from '@/hooks/useClinicianSubscription';
import { StatCard, formatLimit, minutes, pct } from './shared';

/** Seats, patients, storage and scribe minutes against what the plan allows. */
export function AccountOverviewTab({ overview }: { overview: PracticeAccountOverview }) {
  const { seats, patients, storage, scribe, practice } = overview;
  const clinicianOver = seats.clinician.limit !== null && seats.clinician.used > seats.clinician.limit;
  const patientsOver = patients.limit !== null && patients.used > patients.limit;
  const staffOver = seats.staff.used > seats.staff.purchased;
  const storageOver = storage.limit_gb !== null && storage.used_gb > storage.limit_gb;
  const scribeOver = scribe.pool_minutes > 0 && scribe.used_minutes > scribe.pool_minutes;

  return (
    <div className="space-y-4">
      <LimitBanner kind="seats" used={seats.clinician.used} limit={seats.clinician.limit} />
      <LimitBanner kind="patients" used={patients.used} limit={patients.limit} />

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
        <StatCard
          testId="stat-clinician-seats"
          label="Clinician seats"
          value={seats.clinician.used}
          of={formatLimit(seats.clinician.limit)}
          progress={pct(seats.clinician.used, seats.clinician.limit)}
          over={clinicianOver}
          hint="People who see and write clinical records."
        />
        <StatCard
          testId="stat-staff-seats"
          label="Staff seats"
          value={seats.staff.used}
          of={seats.staff.purchased}
          progress={pct(seats.staff.used, seats.staff.purchased)}
          over={staffOver}
          hint="Every non-clinical staff member needs a seat."
        />
        <StatCard
          testId="stat-patients"
          label="Patients"
          value={patients.used.toLocaleString('en-US')}
          of={formatLimit(patients.limit)}
          progress={pct(patients.used, patients.limit)}
          over={patientsOver}
        />
        <StatCard
          testId="stat-storage"
          label="Storage"
          value={`${storage.used_gb.toLocaleString('en-US', { maximumFractionDigits: 1 })} GB`}
          of={storage.limit_gb === null ? 'No limit' : `${storage.limit_gb.toLocaleString('en-US')} GB`}
          progress={pct(storage.used_gb, storage.limit_gb)}
          over={storageOver}
        />
        <StatCard
          testId="stat-scribe"
          label="Scribe minutes this period"
          value={minutes(scribe.used_minutes)}
          of={minutes(scribe.pool_minutes)}
          progress={pct(scribe.used_minutes, scribe.pool_minutes)}
          over={scribeOver}
          hint={
            scribe.pack_minutes_remaining > 0
              ? `${minutes(scribe.pack_minutes_remaining)} more from packs.`
              : 'Shared by the whole practice.'
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What happens at a limit</CardTitle>
          <CardDescription>
            {practice.name}
            {practice.tier ? ` · ${clinicianTierName(practice.tier)} plan` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Only new additions are blocked: a new patient, a new clinician seat, a new staff member.
            Existing patients, records and members, and their access, are unaffected.
          </p>
          <p>
            Storage and scribe minutes are shown above so you can add more before you run short.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
