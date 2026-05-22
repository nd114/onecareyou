import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Pill, 
  Activity, 
  Calendar, 
  Heart,
  Edit,
  Trash2,
  User,
  Droplets,
  Ruler,
  AlertCircle,
  Plus,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useMedications } from '@/hooks/useMedications';
import { useVitals } from '@/hooks/useVitals';
import { Loader2 } from 'lucide-react';
import { differenceInYears, format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { EditFamilyMemberDialog } from '@/components/family/EditFamilyMemberDialog';

const FamilyMemberDetail = () => {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const { familyMembers, isLoading, deleteMember } = useFamilyMembers();
  const { medications } = useMedications();
  const { vitals } = useVitals();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const member = familyMembers.find(m => m.id === memberId);

  const handleDelete = () => {
    if (memberId) {
      deleteMember.mutate(memberId, {
        onSuccess: () => navigate('/family'),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
      <SectionTabs section=\"team\" variant=\"patient\" />
        <main className="container py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
        <main className="container py-8">
          <Card className="max-w-md mx-auto text-center py-8">
            <CardContent>
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Member Not Found</h2>
              <p className="text-muted-foreground mb-4">
                This family member could not be found.
              </p>
              <Button onClick={() => navigate('/family')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Family Dashboard
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const age = member.date_of_birth 
    ? differenceInYears(new Date(), new Date(member.date_of_birth))
    : null;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-4 sm:py-8 px-4 sm:px-6">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-4 sm:mb-6"
        >
          <Button variant="ghost" onClick={() => navigate('/family')} className="pl-0">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Family Dashboard
          </Button>
        </motion.div>

        {/* Member Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div 
                    className="h-16 w-16 sm:h-20 sm:w-20 rounded-full flex items-center justify-center text-white font-bold text-2xl sm:text-3xl"
                    style={{ backgroundColor: member.avatar_color }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h1 className="font-display text-2xl sm:text-3xl font-bold">{member.name}</h1>
                    <p className="text-muted-foreground">
                      {member.relationship && `${member.relationship.charAt(0).toUpperCase() + member.relationship.slice(1)}`}
                      {age !== null && ` • ${age} years old`}
                      {member.gender && ` • ${member.gender}`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Family Member</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove {member.name} and all their associated health data 
                          including medications, vitals, and schedules. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={handleDelete}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Health Profile Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6"
        >
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <Droplets className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Blood Type</p>
                <p className="font-semibold">{member.blood_type || 'Not set'}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Ruler className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Height</p>
                <p className="font-semibold">{member.height ? `${member.height} cm` : 'Not set'}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Allergies</p>
                <p className="font-semibold">{member.allergies.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Heart className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Conditions</p>
                <p className="font-semibold">{member.health_conditions.length}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tabs for different sections */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Tabs defaultValue="profile" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="profile" className="text-xs sm:text-sm">
                <User className="h-4 w-4 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Profile</span>
              </TabsTrigger>
              <TabsTrigger value="medications" className="text-xs sm:text-sm">
                <Pill className="h-4 w-4 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Medications</span>
              </TabsTrigger>
              <TabsTrigger value="vitals" className="text-xs sm:text-sm">
                <Activity className="h-4 w-4 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Vitals</span>
              </TabsTrigger>
              <TabsTrigger value="schedule" className="text-xs sm:text-sm">
                <Calendar className="h-4 w-4 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Schedule</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle>Health Profile</CardTitle>
                  <CardDescription>
                    Medical information and health conditions for {member.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Allergies */}
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      Allergies
                    </h4>
                    {member.allergies.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {member.allergies.map((allergy, i) => (
                          <Badge key={i} variant="secondary">{allergy}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No allergies recorded</p>
                    )}
                  </div>

                  {/* Health Conditions */}
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Heart className="h-4 w-4 text-red-500" />
                      Health Conditions
                    </h4>
                    {member.health_conditions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {member.health_conditions.map((condition, i) => (
                          <Badge key={i} variant="secondary">{condition}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No health conditions recorded</p>
                    )}
                  </div>

                  {/* Additional Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-1">Date of Birth</h4>
                      <p className="text-muted-foreground">
                        {member.date_of_birth 
                          ? format(new Date(member.date_of_birth), 'MMMM d, yyyy')
                          : 'Not set'}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">Gender</h4>
                      <p className="text-muted-foreground">{member.gender || 'Not set'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="medications">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Medications</CardTitle>
                      <CardDescription>
                        Manage medications for {member.name}
                      </CardDescription>
                    </div>
                    <Button size="sm" className="gradient-primary border-0" asChild>
                      <Link to="/medications/add">
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const memberMeds = medications.filter(m => m.family_member_id === memberId);
                    if (memberMeds.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <Pill className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <h3 className="font-semibold mb-2">No Medications</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Add a medication and select {member.name} as the person.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {memberMeds.map(med => (
                          <div key={med.id} className="flex items-center justify-between p-3 rounded-lg border">
                            <div>
                              <p className="font-medium">{med.name}</p>
                              <p className="text-sm text-muted-foreground">{med.dosage} • {med.frequency.replace(/_/g, ' ')}</p>
                            </div>
                            <Badge variant={med.is_active ? 'default' : 'secondary'}>
                              {med.is_active ? 'Active' : 'Discontinued'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vitals">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Vitals</CardTitle>
                      <CardDescription>
                        Track vital signs for {member.name}
                      </CardDescription>
                    </div>
                    <Button size="sm" className="gradient-primary border-0" asChild>
                      <Link to="/vitals">
                        <Plus className="h-4 w-4 mr-1" />
                        Record
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const memberVitals = vitals.filter(v => v.family_member_id === memberId);
                    if (memberVitals.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <h3 className="font-semibold mb-2">No Vitals Recorded</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Record vitals and select {member.name} as the person on the Vitals page.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {memberVitals.slice(0, 10).map(vital => (
                          <div key={vital.id} className="flex items-center justify-between p-3 rounded-lg border">
                            <div>
                              <p className="font-medium capitalize">{vital.type.replace(/_/g, ' ')}</p>
                              <p className="text-sm text-muted-foreground">
                                {vital.type === 'blood_pressure' && vital.secondary_value
                                  ? `${vital.value}/${vital.secondary_value}`
                                  : vital.value} {vital.unit}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(vital.recorded_at).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                        {memberVitals.length > 10 && (
                          <p className="text-xs text-muted-foreground text-center">
                            Showing latest 10 of {memberVitals.length} records
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="schedule">
              <Card>
                <CardHeader>
                  <CardTitle>Schedule</CardTitle>
                  <CardDescription>
                    View medication schedule for {member.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const memberMeds = medications.filter(m => m.family_member_id === memberId && m.is_active);
                    if (memberMeds.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <h3 className="font-semibold mb-2">No Active Medications</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Add medications for {member.name} to see their schedule here.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {memberMeds.map(med => {
                          const times = Array.isArray(med.times_of_day) ? med.times_of_day as string[] : [];
                          return (
                            <div key={med.id} className="p-3 rounded-lg border">
                              <div className="flex items-center justify-between mb-2">
                                <p className="font-medium">{med.name}</p>
                                <Badge variant="outline">{med.frequency.replace(/_/g, ' ')}</Badge>
                              </div>
                              {times.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {times.map((time, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      <Clock className="h-3 w-3 mr-1" />
                                      {time}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              <p className="text-xs text-muted-foreground mt-2">{med.dosage}</p>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>

      <EditFamilyMemberDialog
        member={member}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
    </div>
  );
};

export default FamilyMemberDetail;
