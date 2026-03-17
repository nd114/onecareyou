import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Activity, 
  Pill, 
  TrendingUp, 
  StickyNote,
  Bell,
  Send,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  Loader2,
  Mail,
  BarChart3,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { VitalTrendChart } from '@/components/vitals/VitalTrendChart';
import { CreateGuidanceDialog } from '@/components/clinician/CreateGuidanceDialog';
import { CreateAlertRuleDialog } from '@/components/clinician/CreateAlertRuleDialog';
import { PatientRiskIndicator } from '@/components/clinician/PatientRiskIndicator';
import { PatientAdherenceAnalytics } from '@/components/clinician/PatientAdherenceAnalytics';
import { SharedDocumentsTab } from '@/components/clinician/SharedDocumentsTab';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { useClinicianGuidance } from '@/hooks/useClinicianGuidance';
import { useAlertRules } from '@/hooks/useAlertRules';
import { VITAL_CONFIG } from '@/types/health';
import { format, formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

const ClinicianPatientDetail = () => {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { patients, updatePatientNotes } = useClinicianPatients();
  const { clinicianGuidance } = useClinicianGuidance();
  const { alertRules, alertLogs } = useAlertRules();

  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Find the patient by invite code
  const patient = useMemo(() => 
    patients.find(p => p.invite_code === inviteCode),
    [patients, inviteCode]
  );

  // Fetch patient vitals
  const { data: vitals = [], isLoading: loadingVitals } = useQuery({
    queryKey: ['patient-vitals', patient?.user_id],
    queryFn: async () => {
      if (!patient?.user_id) return [];
      const { data, error } = await supabase
        .from('vitals')
        .select('*')
        .eq('user_id', patient.user_id)
        .order('recorded_at', { ascending: false })
        .limit(500);
      
      if (error) throw error;
      return data;
    },
    enabled: !!patient?.user_id,
  });

  // Fetch patient medications
  const { data: medications = [], isLoading: loadingMeds } = useQuery({
    queryKey: ['patient-medications', patient?.user_id],
    queryFn: async () => {
      if (!patient?.user_id) return [];
      const { data, error } = await supabase
        .from('medications')
        .select('*')
        .eq('user_id', patient.user_id)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data;
    },
    enabled: !!patient?.user_id && patient?.permissions?.meds,
  });

  // Fetch patient schedule entries for adherence
  const { data: scheduleEntries = [], isLoading: loadingSchedule } = useQuery({
    queryKey: ['patient-schedule', patient?.user_id],
    queryFn: async () => {
      if (!patient?.user_id) return [];
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const { data, error } = await supabase
        .from('schedule_entries')
        .select('*, medication:medications(*)')
        .eq('user_id', patient.user_id)
        .gte('scheduled_time', ninetyDaysAgo.toISOString())
        .order('scheduled_time', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!patient?.user_id && patient?.permissions?.adherence,
  });

  // Calculate adherence rate
  const adherenceRate = useMemo(() => {
    if (scheduleEntries.length === 0) return null;
    const taken = scheduleEntries.filter(e => e.status === 'taken').length;
    return Math.round((taken / scheduleEntries.length) * 100);
  }, [scheduleEntries]);

  // Filter guidance for this patient
  const patientGuidance = useMemo(() => 
    clinicianGuidance.filter(g => g.patient_user_id === patient?.user_id),
    [clinicianGuidance, patient?.user_id]
  );

  // Filter alerts for this patient
  const patientAlertRules = useMemo(() => 
    alertRules.filter(r => r.patient_user_id === patient?.user_id),
    [alertRules, patient?.user_id]
  );

  const patientAlertLogs = useMemo(() => 
    alertLogs.filter(l => l.patient_user_id === patient?.user_id),
    [alertLogs, patient?.user_id]
  );

  // Group vitals by type
  const vitalsByType = useMemo(() => {
    const grouped: Record<string, typeof vitals> = {};
    vitals.forEach(v => {
      if (!grouped[v.type]) grouped[v.type] = [];
      grouped[v.type].push(v);
    });
    return grouped;
  }, [vitals]);

  // Initialize notes
  useState(() => {
    if (patient?.clinician_notes) {
      setNotes(patient.clinician_notes);
    }
  });

  const handleSaveNotes = async () => {
    if (!patient) return;
    setSavingNotes(true);
    try {
      await updatePatientNotes.mutateAsync({ 
        shareId: patient.id, 
        notes 
      });
      toast.success('Notes saved');
    } catch (error) {
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  if (!patient) {
    return (
      <div className="min-h-screen bg-muted/30">
        <ClinicianHeader />
        <main className="container py-8">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading patient details...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <ClinicianHeader />
      
      <main className="container py-4 sm:py-8 px-4 sm:px-6">
        {/* Back Button & Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Button 
            variant="ghost" 
            className="mb-4"
            onClick={() => navigate('/clinician/dashboard')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xl font-bold text-primary">
                  {(patient.patient_name || 'P').charAt(0)}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl font-bold">
                    {patient.patient_name || 'Unknown Patient'}
                  </h1>
                  <PatientRiskIndicator 
                    vitals={vitals}
                    adherenceRate={adherenceRate || undefined}
                  />
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                  {patient.patient_email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {patient.patient_email}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <CreateGuidanceDialog
                patients={[{ id: patient.id, user_id: patient.user_id, patient_name: patient.patient_name || 'Patient' }]}
                selectedPatientId={patient.user_id}
                trigger={
                  <Button variant="outline">
                    <Send className="h-4 w-4 mr-2" />
                    Send Guidance
                  </Button>
                }
              />
              <CreateAlertRuleDialog
                patients={[{ id: patient.id, user_id: patient.user_id, patient_name: patient.patient_name || 'Patient' }]}
                selectedPatientId={patient.user_id}
                trigger={
                  <Button className="gradient-primary border-0">
                    <Bell className="h-4 w-4 mr-2" />
                    Set Alert
                  </Button>
                }
              />
            </div>
          </div>

          {/* Permission Badges */}
          <div className="flex flex-wrap gap-2 mt-4">
            {patient.permissions?.vitals && <Badge variant="secondary">Vitals Access</Badge>}
            {patient.permissions?.meds && <Badge variant="secondary">Medications Access</Badge>}
            {patient.permissions?.adherence && <Badge variant="secondary">Adherence Access</Badge>}
            {patient.permissions?.profile && <Badge variant="secondary">Profile Access</Badge>}
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{vitals.length}</p>
                  <p className="text-xs text-muted-foreground">Total Readings</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Pill className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{medications.length}</p>
                  <p className="text-xs text-muted-foreground">Active Meds</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                  (adherenceRate || 0) >= 80 ? 'bg-green-500/10' : 'bg-amber-500/10'
                }`}>
                  <TrendingUp className={`h-5 w-5 ${
                    (adherenceRate || 0) >= 80 ? 'text-green-500' : 'text-amber-500'
                  }`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{adherenceRate ?? '--'}%</p>
                  <p className="text-xs text-muted-foreground">Adherence</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{patientAlertRules.filter(r => r.is_active).length}</p>
                  <p className="text-xs text-muted-foreground">Active Alerts</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Content Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Tabs defaultValue="vitals" className="space-y-4">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="vitals">Vitals</TabsTrigger>
              <TabsTrigger value="medications">Meds</TabsTrigger>
              <TabsTrigger value="adherence">Adherence</TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                Analytics
              </TabsTrigger>
              <TabsTrigger value="guidance">Guidance</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            {/* Vitals Tab */}
            <TabsContent value="vitals">
              <Card>
                <CardHeader>
                  <CardTitle>Vital Signs History</CardTitle>
                  <CardDescription>
                    Track patient's vital signs over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingVitals ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : Object.keys(vitalsByType).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No vital signs recorded yet</p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {Object.entries(vitalsByType).map(([type, typeVitals]) => {
                        const config = VITAL_CONFIG[type as keyof typeof VITAL_CONFIG];
                        return (
                          <div key={type} className="border-b border-border pb-6 last:border-0 last:pb-0">
                            <div className="flex items-center gap-2 mb-4">
                              <h4 className="font-medium">{config?.label || type}</h4>
                              <Badge variant="outline" className="text-xs">
                                {typeVitals.length} readings
                              </Badge>
                            </div>
                            <VitalTrendChart
                              data={typeVitals.slice(0, 30) as any}
                              type={type as any}
                              title={config?.label || type}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Medications Tab */}
            <TabsContent value="medications">
              <Card>
                <CardHeader>
                  <CardTitle>Active Medications</CardTitle>
                  <CardDescription>
                    Patient's current medication regimen
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!patient.permissions?.meds ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Pill className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Medication access not granted by patient</p>
                    </div>
                  ) : loadingMeds ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : medications.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Pill className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No active medications</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {medications.map((med: any) => (
                        <div key={med.id} className="p-4 rounded-lg border">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{med.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {med.dosage} • {med.frequency}
                              </p>
                              {med.instructions && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {med.instructions}
                                </p>
                              )}
                            </div>
                            <Badge variant="secondary">{med.type}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Adherence Tab */}
            <TabsContent value="adherence">
              <Card>
                <CardHeader>
                  <CardTitle>Medication Adherence</CardTitle>
                  <CardDescription>
                    30-day adherence history
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!patient.permissions?.adherence ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Adherence access not granted by patient</p>
                    </div>
                  ) : loadingSchedule ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : scheduleEntries.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No schedule entries in the last 30 days</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Overall Stats */}
                      <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted/50">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-green-600">
                            {scheduleEntries.filter(e => e.status === 'taken').length}
                          </p>
                          <p className="text-xs text-muted-foreground">Taken</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-amber-600">
                            {scheduleEntries.filter(e => e.status === 'skipped').length}
                          </p>
                          <p className="text-xs text-muted-foreground">Skipped</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-red-600">
                            {scheduleEntries.filter(e => e.status === 'missed').length}
                          </p>
                          <p className="text-xs text-muted-foreground">Missed</p>
                        </div>
                      </div>

                      {/* Recent Entries */}
                      <div className="space-y-2">
                        {scheduleEntries.slice(0, 20).map((entry: any) => (
                          <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              {entry.status === 'taken' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : entry.status === 'skipped' ? (
                                <Clock className="h-4 w-4 text-amber-500" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                              )}
                              <div>
                                <p className="font-medium text-sm">{entry.medication?.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(entry.scheduled_time), 'MMM d, h:mm a')}
                                </p>
                              </div>
                            </div>
                            <Badge 
                              variant={entry.status === 'taken' ? 'default' : 'secondary'}
                              className="capitalize"
                            >
                              {entry.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics">
              {!patient.permissions?.adherence ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">Adherence access not granted by patient</p>
                  </CardContent>
                </Card>
              ) : loadingSchedule ? (
                <Card>
                  <CardContent className="py-12">
                    <div className="flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <PatientAdherenceAnalytics
                  scheduleEntries={scheduleEntries}
                  medications={medications}
                  patientName={patient.patient_name || 'Patient'}
                  patientId={patient.user_id}
                  isLoading={loadingSchedule}
                />
              )}
            </TabsContent>

            {/* Guidance Tab */}
            <TabsContent value="guidance">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Guidance History</CardTitle>
                    <CardDescription>
                      Instructions and guidance sent to this patient
                    </CardDescription>
                  </div>
                  <CreateGuidanceDialog
                    patients={[{ id: patient.id, user_id: patient.user_id, patient_name: patient.patient_name || 'Patient' }]}
                    selectedPatientId={patient.user_id}
                    trigger={<Button size="sm"><Send className="h-4 w-4 mr-2" />Send</Button>}
                  />
                </CardHeader>
                <CardContent>
                  {patientGuidance.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No guidance sent to this patient yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {patientGuidance.map((guidance) => (
                        <div key={guidance.id} className="p-4 rounded-lg border">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium">{guidance.title}</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                {guidance.instruction}
                              </p>
                              <p className="text-xs text-muted-foreground mt-2">
                                Sent {formatDistanceToNow(new Date(guidance.created_at))} ago
                              </p>
                            </div>
                            <Badge 
                              variant={
                                guidance.status === 'completed' ? 'default' :
                                guidance.status === 'acknowledged' ? 'secondary' :
                                'outline'
                              }
                              className="capitalize"
                            >
                              {guidance.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notes Tab */}
            <TabsContent value="notes">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <StickyNote className="h-5 w-5" />
                    Clinical Notes
                  </CardTitle>
                  <CardDescription>
                    Private notes about this patient (only visible to you)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Add notes about this patient's care, observations, or follow-up items..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={8}
                  />
                  <div className="flex justify-end">
                    <Button 
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                      className="gradient-primary border-0"
                    >
                      {savingNotes ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Notes'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </div>
  );
};

export default ClinicianPatientDetail;
