import { useMemo, useState } from 'react';
import { Download, FileJson, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Panel, PanelBody, PanelGlyph, PanelHeader, PanelRow, PanelRows } from '@/components/ui/panel';
import { useAuth } from '@/contexts/AuthContext';
import { useMedications } from '@/hooks/useMedications';
import { useVitals } from '@/hooks/useVitals';
import { summariseRecordBundle, toRecordBundle } from '@/lib/fhir/record-bundle';
import type { MedicationRecord } from '@/lib/fhir/medication';
import type { VitalRow } from '@/lib/fhir/observation';

/**
 * Take the record with you.
 *
 * The homepage promises your record stays yours if you ever leave, and until
 * now the only thing that could leave was vitals. This exports everything we
 * hold in a form another system reads without a mapping written for us:
 * readings, medications, conditions and allergies, as one FHIR R4 bundle.
 *
 * The counts are shown before the download rather than after, so nobody has to
 * open a JSON file to find out whether it contains what they expected.
 */

/** What each row of the bundle is, in words a patient would use. */
const LABELS: Record<string, { label: string; detail: string }> = {
  Observation: { label: 'Readings', detail: 'Blood pressure, weight, glucose and the rest' },
  MedicationStatement: { label: 'Medications', detail: 'What you take, including what you have stopped' },
  Condition: { label: 'Conditions', detail: 'As recorded on your profile' },
  AllergyIntolerance: { label: 'Allergies', detail: 'As recorded on your profile' },
};

const ORDER = ['Observation', 'MedicationStatement', 'Condition', 'AllergyIntolerance'];

export function RecordExportSection() {
  const { user, profile } = useAuth();
  const { vitals, loading: loadingVitals } = useVitals();
  const { medications, isLoading: loadingMeds } = useMedications();
  const [downloading, setDownloading] = useState(false);

  const bundle = useMemo(() => {
    if (!user) return null;
    return toRecordBundle({
      patientUserId: user.id,
      vitals: (vitals ?? []) as VitalRow[],
      medications: (medications ?? []) as unknown as MedicationRecord[],
      conditions: profile?.health_conditions,
      allergies: profile?.allergies,
    });
  }, [user, vitals, medications, profile?.health_conditions, profile?.allergies]);

  const counts = useMemo(() => (bundle ? summariseRecordBundle(bundle) : {}), [bundle]);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const loading = loadingVitals || loadingMeds;

  const download = () => {
    if (!bundle) return;
    setDownloading(true);
    try {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/fhir+json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `onecare-record-${format(new Date(), 'yyyy-MM-dd')}.json`;
      // Appended before the click: Firefox ignores a click on a link that is
      // not in the document.
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Your record has been downloaded');
    } catch (err) {
      console.error('Record export failed', err);
      toast.error('Could not build that download. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Panel>
      <PanelHeader
        eyebrow="Take your record with you"
        description="Everything we hold, as a FHIR R4 bundle — the format hospitals and clinics read directly."
      />

      {loading ? (
        <PanelBody className="py-8 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </PanelBody>
      ) : (
        <PanelRows>
          {ORDER.filter((kind) => counts[kind]).map((kind) => (
            <PanelRow
              key={kind}
              glyph={
                <PanelGlyph>
                  <FileJson />
                </PanelGlyph>
              }
              label={LABELS[kind].label}
              detail={LABELS[kind].detail}
              trailing={
                <span className="text-sm font-medium tabular-nums">{counts[kind]}</span>
              }
            />
          ))}
        </PanelRows>
      )}

      {/* The action sits after the contents, so nobody downloads a file to
          find out what is in it. */}
      <PanelBody className="flex flex-col gap-3 border-t border-primary/[0.07] bg-secondary/40 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          {total === 0
            ? 'Log a reading or a medication and it will appear here, ready to take with you.'
            : 'Conditions and allergies leave as free text with no diagnostic codes attached — that is what they are, and a receiving system should not read them as confirmed. Vault documents download separately.'}
        </p>
        <Button
          className="w-full shrink-0 sm:w-auto"
          onClick={download}
          disabled={loading || total === 0 || downloading}
        >
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Download {total > 0 ? `${total} records` : 'record'}
        </Button>
      </PanelBody>
    </Panel>
  );
}
