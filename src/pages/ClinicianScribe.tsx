import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Search, ArrowRight } from 'lucide-react';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';

/**
 * The front door to the scribe.
 *
 * It used to be buried three levels inside one patient's Encounters tab, which
 * means in a real clinic nobody would ever find it. Here the clinician says who
 * they are seeing, and the recorder opens against that patient's note. Nothing
 * about the note itself changes: the draft is unsigned, they edit it, they
 * choose which parts to keep.
 */
const ClinicianScribe = () => {
  const navigate = useNavigate();
  const { patients } = useClinicianPatients();
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const active = patients.filter((p) => p.share_active !== false);
    if (!term) return active.slice(0, 8);
    return active
      .filter(
        (p) =>
          (p.patient_name || '').toLowerCase().includes(term) ||
          (p.patient_email || '').toLowerCase().includes(term),
      )
      .slice(0, 12);
  }, [patients, q]);

  return (
    <div className="min-h-screen bg-muted/30">
      <ClinicianHeader />
      <SectionTabs section="today" variant="clinician" />
      <main className="container max-w-2xl py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" /> Record a visit note
            </CardTitle>
            <CardDescription>
              Choose who you are seeing. The recorder opens on their note, listens while you
              talk, and drafts the note for you to check and sign.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search your patients by name or email"
                className="pl-9"
              />
            </div>

            {results.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No matching patient. Only people connected to you appear here.
              </p>
            ) : (
              <div className="space-y-2">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      navigate(`/clinician/patients/${p.invite_code}?tab=encounters&scribe=1`)
                    }
                    className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {p.patient_name || 'Unnamed patient'}
                      </p>
                      {p.patient_email && (
                        <p className="truncate text-xs text-muted-foreground">{p.patient_email}</p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Everyone in the room should know they are being recorded. Nothing is added to the
              record until you approve it.
            </p>
            <Button variant="ghost" size="sm" onClick={() => navigate('/clinician/today')}>
              Back to Today
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ClinicianScribe;
