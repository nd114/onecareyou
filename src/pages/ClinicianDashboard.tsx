import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Send,
  Bell,
  Clock,
  CheckCircle,
  AlertTriangle,
  Activity,
  Loader2,
  Plus,
  Settings,
  FileText,
  RefreshCw,
  StickyNote,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header } from '@/components/layout/Header';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { useClinicianGuidance } from '@/hooks/useClinicianGuidance';
import { useAlertRules } from '@/hooks/useAlertRules';
import { PatientNotesDialog } from '@/components/clinician/PatientNotesDialog';

const ClinicianDashboard = () => {
  const navigate = useNavigate();
  const { clinicianProfile, isLoading: isLoadingProfile, isClinician } = useClinicianProfile();
  const { patients, isLoading: isLoadingPatients, autoClaimShares, updatePatientNotes } = useClinicianPatients();
  const { clinicianGuidance, isLoading: isLoadingGuidance } = useClinicianGuidance();
  const { alertRules, alertLogs, isLoading: isLoadingAlerts } = useAlertRules();
  
  const [notesDialog, setNotesDialog] = useState<{
    open: boolean;
    patientId: string;
    patientName: string;
    notes: string;
  }>({ open: false, patientId: '', patientName: '', notes: '' });

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
        <Header />
        <main className="container py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (!isClinician) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
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
      <Header />
      
      <main className="container py-4 sm:py-8 px-4 sm:px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
            Welcome back, Doctor
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {clinicianProfile?.practice_name && `${clinicianProfile.practice_name} • `}
            {clinicianProfile?.specialty && `${clinicianProfile.specialty} • `}
            Manage your patients and monitor their health
          </p>
        </motion.div>

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
            <TabsList className="grid w-full grid-cols-4">
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
              <TabsTrigger value="settings" className="text-xs sm:text-sm">
                <Settings className="h-4 w-4 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Settings</span>
              </TabsTrigger>
            </TabsList>

            {/* Patients Tab */}
            <TabsContent value="patients">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Your Patients</CardTitle>
                    <CardDescription>
                      Patients who have shared their health data with you
                    </CardDescription>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => autoClaimShares.mutate()}
                    disabled={autoClaimShares.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${autoClaimShares.isPending ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
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
                  ) : (
                    <div className="space-y-3">
                      {patients.map((patient) => (
                        <div
                          key={patient.id}
                          className="p-4 rounded-lg border hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-center justify-between">
                            <div 
                              className="flex items-center gap-3 flex-1 cursor-pointer"
                              onClick={() => navigate(`/clinician/patient/${patient.invite_code}`)}
                            >
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="font-semibold text-primary">
                                  {patient.provider_name.charAt(0)}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium">{patient.provider_name}</p>
                                <div className="flex gap-1 mt-1">
                                  {patient.permissions.vitals && <Badge variant="secondary" className="text-xs">Vitals</Badge>}
                                  {patient.permissions.meds && <Badge variant="secondary" className="text-xs">Meds</Badge>}
                                  {patient.permissions.adherence && <Badge variant="secondary" className="text-xs">Adherence</Badge>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNotesDialog({
                                    open: true,
                                    patientId: patient.id,
                                    patientName: patient.provider_name,
                                    notes: patient.clinician_notes || '',
                                  });
                                }}
                                title="Patient notes"
                              >
                                <StickyNote className={`h-4 w-4 ${patient.clinician_notes ? 'text-primary' : 'text-muted-foreground'}`} />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => navigate(`/clinician/patient/${patient.invite_code}`)}
                              >
                                View
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

            {/* Guidance Tab */}
            <TabsContent value="guidance">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Patient Guidance</CardTitle>
                    <CardDescription>
                      Send instructions and guidance to your patients
                    </CardDescription>
                  </div>
                  <Button className="gradient-primary border-0" disabled>
                    <Plus className="h-4 w-4 mr-2" />
                    New Guidance
                  </Button>
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
                        <div key={guidance.id} className="p-4 rounded-lg border">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium">{guidance.title}</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                {guidance.instruction.substring(0, 100)}...
                              </p>
                              <div className="flex gap-2 mt-2">
                                <Badge variant={
                                  guidance.status === 'completed' ? 'default' :
                                  guidance.status === 'acknowledged' ? 'secondary' :
                                  'outline'
                                }>
                                  {guidance.status}
                                </Badge>
                                <Badge variant="outline">{guidance.priority}</Badge>
                              </div>
                            </div>
                            {guidance.status === 'completed' && (
                              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                            )}
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
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Alert Rules</CardTitle>
                    <CardDescription>
                      Set up automatic alerts for patient vitals
                    </CardDescription>
                  </div>
                  <Button className="gradient-primary border-0" disabled>
                    <Plus className="h-4 w-4 mr-2" />
                    New Rule
                  </Button>
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
                        <div key={rule.id} className="p-4 rounded-lg border">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{rule.vital_type}</p>
                              <p className="text-sm text-muted-foreground">
                                Alert when {rule.condition} {rule.threshold_value}
                                {rule.threshold_secondary && `/${rule.threshold_secondary}`}
                              </p>
                            </div>
                            <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                              {rule.is_active ? 'Active' : 'Disabled'}
                            </Badge>
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
                          <div>
                            <p className="text-sm font-medium">{log.alert_type}</p>
                            <p className="text-xs text-muted-foreground">{log.message}</p>
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

            {/* Settings Tab */}
            <TabsContent value="settings">
              <Card>
                <CardHeader>
                  <CardTitle>Clinician Profile</CardTitle>
                  <CardDescription>
                    Your professional information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Practice Name</p>
                      <p className="font-medium">{clinicianProfile?.practice_name || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Specialty</p>
                      <p className="font-medium">{clinicianProfile?.specialty || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">License Number</p>
                      <p className="font-medium">{clinicianProfile?.license_number || 'Not provided'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Country</p>
                      <p className="font-medium">{clinicianProfile?.country || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Verification Status</p>
                      <Badge variant={clinicianProfile?.is_verified ? 'default' : 'secondary'}>
                        {clinicianProfile?.is_verified ? 'Verified' : 'Trust-based'}
                      </Badge>
                    </div>
                  </div>
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
