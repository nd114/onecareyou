import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Activity, Pill, NotebookPen, Printer, Plus, Loader2, Trash2, User,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { EditManagedRecordDialog } from '@/components/clinician/EditManagedRecordDialog';
import { InviteToOneCareButton } from '@/components/clinician/ManagedRecordActions';
import {
  useClinicianPatientRecords,
  type ManagedVisit,
  type ManagedVital,
} from '@/hooks/useClinicianPatientRecords';
import { formatDateOnly } from '@/lib/date-only';
import { toast } from 'sonner';

const VITAL_TYPES = [
  { value: 'blood_pressure', label: 'Blood pressure', unit: 'mmHg' },
  { value: 'heart_rate', label: 'Heart rate', unit: 'bpm' },
  { value: 'temperature', label: 'Temperature', unit: '°C' },
  { value: 'weight', label: 'Weight', unit: 'kg' },
  { value: 'glucose', label: 'Glucose', unit: 'mg/dL' },
  { value: 'oxygen_saturation', label: 'Oxygen saturation', unit: '%' },
  { value: 'respiratory_rate', label: 'Respiratory rate', unit: 'breaths/min' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

const ClinicianManagedRecord = () => {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const { records, isLoading, updateRecord } = useClinicianPatientRecords();

  const record = useMemo(() => records.find((r) => r.id === recordId), [records, recordId]);

  const [vitalType, setVitalType] = useState('blood_pressure');
  const [vitalValue, setVitalValue] = useState('');
  const [vitalDate, setVitalDate] = useState(todayISO());
  const [vitalNote, setVitalNote] = useState('');

  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medFrequency, setMedFrequency] = useState('');

  const [visitDate, setVisitDate] = useState(todayISO());
  const [visitReason, setVisitReason] = useState('');
  const [visitFindings, setVisitFindings] = useState('');
  const [visitPlan, setVisitPlan] = useState('');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <ClinicianHeader />
        <main className="container mx-auto px-4 py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen bg-background">
        <ClinicianHeader />
        <main className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-xl font-semibold mb-2">Chart not found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This managed record may have been removed.
          </p>
          <Button onClick={() => navigate('/clinician/patients')}>Back to patients</Button>
        </main>
      </div>
    );
  }

  const vitals = [...(record.vitals_history || [])].sort(
    (a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || ''),
  );
  const visits = [...(record.visits || [])].sort(
    (a, b) => (b.visit_date || '').localeCompare(a.visit_date || ''),
  );

  const save = async (updates: Record<string, unknown>) => {
    await updateRecord.mutateAsync({ id: record.id, ...updates } as any);
  };

  const addVital = async () => {
    if (!vitalValue.trim()) {
      toast.error('Enter a reading first');
      return;
    }
    const unit = VITAL_TYPES.find((v) => v.value === vitalType)?.unit;
    const entry: ManagedVital = {
      recorded_at: vitalDate,
      type: vitalType,
      value: vitalValue.trim(),
      unit,
      note: vitalNote.trim() || undefined,
    };
    await save({ vitals_history: [...(record.vitals_history || []), entry] });
    setVitalValue('');
    setVitalNote('');
  };

  const removeVital = async (index: number) => {
    const next = (record.vitals_history || []).filter((_, i) => i !== index);
    await save({ vitals_history: next });
  };

  const addMedication = async () => {
    if (!medName.trim()) {
      toast.error('Enter a medication name');
      return;
    }
    const next = [
      ...(record.medications || []),
      { name: medName.trim(), dosage: medDosage.trim() || undefined, frequency: medFrequency.trim() || undefined },
    ];
    await save({ medications: next });
    setMedName('');
    setMedDosage('');
    setMedFrequency('');
  };

  const removeMedication = async (index: number) => {
    await save({ medications: (record.medications || []).filter((_, i) => i !== index) });
  };

  const addVisit = async () => {
    if (!visitReason.trim()) {
      toast.error('Add a reason for the visit');
      return;
    }
    const entry: ManagedVisit = {
      id: crypto.randomUUID(),
      visit_date: visitDate,
      reason: visitReason.trim(),
      findings: visitFindings.trim() || undefined,
      plan: visitPlan.trim() || undefined,
      recorded_at: new Date().toISOString(),
    };
    await save({ visits: [...(record.visits || []), entry] });
    setVisitReason('');
    setVisitFindings('');
    setVisitPlan('');
  };

  const vitalLabel = (type: string) =>
    VITAL_TYPES.find((v) => v.value === type)?.label ?? type.replace(/_/g, ' ');

  return (
    <div className="min-h-screen bg-background">
      <div className="print:hidden">
        <ClinicianHeader />
      </div>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 gap-1.5 print:hidden"
          onClick={() => navigate('/clinician/patients')}
        >
          <ArrowLeft className="h-4 w-4" /> Back to patients
        </Button>

        <Card className="mb-6">
          <CardHeader className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-full bg-accent/50 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">{record.patient_name}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {[
                    record.date_of_birth ? `DOB ${formatDateOnly(record.date_of_birth)}` : null,
                    record.gender || null,
                    record.blood_type ? `Blood type ${record.blood_type}` : null,
                    record.patient_phone || null,
                    record.patient_email || null,
                  ].filter(Boolean).join(' · ') || 'No identity details recorded yet'}
                </CardDescription>
                <div className="flex flex-wrap gap-1 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {record.data_sharing_model.replace(/_/g, ' ')}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {record.invitation_status.replace(/_/g, ' ')}
                  </Badge>
                  {(record.tags || []).map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <InviteToOneCareButton record={record} />
              <EditManagedRecordDialog record={record} />
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print summary
              </Button>
            </div>
          </CardHeader>
          {(record.allergies?.length > 0 || record.health_conditions?.length > 0) && (
            <CardContent className="grid gap-4 sm:grid-cols-2 pt-0">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Allergies</p>
                <p className="text-sm">{record.allergies?.length ? record.allergies.join(', ') : 'None recorded'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Conditions</p>
                <p className="text-sm">
                  {record.health_conditions?.length ? record.health_conditions.join(', ') : 'None recorded'}
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        <Tabs defaultValue="visits" className="print:hidden">
          <TabsList className="mb-4">
            <TabsTrigger value="visits" className="gap-1.5">
              <NotebookPen className="h-4 w-4" /> Visits ({visits.length})
            </TabsTrigger>
            <TabsTrigger value="vitals" className="gap-1.5">
              <Activity className="h-4 w-4" /> Vitals ({vitals.length})
            </TabsTrigger>
            <TabsTrigger value="medications" className="gap-1.5">
              <Pill className="h-4 w-4" /> Medications ({record.medications?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visits">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Record a visit</CardTitle>
                <CardDescription className="text-xs">
                  A simple visit log for clinic days — no EHR needed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="visit-date">Date</Label>
                    <Input id="visit-date" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="visit-reason">Reason for visit</Label>
                    <Input
                      id="visit-reason"
                      value={visitReason}
                      onChange={(e) => setVisitReason(e.target.value)}
                      placeholder="Follow-up, new complaint…"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="visit-findings">Findings</Label>
                    <Textarea
                      id="visit-findings"
                      value={visitFindings}
                      onChange={(e) => setVisitFindings(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="visit-plan">Plan</Label>
                    <Textarea
                      id="visit-plan"
                      value={visitPlan}
                      onChange={(e) => setVisitPlan(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <Button onClick={addVisit} disabled={updateRecord.isPending} className="gap-1.5">
                  {updateRecord.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add visit
                </Button>

                <div className="space-y-3 pt-2">
                  {visits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No visits recorded yet.</p>
                  ) : (
                    visits.map((visit) => (
                      <div key={visit.id} className="p-3 rounded-lg border">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">{visit.reason}</p>
                          <span className="text-xs text-muted-foreground">{formatDateOnly(visit.visit_date)}</span>
                        </div>
                        {visit.findings && (
                          <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-medium">Findings:</span> {visit.findings}
                          </p>
                        )}
                        {visit.plan && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <span className="font-medium">Plan:</span> {visit.plan}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vitals">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Record a reading</CardTitle>
                <CardDescription className="text-xs">
                  Readings you take yourself, stored on this chart.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <Label>Type</Label>
                    <Select value={vitalType} onValueChange={setVitalType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VITAL_TYPES.map((v) => (
                          <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="vital-value">Reading</Label>
                    <Input
                      id="vital-value"
                      value={vitalValue}
                      onChange={(e) => setVitalValue(e.target.value)}
                      placeholder="e.g. 128/82"
                    />
                  </div>
                  <div>
                    <Label htmlFor="vital-date">Date</Label>
                    <Input id="vital-date" type="date" value={vitalDate} onChange={(e) => setVitalDate(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="vital-note">Note</Label>
                    <Input id="vital-note" value={vitalNote} onChange={(e) => setVitalNote(e.target.value)} />
                  </div>
                </div>
                <Button onClick={addVital} disabled={updateRecord.isPending} className="gap-1.5">
                  {updateRecord.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add reading
                </Button>

                <div className="space-y-2 pt-2">
                  {vitals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No readings recorded yet.</p>
                  ) : (
                    vitals.map((vital, i) => (
                      <div key={`${vital.recorded_at}-${i}`} className="flex items-center justify-between gap-2 p-3 rounded-lg border">
                        <div>
                          <p className="text-sm font-medium">
                            {vitalLabel(vital.type)}: {vital.value} {vital.unit || ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {vital.recorded_at ? formatDateOnly(vital.recorded_at) : 'Undated'}
                            {vital.note ? ` · ${vital.note}` : ''}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeVital((record.vitals_history || []).indexOf(vital))}
                          aria-label="Remove reading"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="medications">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Medications on this chart</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="med-name">Name</Label>
                    <Input id="med-name" value={medName} onChange={(e) => setMedName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="med-dosage">Dosage</Label>
                    <Input id="med-dosage" value={medDosage} onChange={(e) => setMedDosage(e.target.value)} placeholder="500 mg" />
                  </div>
                  <div>
                    <Label htmlFor="med-frequency">Frequency</Label>
                    <Input id="med-frequency" value={medFrequency} onChange={(e) => setMedFrequency(e.target.value)} placeholder="Twice daily" />
                  </div>
                </div>
                <Button onClick={addMedication} disabled={updateRecord.isPending} className="gap-1.5">
                  {updateRecord.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add medication
                </Button>

                <div className="space-y-2 pt-2">
                  {(record.medications || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No medications recorded yet.</p>
                  ) : (
                    (record.medications || []).map((med, i) => (
                      <div key={`${med.name}-${i}`} className="flex items-center justify-between gap-2 p-3 rounded-lg border">
                        <div>
                          <p className="text-sm font-medium">{med.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[med.dosage, med.frequency].filter(Boolean).join(' · ') || 'No dosage recorded'}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMedication(i)}
                          aria-label="Remove medication"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Printable summary sheet */}
        <div className="hidden print:block text-sm">
          <h2 className="text-base font-semibold mb-2">Patient summary sheet</h2>
          <p className="mb-3">{record.patient_name}</p>
          <h3 className="font-semibold mt-4 mb-1">Medications</h3>
          {(record.medications || []).length === 0 ? <p>None recorded</p> : (
            <ul className="list-disc pl-5">
              {(record.medications || []).map((m, i) => (
                <li key={i}>{[m.name, m.dosage, m.frequency].filter(Boolean).join(' · ')}</li>
              ))}
            </ul>
          )}
          <h3 className="font-semibold mt-4 mb-1">Recent readings</h3>
          {vitals.length === 0 ? <p>None recorded</p> : (
            <ul className="list-disc pl-5">
              {vitals.slice(0, 10).map((v, i) => (
                <li key={i}>
                  {vitalLabel(v.type)}: {v.value} {v.unit || ''} ({v.recorded_at ? formatDateOnly(v.recorded_at) : 'undated'})
                </li>
              ))}
            </ul>
          )}
          <h3 className="font-semibold mt-4 mb-1">Visit log</h3>
          {visits.length === 0 ? <p>None recorded</p> : (
            <ul className="list-disc pl-5">
              {visits.slice(0, 10).map((v) => (
                <li key={v.id}>
                  {formatDateOnly(v.visit_date)} — {v.reason}
                  {v.plan ? ` · Plan: ${v.plan}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
};

export default ClinicianManagedRecord;
