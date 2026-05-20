import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Loader2,
  RefreshCw,
  StickyNote,
  Search,
  Mail,
  Upload,
  Database,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { usePatientVitalsSummaries } from '@/hooks/usePatientVitalsSummaries';
import { useClinicianSubscription } from '@/hooks/useClinicianSubscription';
import { PatientNotesDialog } from '@/components/clinician/PatientNotesDialog';
import { PatientRiskIndicator } from '@/components/clinician/PatientRiskIndicator';
import { PatientQuickActions } from '@/components/clinician/PatientQuickActions';
import { InvitePatientDialog } from '@/components/clinician/InvitePatientDialog';
import { PatientLimitBanner } from '@/components/clinician/PatientLimitBanner';
import { BulkPatientActions, PatientSelectCheckbox } from '@/components/clinician/BulkPatientActions';
import { useClinicianPatientRecords } from '@/hooks/useClinicianPatientRecords';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InviteToOneCareButton, PatientTagManager } from '@/components/clinician/ManagedRecordActions';
import { EditManagedRecordDialog } from '@/components/clinician/EditManagedRecordDialog';
import { ManagedRecordFilterBar, applyManagedRecordFilters, type ManagedRecordFilters } from '@/components/clinician/ManagedRecordFilters';

const ClinicianPatients = () => {
  const navigate = useNavigate();
  const { clinicianProfile, isLoading: isLoadingProfile, isClinician } = useClinicianProfile();
  const { patients, isLoading: isLoadingPatients, autoClaimShares, updatePatientNotes } = useClinicianPatients();
  const { records: managedRecords, isLoading: isLoadingRecords } = useClinicianPatientRecords();
  const { patientLimit } = useClinicianSubscription();
  
  const patientUserIds = useMemo(() => patients.map(p => p.user_id), [patients]);
  const { data: vitalsSummaries = [] } = usePatientVitalsSummaries(patientUserIds);
  
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
  const [selectedPatientIds, setSelectedPatientIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('connected');
  const [managedFilters, setManagedFilters] = useState<ManagedRecordFilters>({ tag: '', condition: '', status: '' });

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients;
    const searchLower = patientSearch.toLowerCase();
    return patients.filter(
      (p) =>
        (p.patient_name || '').toLowerCase().includes(searchLower) ||
        (p.patient_email || '').toLowerCase().includes(searchLower)
    );
  }, [patients, patientSearch]);
  const filteredManagedRecords = useMemo(() => {
    let filtered = managedRecords;
    // Apply advanced filters
    filtered = applyManagedRecordFilters(filtered, managedFilters);
    // Apply search
    if (patientSearch.trim()) {
      const searchLower = patientSearch.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.patient_name.toLowerCase().includes(searchLower) ||
          (r.patient_email || '').toLowerCase().includes(searchLower) ||
          (r.tags as string[]).some(t => t.toLowerCase().includes(searchLower))
      );
    }
    return filtered;
  }, [managedRecords, patientSearch, managedFilters]);

  const isLoading = isLoadingProfile || isLoadingPatients || isLoadingRecords;

  useEffect(() => {
    if (isClinician && !isLoading) {
      autoClaimShares.mutate();
    }
  }, [isClinician, isLoading]);

  const patientCount = patients.length;

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
        {/* Use minimal header for non-clinicians, not ClinicianHeader */}
        <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-16 items-center justify-center">
            <Button variant="ghost" onClick={() => navigate('/')}>
              ← Back to Home
            </Button>
          </div>
        </header>
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
              Patient Management
            </h1>
            <p className="text-muted-foreground mb-8">
              This page is for healthcare providers. Please sign up as a clinician to access these features.
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
            Your Patients
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage patients who have shared their health data with you
          </p>
        </motion.div>

        <PatientLimitBanner patientCount={patientCount} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="connected" className="gap-1.5">
                <Users className="h-4 w-4" />
                Connected ({patients.length})
              </TabsTrigger>
              <TabsTrigger value="managed" className="gap-1.5">
                <Database className="h-4 w-4" />
                Managed ({managedRecords.length})
              </TabsTrigger>
            </TabsList>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/clinician/patients/import')}
              className="gap-1.5"
            >
              <Upload className="h-4 w-4" />
              Import Patients
            </Button>
          </div>

          <TabsContent value="connected">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base sm:text-lg">Patient Directory</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {patientCount} patient{patientCount !== 1 ? 's' : ''} connected
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

              {/* Bulk Actions */}
              {patients.length > 0 && (
                <BulkPatientActions
                  patients={filteredPatients.map(p => ({
                    id: p.id,
                    user_id: p.user_id,
                    patient_name: p.patient_name || 'Unknown',
                    patient_email: p.patient_email || '',
                  }))}
                  selectedIds={selectedPatientIds}
                  onSelectionChange={setSelectedPatientIds}
                />
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
                    const isSelected = selectedPatientIds.has(patient.id);
                    
                    return (
                      <div
                        key={patient.id}
                        className={`p-3 sm:p-4 rounded-lg border hover:shadow-sm transition-shadow ${isSelected ? 'border-primary bg-primary/5' : ''}`}
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start gap-3">
                            <PatientSelectCheckbox
                              patientId={patient.id}
                              isSelected={isSelected}
                              onToggle={(id) => {
                                const newSet = new Set(selectedPatientIds);
                                if (newSet.has(id)) {
                                  newSet.delete(id);
                                } else {
                                  newSet.add(id);
                                }
                                setSelectedPatientIds(newSet);
                              }}
                            />
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
                              variant="outline"
                              size="sm"
                              className="text-xs"
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

          <TabsContent value="managed">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg">Clinician-Managed Records</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {managedRecords.length} patient{managedRecords.length !== 1 ? 's' : ''} imported
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate('/clinician/patients/import')}
                  className="gap-1.5"
                >
                  <Upload className="h-4 w-4" />
                  Import More
                </Button>
              </CardHeader>
              <CardContent>
                {managedRecords.length > 0 && (
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search managed records..."
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        className="pl-10"
                      />
                  </div>
                  {managedRecords.length > 3 && (
                    <ManagedRecordFilterBar
                      records={managedRecords}
                      filters={managedFilters}
                      onFiltersChange={setManagedFilters}
                    />
                  )}
                  </div>
                )}

                {managedRecords.length === 0 ? (
                  <div className="text-center py-8">
                    <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-semibold mb-2">No managed records</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Import patient records from CSV to manage patients who aren't on OneCare yet.
                    </p>
                    <Button onClick={() => navigate('/clinician/patients/import')}>
                      <Upload className="h-4 w-4 mr-2" /> Import Patients
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredManagedRecords.map((record) => (
                      <div key={record.id} className="p-3 sm:p-4 rounded-lg border hover:shadow-sm transition-shadow">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-accent/50 flex items-center justify-center">
                            <span className="font-semibold text-accent-foreground">
                              {record.patient_name.charAt(0)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium truncate">{record.patient_name}</p>
                              <Badge variant="outline" className="text-xs">
                                {record.data_sharing_model.replace('_', ' ')}
                              </Badge>
                              <Badge variant={
                                record.invitation_status === 'accepted' ? 'default' :
                                record.invitation_status === 'invited' ? 'secondary' :
                                record.invitation_status === 'declined' ? 'destructive' :
                                'outline'
                              } className="text-xs">
                                {record.invitation_status.replace('_', ' ')}
                              </Badge>
                            </div>
                            {record.patient_email && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Mail className="h-3 w-3" />
                                {record.patient_email}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(record.tags as string[]).map((tag, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                              ))}
                              {record.health_conditions.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {record.health_conditions.length} condition{record.health_conditions.length !== 1 ? 's' : ''}
                                </Badge>
                              )}
                              {record.medications.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {record.medications.length} med{record.medications.length !== 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                              <InviteToOneCareButton record={record} />
                              <PatientTagManager record={record} />
                              <EditManagedRecordDialog record={record} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <PatientNotesDialog
        open={notesDialog.open}
        onOpenChange={(open) => setNotesDialog({ ...notesDialog, open })}
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

export default ClinicianPatients;
