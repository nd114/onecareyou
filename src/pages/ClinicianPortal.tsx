import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Heart, 
  Activity, 
  Pill, 
  Calendar, 
  User, 
  ShieldCheck,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Droplets,
  Scale,
  Thermometer,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface SharedData {
  patientName?: string;
  providerName: string;
  permissions: {
    vitals: boolean;
    meds: boolean;
    adherence: boolean;
    profile: boolean;
  };
  sharedAt: string;
  profile?: {
    name: string;
    date_of_birth: string;
    gender: string;
    blood_type: string;
    height: number;
    allergies: string[];
    health_conditions: string[];
    emergency_contact_name: string;
    emergency_number: string;
  };
  vitals?: Array<{
    id: string;
    type: string;
    value: number;
    secondary_value?: number;
    unit: string;
    recorded_at: string;
    notes?: string;
  }>;
  medications?: Array<{
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    type: string;
    instructions?: string;
    prescriber?: string;
  }>;
  scheduleEntries?: Array<{
    id: string;
    scheduled_time: string;
    status: string;
    taken_at?: string;
    medications: { name: string; dosage: string };
  }>;
  adherenceRate?: number;
}

const ClinicianPortal = () => {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SharedData | null>(null);

  useEffect(() => {
    const fetchSharedData = async () => {
      if (!inviteCode) {
        setError('No invite code provided');
        setLoading(false);
        return;
      }

      try {
        const { data: response, error: fetchError } = await supabase.functions.invoke(
          'get-shared-patient-data',
          { body: { inviteCode } }
        );

        if (fetchError) {
          console.error('Error fetching data:', fetchError);
          setError('Failed to load patient data');
          return;
        }

        if (response.error) {
          setError(response.error);
          return;
        }

        setData(response);
      } catch (err) {
        console.error('Error:', err);
        setError('An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedData();
  }, [inviteCode]);

  const getVitalIcon = (type: string) => {
    switch (type) {
      case 'blood_pressure': return <Heart className="h-4 w-4" />;
      case 'heart_rate': return <Activity className="h-4 w-4" />;
      case 'blood_glucose': return <Droplets className="h-4 w-4" />;
      case 'weight': return <Scale className="h-4 w-4" />;
      case 'temperature': return <Thermometer className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const formatVitalValue = (vital: SharedData['vitals'][0]) => {
    if (vital.type === 'blood_pressure' && vital.secondary_value) {
      return `${vital.value}/${vital.secondary_value} ${vital.unit}`;
    }
    return `${vital.value} ${vital.unit}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading patient data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Access Error</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Link to="/">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Return Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const patientName = data.profile?.name || data.patientName || 'Patient';

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background border-b">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold">OneCare Clinician Portal</h1>
                <p className="text-xs text-muted-foreground">Secure Patient Data Access</p>
              </div>
            </div>
            <Badge variant="outline" className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Verified Access
            </Badge>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Patient Info Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{patientName}</h2>
                    <p className="text-muted-foreground">
                      Shared with {data.providerName} • {format(new Date(data.sharedAt), 'PPP')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.permissions.vitals && <Badge>Vitals</Badge>}
                  {data.permissions.meds && <Badge>Medications</Badge>}
                  {data.permissions.adherence && <Badge>Adherence</Badge>}
                  {data.permissions.profile && <Badge>Health Profile</Badge>}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Stats */}
        {(data.adherenceRate !== undefined || data.medications?.length || data.vitals?.length) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
          >
            {data.adherenceRate !== undefined && (
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">30-Day Adherence</p>
                    <p className="text-2xl font-bold">{data.adherenceRate}%</p>
                  </div>
                </CardContent>
              </Card>
            )}
            {data.medications && (
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Pill className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Active Medications</p>
                    <p className="text-2xl font-bold">{data.medications.length}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            {data.vitals && (
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Activity className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Recent Vitals</p>
                    <p className="text-2xl font-bold">{data.vitals.length}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* Tabbed Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Tabs defaultValue={data.permissions.profile ? 'profile' : data.permissions.vitals ? 'vitals' : 'medications'}>
            <TabsList className="mb-6">
              {data.permissions.profile && <TabsTrigger value="profile">Health Profile</TabsTrigger>}
              {data.permissions.vitals && <TabsTrigger value="vitals">Vitals</TabsTrigger>}
              {data.permissions.meds && <TabsTrigger value="medications">Medications</TabsTrigger>}
              {data.permissions.adherence && <TabsTrigger value="adherence">Adherence</TabsTrigger>}
            </TabsList>

            {/* Profile Tab */}
            {data.permissions.profile && data.profile && (
              <TabsContent value="profile">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Date of Birth</p>
                          <p className="font-medium">{data.profile.date_of_birth ? format(new Date(data.profile.date_of_birth), 'PPP') : 'Not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Gender</p>
                          <p className="font-medium capitalize">{data.profile.gender || 'Not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Blood Type</p>
                          <p className="font-medium">{data.profile.blood_type || 'Not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Height</p>
                          <p className="font-medium">{data.profile.height ? `${data.profile.height} cm` : 'Not set'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Emergency Contact</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div>
                          <p className="text-sm text-muted-foreground">Name</p>
                          <p className="font-medium">{data.profile.emergency_contact_name || 'Not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Phone</p>
                          <p className="font-medium">{data.profile.emergency_number || 'Not set'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Allergies
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {data.profile.allergies && data.profile.allergies.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {data.profile.allergies.map((allergy, i) => (
                            <Badge key={i} variant="destructive">{allergy}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No allergies recorded</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Health Conditions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {data.profile.health_conditions && data.profile.health_conditions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {data.profile.health_conditions.map((condition, i) => (
                            <Badge key={i} variant="secondary">{condition}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No conditions recorded</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            )}

            {/* Vitals Tab */}
            {data.permissions.vitals && (
              <TabsContent value="vitals">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Vital Recordings</CardTitle>
                    <CardDescription>Last 50 vital measurements</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.vitals && data.vitals.length > 0 ? (
                      <div className="space-y-3">
                        {data.vitals.map((vital) => (
                          <div 
                            key={vital.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                {getVitalIcon(vital.type)}
                              </div>
                              <div>
                                <p className="font-medium capitalize">{vital.type.replace('_', ' ')}</p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(vital.recorded_at), 'PPp')}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-semibold">{formatVitalValue(vital)}</p>
                              {vital.notes && (
                                <p className="text-xs text-muted-foreground">{vital.notes}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No vitals recorded</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Medications Tab */}
            {data.permissions.meds && (
              <TabsContent value="medications">
                <Card>
                  <CardHeader>
                    <CardTitle>Active Medications</CardTitle>
                    <CardDescription>Current medication regimen</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.medications && data.medications.length > 0 ? (
                      <div className="space-y-3">
                        {data.medications.map((med) => (
                          <div 
                            key={med.id}
                            className="p-4 rounded-lg border bg-card"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                  <Pill className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                  <p className="font-semibold">{med.name}</p>
                                  <p className="text-sm text-muted-foreground">{med.dosage}</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="capitalize">{med.type}</Badge>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Frequency:</span>{' '}
                                <span className="font-medium capitalize">{med.frequency}</span>
                              </div>
                              {med.prescriber && (
                                <div>
                                  <span className="text-muted-foreground">Prescriber:</span>{' '}
                                  <span className="font-medium">{med.prescriber}</span>
                                </div>
                              )}
                            </div>
                            {med.instructions && (
                              <p className="mt-2 text-sm text-muted-foreground border-t pt-2">
                                {med.instructions}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No medications recorded</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Adherence Tab */}
            {data.permissions.adherence && (
              <TabsContent value="adherence">
                <Card>
                  <CardHeader>
                    <CardTitle>Medication Adherence</CardTitle>
                    <CardDescription>30-day schedule history</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.scheduleEntries && data.scheduleEntries.length > 0 ? (
                      <div className="space-y-3">
                        {data.scheduleEntries.slice(0, 30).map((entry) => (
                          <div 
                            key={entry.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                                entry.status === 'taken' 
                                  ? 'bg-green-500/10' 
                                  : entry.status === 'skipped'
                                  ? 'bg-amber-500/10'
                                  : 'bg-muted'
                              }`}>
                                {entry.status === 'taken' ? (
                                  <CheckCircle className="h-5 w-5 text-green-500" />
                                ) : entry.status === 'skipped' ? (
                                  <XCircle className="h-5 w-5 text-amber-500" />
                                ) : (
                                  <Clock className="h-5 w-5 text-muted-foreground" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium">{entry.medications?.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(entry.scheduled_time), 'PPp')}
                                </p>
                              </div>
                            </div>
                            <Badge 
                              variant={entry.status === 'taken' ? 'default' : entry.status === 'skipped' ? 'secondary' : 'outline'}
                              className="capitalize"
                            >
                              {entry.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No schedule entries</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background mt-12">
        <div className="container py-6">
          <p className="text-center text-sm text-muted-foreground">
            This data is shared securely through OneCare. Access is logged and monitored.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default ClinicianPortal;
