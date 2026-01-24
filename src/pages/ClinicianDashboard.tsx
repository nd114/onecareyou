import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Send,
  Bell,
  BellRing,
  Clock,
  CheckCircle,
  AlertTriangle,
  Activity,
  Loader2,
  Plus,
  FileText,
  RefreshCw,
  StickyNote,
  Search,
  Mail,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { useClinicianGuidance } from '@/hooks/useClinicianGuidance';
import { useAlertRules } from '@/hooks/useAlertRules';
import { usePatientVitalsSummaries } from '@/hooks/usePatientVitalsSummaries';
import { useClinicianSubscription } from '@/hooks/useClinicianSubscription';
import { PatientNotesDialog } from '@/components/clinician/PatientNotesDialog';
import { CreateGuidanceDialog } from '@/components/clinician/CreateGuidanceDialog';
import { CreateAlertRuleDialog } from '@/components/clinician/CreateAlertRuleDialog';
import { PatientRiskIndicator } from '@/components/clinician/PatientRiskIndicator';
import { PatientQuickActions } from '@/components/clinician/PatientQuickActions';
import { InvitePatientDialog } from '@/components/clinician/InvitePatientDialog';
import { PatientLimitBanner } from '@/components/clinician/PatientLimitBanner';

const ClinicianDashboard = () => {
  const navigate = useNavigate();
  const { clinicianProfile, isLoading: isLoadingProfile, isClinician } = useClinicianProfile();
  const { patients, isLoading: isLoadingPatients, autoClaimShares, updatePatientNotes } = useClinicianPatients();
  const { clinicianGuidance, isLoading: isLoadingGuidance, deleteGuidance } = useClinicianGuidance();
  const { alertRules, alertLogs, isLoading: isLoadingAlerts, deleteAlertRule, toggleAlertRule } = useAlertRules();
  const { patientLimit, tier, isTrial } = useClinicianSubscription();
  // Get patient user IDs for vitals summaries
  const patientUserIds = useMemo(() => patients.map(p => p.user_id), [patients]);
  const { data: vitalsSummaries = [] } = usePatientVitalsSummaries(patientUserIds);
  
  // Create a map for quick lookup
  const vitalsByPatient = useMemo(() => {
    const map: Record<string, { vitals: any[]; adherenceRate?: number }> = {};
    vitalsSummaries.forEach(summary => {
      map[summary.userId] = {
        vitals: summary.vitals,
        adherenceRate: summary.adherenceRate,
      };
    });
    return map;
  }, [vitalsSummaries]);
  
  const [notesDialog, setNotesDialog] = useState<{
    open: boolean;
    patientId: string;
    patientName: string;
    notes: string;
  }>({ open: false, patientId: '', patientName: '', notes: '' });

  const [patientSearch, setPatientSearch] = useState('');

  // Filter patients based on search
  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients;
    const searchLower = patientSearch.toLowerCase();
    return patients.filter(
      (p) =>
        (p.patient_name || '').toLowerCase().includes(searchLower) ||
        (p.patient_email || '').toLowerCase().includes(searchLower)
    );
  }, [patients, patientSearch]);

  const isLoading = isLoadingProfile || isLoadingPatients || isLoadingGuidance || isLoadingAlerts;

  // Auto-claim shares on mount
  useEffect(() => {
    if (isClinician && !isLoading) {
      autoClaimShares.mutate();
    }
  }, [isClinician, isLoading]);

  const patientCount = patients.length;
  const pendingGuidanceCount = clinicianGuidance.filter(g => g.status === 'pending').length;
  const activeAlertRules = alertRules.filter(r => r.is_active).length;
  const recentAlerts = alertLogs.slice(0, 5);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <ClinicianHeader />
        <main className="container py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (!isClinician) {
    return (
      <div className="min-h-screen bg-muted/30">
        <ClinicianHeader />
        <main className="container py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto text-center"
          >
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Users className="h-10 w-10 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-bold mb-4">
              Clinician Dashboard
            </h1>
            <p className="text-muted-foreground mb-8">
              This dashboard is for healthcare providers. Please sign up as a clinician to access these features.
            </p>
            <Button 
              className="gradient-primary border-0"
              onClick={() => navigate('/clinician/sign-up')}
            >
              Register as Healthcare Provider
            </Button>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <ClinicianHeader />
      
      <main className="container py-4 sm:py-8 px-4 sm:px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
            Welcome back{clinicianProfile?.title ? `, ${clinicianProfile.title}` : ''}{clinicianProfile?.last_name ? ` ${clinicianProfile.last_name}` : ''}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {clinicianProfile?.practice_name && `${clinicianProfile.practice_name} • `}
            {clinicianProfile?.specialty && `${clinicianProfile.specialty} • `}
            Manage your patients and monitor their health
          </p>
        </motion.div>

        {/* Patient Limit Banner - shows when near/at limit */}
        <PatientLimitBanner patientCount={patientCount} />

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6"
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{patientCount}</p>
                  <p className="text-xs text-muted-foreground">Patients</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingGuidanceCount}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeAlertRules}</p>
                  <p className="text-xs text-muted-foreground">Alert Rules</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{recentAlerts.length}</p>
                  <p className="text-xs text-muted-foreground">Recent Alerts</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Tabs defaultValue="patients" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="patients" className="text-xs sm:text-sm">
                <Users className="h-4 w-4 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Patients</span>
              </TabsTrigger>
              <TabsTrigger value="guidance" className="text-xs sm:text-sm">
                <Send className="h-4 w-4 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Guidance</span>
              </TabsTrigger>
              <TabsTrigger value="alerts" className="text-xs sm:text-sm">
                <Bell className="h-4 w-4 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Alerts</span>
              </TabsTrigger>
            </TabsList>

            {/* Patients Tab */}
            <TabsContent value="patients">
              <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Your Patients</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Patients who have shared their health data with you
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <InvitePatientDialog 
                      disabled={patientCount >= patientLimit}
                      disabledReason={`You've reached your limit of ${patientLimit} patients. Upgrade to add more.`}
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="h-8 px-3 text-xs"
                      onClick={() => autoClaimShares.mutate()}
                      disabled={autoClaimShares.isPending}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 sm:mr-2 ${autoClaimShares.isPending ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Search Input */}
                  {patients.length > 0 && (
                    <div className="mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search patients by name or email..."
                          value={patientSearch}
                          onChange={(e) => setPatientSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                  )}

                  {patients.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold mb-2">No patients yet</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        When patients share their health data with your email address, they'll appear here automatically.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Tip: Ask patients to add your email in their Care Circle settings
                      </p>
                    </div>
                  ) : filteredPatients.length === 0 ? (
                    <div className="text-center py-8">
                      <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold mb-2">No matching patients</h3>
                      <p className="text-sm text-muted-foreground">
                        Try a different search term
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredPatients.map((patient) => {
                        const patientData = vitalsByPatient[patient.user_id];
                        
                        return (
                          <div
                            key={patient.id}
                            className="p-3 sm:p-4 rounded-lg border hover:shadow-sm transition-shadow"
                          >
                            <div className="flex flex-col gap-3">
                              {/* Patient Info Row */}
                              <div className="flex items-start gap-3">
                                <div 
                                  className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                                  onClick={() => navigate(`/clinician/patients/${patient.invite_code}`)}
                                >
                                  <div className="h-10 w-10 flex-shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                                    <span className="font-semibold text-primary">
                                      {(patient.patient_name || 'Unknown Patient').charAt(0)}
                                    </span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-medium truncate">{patient.patient_name || 'Unknown Patient'}</p>
                                      {patientData?.vitals && patientData.vitals.length > 0 && (
                                        <PatientRiskIndicator 
                                          vitals={patientData.vitals}
                                          adherenceRate={patientData.adherenceRate}
                                        />
                                      )}
                                    </div>
                                    {patient.patient_email && (
                                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                        <Mail className="h-3 w-3 flex-shrink-0" />
                                        <span className="truncate">{patient.patient_email}</span>
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {patient.permissions.vitals && <Badge variant="secondary" className="text-xs">Vitals</Badge>}
                                      {patient.permissions.meds && <Badge variant="secondary" className="text-xs">Meds</Badge>}
                                      {patient.permissions.adherence && <Badge variant="secondary" className="text-xs">Adherence</Badge>}
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Notes Button */}
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-8 w-8 flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNotesDialog({
                                      open: true,
                                      patientId: patient.id,
                                      patientName: patient.patient_name,
                                      notes: patient.clinician_notes || '',
                                    });
                                  }}
                                  title="Patient notes"
                                >
                                  <StickyNote className={`h-4 w-4 ${patient.clinician_notes ? 'text-primary' : 'text-muted-foreground'}`} />
                                </Button>
                              </div>
                              
                              {/* Quick Actions Row */}
                              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                                <PatientQuickActions
                                  patient={{
                                    id: patient.id,
                                    user_id: patient.user_id,
                                    patient_name: patient.patient_name,
                                    patient_email: patient.patient_email,
                                  }}
                                  onViewNotes={() => setNotesDialog({
                                    open: true,
                                    patientId: patient.id,
                                    patientName: patient.patient_name,
                                    notes: patient.clinician_notes || '',
                                  })}
                                />
                                <Button 
                                  variant="default" 
                                  size="sm"
                                  className="h-8 px-3 text-xs gradient-primary border-0"
                                  onClick={() => navigate(`/clinician/patients/${patient.invite_code}`)}
                                >
                                  View Details
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Guidance Tab */}
            <TabsContent value="guidance">
              <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Patient Guidance</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Send instructions and guidance to your patients
                    </CardDescription>
                  </div>
                  <CreateGuidanceDialog
                    trigger={
                      <Button className="gradient-primary border-0 h-8 sm:h-9 px-3 text-xs sm:text-sm w-full sm:w-auto" disabled={patients.length === 0}>
                        <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                        New Guidance
                      </Button>
                    }
                    patients={patients.map(p => ({ id: p.id, user_id: p.user_id, patient_name: p.patient_name, patient_email: p.patient_email }))}
                  />
                </CardHeader>
                <CardContent>
                  {clinicianGuidance.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold mb-2">No guidance sent yet</h3>
                      <p className="text-sm text-muted-foreground">
                        Send instructions to patients for them to follow
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {clinicianGuidance.map((guidance) => (
                        <div key={guidance.id} className="p-3 sm:p-4 rounded-lg border">
                          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm sm:text-base truncate">{guidance.title}</p>
                              <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
                                {guidance.instruction}
                              </p>
                              <div className="flex flex-wrap gap-1 sm:gap-2 mt-2">
                                <Badge variant={
                                  guidance.status === 'completed' ? 'default' :
                                  guidance.status === 'acknowledged' ? 'secondary' :
                                  'outline'
                                } className="text-xs">
                                  {guidance.status}
                                </Badge>
                                <Badge variant="outline" className="text-xs">{guidance.priority}</Badge>
                                <Badge variant="outline" className="text-xs">{guidance.category}</Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-start flex-shrink-0">
                              {guidance.status === 'completed' && (
                                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => deleteGuidance.mutate(guidance.id)}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Alerts Tab */}
            <TabsContent value="alerts">
              <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Alert Rules</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Set up automatic alerts for patient vitals
                    </CardDescription>
                  </div>
                  <CreateAlertRuleDialog
                    trigger={
                      <Button className="gradient-primary border-0 h-8 sm:h-9 px-3 text-xs sm:text-sm w-full sm:w-auto" disabled={patients.length === 0}>
                        <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                        New Rule
                      </Button>
                    }
                    patients={patients.map(p => ({ id: p.id, user_id: p.user_id, patient_name: p.patient_name, patient_email: p.patient_email }))}
                  />
                </CardHeader>
                <CardContent>
                  {alertRules.length === 0 ? (
                    <div className="text-center py-8">
                      <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold mb-2">No alert rules configured</h3>
                      <p className="text-sm text-muted-foreground">
                        Create rules to be notified when patient vitals are outside normal ranges
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {alertRules.map((rule) => (
                        <div key={rule.id} className="p-3 sm:p-4 rounded-lg border">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm sm:text-base capitalize">{rule.vital_type.replace('_', ' ')}</p>
                              <p className="text-xs sm:text-sm text-muted-foreground">
                                Alert when {rule.condition} {rule.threshold_value}
                                {rule.threshold_secondary && ` - ${rule.threshold_secondary}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                              <Switch
                                checked={rule.is_active}
                                onCheckedChange={(checked) => toggleAlertRule.mutate({ id: rule.id, is_active: checked })}
                              />
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => deleteAlertRule.mutate(rule.id)}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Alert Logs */}
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Recent Alerts</CardTitle>
                  <CardDescription>
                    Alerts triggered by patient data
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {alertLogs.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">
                      No alerts triggered yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {alertLogs.map((log) => (
                        <div key={log.id} className="p-3 rounded-lg bg-muted/50 flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium capitalize">
                              {log.alert_type.replace(/_/g, ' ')}
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{log.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(log.sent_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
      
      {/* Patient Notes Dialog */}
      <PatientNotesDialog
        open={notesDialog.open}
        onOpenChange={(open) => setNotesDialog(prev => ({ ...prev, open }))}
        patientName={notesDialog.patientName}
        initialNotes={notesDialog.notes}
        onSave={async (notes) => {
          await updatePatientNotes.mutateAsync({
            shareId: notesDialog.patientId,
            notes,
          });
        }}
        isSaving={updatePatientNotes.isPending}
      />
    </div>
  );
};

export default ClinicianDashboard;
