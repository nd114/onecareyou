import { useState } from 'react';
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
import { useServiceWorker } from '@/hooks/useServiceWorker';
import { COUNTRY_LIST } from '@/hooks/useEmergencyNumbers';
import { Badge } from '@/components/ui/badge';

const ClinicianSettings = () => {
  const navigate = useNavigate();
  const { clinicianProfile, isLoading: isLoadingProfile, updateClinicianProfile } = useClinicianProfile();
  const { isSupported: notificationsSupported, isGranted: notificationsEnabled, requestPermission } = usePushNotifications();
  const { 
    settings: notificationSettings, 
    updatePushNotifications, 
    updateEmailNotifications,
    isSaving: savingNotifications 
  } = useClinicianNotificationSettings();
  
  // Initialize service worker for push notifications
  useServiceWorker();

  const [profileForm, setProfileForm] = useState({
    practice_name: clinicianProfile?.practice_name || '',
    specialty: clinicianProfile?.specialty || '',
    license_number: clinicianProfile?.license_number || '',
    country: clinicianProfile?.country || '',
  });

  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Update form when profile loads
  useState(() => {
    if (clinicianProfile) {
      setProfileForm({
        practice_name: clinicianProfile.practice_name || '',
        specialty: clinicianProfile.specialty || '',
        license_number: clinicianProfile.license_number || '',
        country: clinicianProfile.country || '',
      });
    }
  });

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

          {/* Profile Settings */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Professional Profile
              </CardTitle>
              <CardDescription>
                Update your professional information
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
        </motion.div>
      </main>
    </div>
  );
};

export default ClinicianSettings;
