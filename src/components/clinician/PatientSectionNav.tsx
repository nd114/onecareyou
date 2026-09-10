import { cn } from '@/lib/utils';

/**
 * Two levels instead of fourteen.
 *
 * A single row of fourteen tabs made every part of a patient's record equally
 * prominent, so none of it was. These five sections are the order a clinician
 * actually reads a chart in — how are they, what is the clinical picture, what
 * is on file, what has been said, and the admin around it — and the tabs inside
 * a section only appear once that section is open.
 */
export interface PatientTabDef {
  value: string;
  label: string;
  clinicalOnly?: boolean;
}

export interface PatientSectionDef {
  id: string;
  label: string;
  tabs: PatientTabDef[];
}

export const PATIENT_SECTIONS: PatientSectionDef[] = [
  { id: 'overview', label: 'Overview', tabs: [{ value: 'overview', label: 'Summary' }] },
  {
    id: 'clinical',
    label: 'Clinical',
    tabs: [
      { value: 'encounters', label: 'Encounters', clinicalOnly: true },
      { value: 'vitals', label: 'Vitals', clinicalOnly: true },
      { value: 'medications', label: 'Medications', clinicalOnly: true },
      { value: 'careplan', label: 'Care plan', clinicalOnly: true },
      { value: 'guidance', label: 'Guidance', clinicalOnly: true },
    ],
  },
  {
    id: 'records',
    label: 'Records',
    tabs: [
      { value: 'documents', label: 'Documents', clinicalOnly: true },
      { value: 'adherence', label: 'Adherence', clinicalOnly: true },
      { value: 'analytics', label: 'Analytics', clinicalOnly: true },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    tabs: [
      { value: 'messages', label: 'Messages' },
      { value: 'appointments', label: 'Appointments' },
      { value: 'notes', label: 'My notes', clinicalOnly: true },
      { value: 'internal', label: 'Team notes', clinicalOnly: true },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    tabs: [
      { value: 'billing', label: 'Billing' },
      { value: 'activity', label: 'Activity' },
    ],
  },
];

export function visibleTabs(section: PatientSectionDef, clinicalStaff: boolean): PatientTabDef[] {
  return section.tabs.filter((t) => clinicalStaff || !t.clinicalOnly);
}

export function sectionOf(tab: string): PatientSectionDef {
  return PATIENT_SECTIONS.find((s) => s.tabs.some((t) => t.value === tab)) ?? PATIENT_SECTIONS[0];
}

export function firstTabFor(clinicalStaff: boolean): string {
  return 'overview';
}

interface Props {
  activeTab: string;
  onChange: (tab: string) => void;
  clinicalStaff: boolean;
}

export function PatientSectionNav({ activeTab, onChange, clinicalStaff }: Props) {
  const current = sectionOf(activeTab);
  const sections = PATIENT_SECTIONS.filter((s) => visibleTabs(s, clinicalStaff).length > 0);
  const tabs = visibleTabs(current, clinicalStaff);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1.5">
        {sections.map((s) => {
          const active = s.id === current.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                const first = visibleTabs(s, clinicalStaff)[0];
                if (first) onChange(first.value);
              }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1 px-0.5">
          {tabs.map((t) => {
            const active = t.value === activeTab;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => onChange(t.value)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
