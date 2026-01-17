import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Bell,
  BellRing,
  Mail,
  User,
  Save,
  Loader2,
  CheckCircle,
  Eye,
  Clock,
  Phone,
  Building2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Header } from '@/components/layout/Header';
import { useClinicianProfile, MEDICAL_SPECIALTIES } from '@/hooks/useClinicianProfile';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useClinicianNotificationSettings } from '@/hooks/useNotificationSettings';
import { useClinicianNotifications } from '@/hooks/useClinicianNotifications';
import { useServiceWorker } from '@/hooks/useServiceWorker';
import { useAuth } from '@/contexts/AuthContext';
import { COUNTRY_LIST } from '@/hooks/useEmergencyNumbers';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const ClinicianSettings = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { clinicianProfile, isLoading: isLoadingProfile, updateClinicianProfile } = useClinicianProfile();
  const { isSupported: notificationsSupported, isGranted: notificationsEnabled, requestPermission } = usePushNotifications();
  const { 
    settings: notificationSettings, 
    updatePushNotifications, 
    updateEmailNotifications,
    isSaving: savingNotifications 
  } = useClinicianNotificationSettings();
  
  const { preferences: guidancePrefs, updatePreferences } = useClinicianNotifications();
  
  // Initialize service worker for push notifications
  useServiceWorker();

  const [personalForm, setPersonalForm] = useState({
    name: profile?.name || '',
    email: user?.email || '',
    phone_number: profile?.phone_number || '',
  });

  const [profileForm, setProfileForm] = useState({
    practice_name: clinicianProfile?.practice_name || '',
    specialty: clinicianProfile?.specialty || '',
    license_number: clinicianProfile?.license_number || '',
    country: clinicianProfile?.country || '',
  });

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);

  // Update form when profile loads
  useEffect(() => {
    if (clinicianProfile) {
      setProfileForm({
        practice_name: clinicianProfile.practice_name || '',
        specialty: clinicianProfile.specialty || '',
        license_number: clinicianProfile.license_number || '',
        country: clinicianProfile.country || '',
      });
    }
  }, [clinicianProfile]);

  // Update personal form when user profile loads
  useEffect(() => {
    if (profile || user) {
      setPersonalForm({
        name: profile?.name || '',
        email: user?.email || '',
        phone_number: profile?.phone_number || '',
      });
    }
  }, [profile, user]);

  const handleSavePersonal = async () => {
    if (!user) return;
    setIsSavingPersonal(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: personalForm.name,
          phone_number: personalForm.phone_number,
        })
        .eq('user_id', user.id);

      if (error) throw error;
      toast.success('Personal information saved');
    } catch (error) {
      console.error('Error saving personal info:', error);
      toast.error('Failed to save personal information');
    } finally {
      setIsSavingPersonal(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await updateClinicianProfile.mutateAsync(profileForm);
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
        <main className="container py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-4 sm:py-8 px-4 sm:px-6 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Button 
            variant="ghost" 
            className="mb-6"
            onClick={() => navigate('/clinician/dashboard')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>

          <div className="mb-6">
            <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2">
              Settings
            </h1>
            <p className="text-muted-foreground">
              Manage your profile and notification preferences
            </p>
          </div>

          {/* Personal Information */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
              <CardDescription>
                Your basic account information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={personalForm.name}
                    onChange={(e) => setPersonalForm({ ...personalForm, name: e.target.value })}
                    placeholder="Dr. Jane Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      value={personalForm.email}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      value={personalForm.phone_number}
                      onChange={(e) => setPersonalForm({ ...personalForm, phone_number: e.target.value })}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={handleSavePersonal}
                  disabled={isSavingPersonal}
                  variant="outline"
                >
                  {isSavingPersonal ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Personal Info
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Profile Settings */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Professional Profile
              </CardTitle>
              <CardDescription>
                Your professional credentials and practice information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="practice_name">Practice/Hospital Name</Label>
                  <Input
                    id="practice_name"
                    value={profileForm.practice_name}
                    onChange={(e) => setProfileForm({ ...profileForm, practice_name: e.target.value })}
                    placeholder="City General Hospital"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Specialty</Label>
                  <Select
                    value={profileForm.specialty}
                    onValueChange={(value) => setProfileForm({ ...profileForm, specialty: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select specialty" />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDICAL_SPECIALTIES.map(specialty => (
                        <SelectItem key={specialty} value={specialty}>
                          {specialty}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license_number">License Number</Label>
                  <Input
                    id="license_number"
                    value={profileForm.license_number}
                    onChange={(e) => setProfileForm({ ...profileForm, license_number: e.target.value })}
                    placeholder="For verification"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select
                    value={profileForm.country}
                    onValueChange={(value) => setProfileForm({ ...profileForm, country: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_LIST.map(country => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Verification Status:</span>
                  <Badge variant={clinicianProfile?.is_verified ? 'default' : 'secondary'}>
                    {clinicianProfile?.is_verified ? 'Verified' : 'Trust-based'}
                  </Badge>
                </div>
                <Button 
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile}
                  className="gradient-primary border-0"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure how you receive alerts about your patients
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Push Notifications */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BellRing className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Push Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      {notificationsSupported 
                        ? 'Get browser notifications for patient alerts' 
                        : 'Not supported in this browser'}
                    </p>
                  </div>
                </div>
                {notificationsSupported && (
                  <Switch
                    checked={notificationSettings.push_notifications_enabled && notificationsEnabled}
                    disabled={savingNotifications}
                    onCheckedChange={async (checked) => {
                      if (checked) {
                        const granted = await requestPermission();
                        if (granted) {
                          await updatePushNotifications(true);
                        }
                      } else {
                        await updatePushNotifications(false);
                      }
                    }}
                  />
                )}
              </div>

              <Separator />

              {/* Email Notifications */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Receive email alerts when patient vitals exceed thresholds
                    </p>
                  </div>
                </div>
                <Switch
                  checked={notificationSettings.email_notifications_enabled}
                  disabled={savingNotifications}
                  onCheckedChange={updateEmailNotifications}
                />
              </div>
            </CardContent>
          </Card>

          {/* Guidance Notification Settings */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Guidance Notifications
              </CardTitle>
              <CardDescription>
                Configure which patient guidance updates you want to be notified about
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Notify on Acknowledged */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Eye className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium">Patient Acknowledged</p>
                    <p className="text-sm text-muted-foreground">
                      Notify when a patient acknowledges your guidance
                    </p>
                  </div>
                </div>
                <Switch
                  checked={guidancePrefs?.notify_on_guidance_acknowledged ?? true}
                  onCheckedChange={(checked) => {
                    updatePreferences.mutate({ notify_on_guidance_acknowledged: checked });
                    toast.success(checked ? 'Will notify on acknowledgment' : 'Acknowledgment notifications disabled');
                  }}
                />
              </div>

              <Separator />

              {/* Notify on Completed */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium">Guidance Completed</p>
                    <p className="text-sm text-muted-foreground">
                      Notify when a patient marks your guidance as completed
                    </p>
                  </div>
                </div>
                <Switch
                  checked={guidancePrefs?.notify_on_guidance_completed ?? true}
                  onCheckedChange={(checked) => {
                    updatePreferences.mutate({ notify_on_guidance_completed: checked });
                    toast.success(checked ? 'Will notify on completion' : 'Completion notifications disabled');
                  }}
                />
              </div>

              <Separator />

              {/* Notify on Expired */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="font-medium">Guidance Expired</p>
                    <p className="text-sm text-muted-foreground">
                      Notify when guidance reaches its due date without completion
                    </p>
                  </div>
                </div>
                <Switch
                  checked={guidancePrefs?.notify_on_guidance_expired ?? true}
                  onCheckedChange={(checked) => {
                    updatePreferences.mutate({ notify_on_guidance_expired: checked });
                    toast.success(checked ? 'Will notify on expiration' : 'Expiration notifications disabled');
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default ClinicianSettings;
