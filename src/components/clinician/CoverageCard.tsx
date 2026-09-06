import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Download, UserX, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toCsv } from '@/lib/csv';
import {
  caseloadSpread,
  coverageGaps,
  coverageReportRows,
  practiceKpis,
  type CoverageInput,
  type CoverageKind,
} from '@/lib/practice-coverage';

/**
 * What the rosters do not say.
 *
 * The Clinicians and Patients tabs list who is here. This one lists who is
 * falling through the space between them — the patient sharing their record
 * with the hospital and assigned to nobody first, because that is a person
 * nobody is looking after rather than an organisational tidy-up.
 *
 * Everything is computed from rows the page has already fetched, so opening the
 * tab costs no queries.
 */

/**
 * Rows shown per finding. A hospital with two hundred unassigned patients needs
 * to know that, not to scroll past all two hundred names — the export carries
 * the full list.
 */
const VISIBLE_PER_GROUP = 8;

const GROUPS: Array<{ kind: CoverageKind; title: string; blurb: string }> = [
  {
    kind: 'patient_unassigned',
    title: 'Patients with no clinician',
    blurb: 'They are sharing their record with you and nobody is assigned to them.',
  },
  {
    kind: 'patient_no_department',
    title: 'Patients not routed to a department',
    blurb: 'They will not appear in any department queue.',
  },
  {
    kind: 'department_no_lead',
    title: 'Departments without a lead',
    blurb: 'Nobody can route or assign inside these.',
  },
  {
    kind: 'department_empty',
    title: 'Departments with nobody in them',
    blurb: 'Created, but never staffed.',
  },
  {
    kind: 'clinician_idle',
    title: 'Clinicians with no patients',
    blurb: 'Working here, carrying nobody. Capacity, or an assignment that never happened.',
  },
];

/** The display title for a finding, or the raw kind if one is ever added here first. */
const groupTitle = (kind: CoverageKind): string =>
  GROUPS.find((group) => group.kind === kind)?.title ?? kind;

export function CoverageCard({ staff, patients, departments, members }: CoverageInput) {
  // Memoised on the four arrays rather than on a props object, which would be a
  // fresh reference every render and never hit.
  const input = useMemo<CoverageInput>(
    () => ({ staff, patients, departments, members }),
    [staff, patients, departments, members],
  );
  const gaps = useMemo(() => coverageGaps(input), [input]);
  const kpis = useMemo(() => practiceKpis(input), [input]);
  const spread = useMemo(() => caseloadSpread(staff), [staff]);

  /**
   * One file, long format: the figures and the findings have different shapes
   * and a `section` column holds both without either being bent to fit. A
   * report an owner cannot send on is half a report.
   */
  const download = () => {
    const csv = toCsv(coverageReportRows({ kpis, spread, gaps, groupTitle }), [
      'section',
      'item',
      'value',
      'detail',
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `coverage-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where the hospital stands</CardTitle>
          <CardDescription>
            Counts rather than rates — a percentage over eleven patients is noise.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border p-3">
              <p className="text-2xl font-bold leading-none">{kpi.value}</p>
              <p className="text-xs font-medium mt-1.5">{kpi.label}</p>
              {kpi.note && <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.note}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Caseload
              </CardTitle>
              <CardDescription>
                How the work sits across the {spread.clinicians}{' '}
                {spread.clinicians === 1 ? 'clinician' : 'clinicians'} who carry it.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {spread.clinicians === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody is carrying a caseload yet. Assign patients from the Patients tab.
            </p>
          ) : (
            <>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 text-sm">
                <Figure label="Median" value={spread.median} />
                <Figure label="Average" value={spread.mean} />
                <Figure label="Busiest" value={spread.busiest?.count ?? 0} note={spread.busiest?.name} />
                <Figure label="Lightest" value={spread.lightest?.count ?? 0} note={spread.lightest?.name} />
              </div>
              {/* Only worth saying when the lightest person is actually carrying
                  something. Against a clinician with none it restates the
                  "clinicians with no patients" finding below in worse words. */}
              {spread.busiest &&
                spread.lightest &&
                spread.lightest.count > 0 &&
                spread.busiest.count > spread.lightest.count && (
                  <p className="text-xs text-muted-foreground">
                    {spread.busiest.name} carries {spread.busiest.count - spread.lightest.count} more
                    than {spread.lightest.name}.
                  </p>
                )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Gaps in cover</CardTitle>
              <CardDescription>Patients nobody is looking after come first.</CardDescription>
            </div>
            {gaps.length > 0 && (
              <Button variant="outline" size="sm" onClick={download}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {gaps.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 mx-auto text-primary opacity-70" />
              <p className="text-sm text-muted-foreground">
                Every patient has a clinician and every department has a lead.
              </p>
            </div>
          ) : (
            GROUPS.map((group) => {
              const found = gaps.filter((g) => g.kind === group.kind);
              if (found.length === 0) return null;

              return (
                <section key={group.kind} className="space-y-2">
                  <div className="flex items-center gap-2">
                    {group.kind === 'patient_unassigned' ? (
                      <UserX className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <h3 className="text-sm font-medium">{group.title}</h3>
                    <Badge
                      variant={group.kind === 'patient_unassigned' ? 'destructive' : 'secondary'}
                      className="text-[10px]"
                    >
                      {found.length}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{group.blurb}</p>
                  <ul className="rounded-lg border divide-y">
                    {found.slice(0, VISIBLE_PER_GROUP).map((gap) => (
                      <li
                        key={`${gap.kind}-${gap.id}`}
                        className="px-3 py-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                      >
                        <span className="text-sm font-medium min-w-0 break-words">{gap.subject}</span>
                        <span className="text-xs text-muted-foreground">{gap.detail}</span>
                      </li>
                    ))}
                    {found.length > VISIBLE_PER_GROUP && (
                      <li className="px-3 py-2 text-xs text-muted-foreground">
                        and {found.length - VISIBLE_PER_GROUP} more — export for the full list.
                      </li>
                    )}
                  </ul>
                </section>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-lg border p-3 min-w-0">
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="text-xs font-medium mt-1">{label}</p>
      {note && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{note}</p>}
    </div>
  );
}
