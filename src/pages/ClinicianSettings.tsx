import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft,
  Bell,
  BellRing,
  Mail,
  Save,
  Loader2,
  CheckCircle,
  Eye,
  Clock,
  Phone,
  Building2,
  Camera,
  Upload,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { useClinicianProfile, MEDICAL_SPECIALTIES, CLINICIAN_TITLES } from '@/hooks/useClinicianProfile';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useClinicianNotificationSettings } from '@/hooks/useNotificationSettings';
import { useClinicianNotifications } from '@/hooks/useClinicianNotifications';
import { useServiceWorker } from '@/hooks/useServiceWorker';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { useAuth } from '@/contexts/AuthContext';
import { COUNTRY_LIST } from '@/hooks/useEmergencyNumbers';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { EHRConnectionsSection } from '@/components/clinician/EHRConnectionsSection';
import { SubscriptionManagementCard } from '@/components/clinician/SubscriptionManagementCard';
import { PracticeTeamSection } from '@/components/clinician/PracticeTeamSection';
import { PracticeInvitationsCard } from '@/components/clinician/PracticeInvitationsCard';
import { PracticeBrandingCard } from '@/components/clinician/PracticeBrandingCard';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useClinicianSubscription, hasFeatureAccess } from '@/hooks/useClinicianSubscription';

const ClinicianSettings = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      // Wait a tick for sections to render
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
  }, [location.hash]);
  const { user, profile } = useAuth();
  const { clinicianProfile, isLoading: isLoadingProfile, updateClinicianProfile, isClinician } = useClinicianProfile();
  const { patients } = useClinicianPatients();
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
  // Session timeout for HIPAA compliance
  useSessionTimeout();
  const { tier } = useClinicianSubscription();

  const [profileForm, setProfileForm] = useState({
    first_name: clinicianProfile?.first_name || '',
    last_name: clinicianProfile?.last_name || '',
    phone_number: profile?.phone_number || '',
    practice_name: clinicianProfile?.practice_name || '',
    specialty: clinicianProfile?.specialty || '',
    license_number: clinicianProfile?.license_number || '',
    country: clinicianProfile?.country || '',
    title: clinicianProfile?.title || 'Dr.',
  });

  const [avatarUrl, setAvatarUrl] = useState(clinicianProfile?.avatar_url || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Update form when profile loads
  useEffect(() => {
    if (clinicianProfile || profile || user) {
      setProfileForm({
        first_name: clinicianProfile?.first_name || '',
        last_name: clinicianProfile?.last_name || '',
        phone_number: profile?.phone_number || '',
        practice_name: clinicianProfile?.practice_name || '',
        specialty: clinicianProfile?.specialty || '',
        license_number: clinicianProfile?.license_number || '',
        country: clinicianProfile?.country || '',
        title: clinicianProfile?.title || 'Dr.',
      });
      setAvatarUrl(clinicianProfile?.avatar_url || '');
    }
  }, [clinicianProfile, profile, user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      // Save personal info to profiles table (update full name for backward compatibility)
      const fullName = `${profileForm.first_name} ${profileForm.last_name}`.trim();
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: fullName,
          phone_number: profileForm.phone_number,
        })
        .eq('user_id', user.id);

      if (profileError) throw profileError;

      // Save clinician info including first/last name
      await updateClinicianProfile.mutateAsync({
        practice_name: profileForm.practice_name,
        specialty: profileForm.specialty,
        license_number: profileForm.license_number,
        country: profileForm.country,
        title: profileForm.title,
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        avatar_url: avatarUrl || null,
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('clinician-avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('clinician-avatars')
        .getPublicUrl(filePath);

      // Add cache buster
      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;
      setAvatarUrl(urlWithCacheBuster);

      // Save to profile
      await updateClinicianProfile.mutateAsync({ avatar_url: urlWithCacheBuster });
      toast.success('Profile photo updated');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload profile photo');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  if (isLoadingProfile) {
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
              <Save className="h-10 w-10 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-bold mb-4">
              Clinician Settings
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
      
      <main className="container py-4 sm:py-8 px-4 sm:px-6 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-6">
            <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2">
              Settings
            </h1>
            <p className="text-muted-foreground">
              Manage your profile and notification preferences
            </p>
          </div>


          {/* Professional Profile (merged with Personal Info) */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Professional Profile
              </CardTitle>
              <CardDescription>
                Your personal and professional information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar Upload */}
              <div className="flex items-center gap-6 pb-4 border-b">
                <div className="relative">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={avatarUrl} alt="Profile photo" />
                    <AvatarFallback className="text-lg bg-primary/10">
                      {profileForm.first_name?.charAt(0) || profileForm.last_name?.charAt(0) || 'C'}
                    </AvatarFallback>
                  </Avatar>
                  <label 
                    htmlFor="avatar-upload" 
                    className="absolute bottom-0 right-0 p-1.5 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-colors"
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={isUploadingAvatar}
                  />
                </div>
                <div>
                  <p className="font-medium">Profile Photo</p>
                  <p className="text-sm text-muted-foreground">
                    This will be shown to your patients
                  </p>
                  <label 
                    htmlFor="avatar-upload" 
                    className="text-sm text-primary hover:underline cursor-pointer inline-flex items-center gap-1 mt-1"
                  >
                    <Upload className="h-3 w-3" />
                    Upload new photo
                  </label>
                </div>
              </div>

              {/* Personal Info Section */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Personal Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name</Label>
                    <Input
                      id="first_name"
                      value={profileForm.first_name}
                      onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                      placeholder="Jane"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      value={profileForm.last_name}
                      onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                      placeholder="Smith"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        value={user?.email || ''}
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
                        value={profileForm.phone_number}
                        onChange={(e) => setProfileForm({ ...profileForm, phone_number: e.target.value })}
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Professional Info Section */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Professional Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Title Prefix */}
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Select
                      value={profileForm.title}
                      onValueChange={(value) => setProfileForm({ ...profileForm, title: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select title" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLINICIAN_TITLES.map(title => (
                          <SelectItem key={title} value={title}>
                            {title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
              </div>

              {/* Verification Status & Save Button - stacked on mobile */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Verification Status:</span>
                  <Badge variant={clinicianProfile?.is_verified ? 'default' : 'secondary'}>
                    {clinicianProfile?.is_verified ? 'Verified' : 'Trust-based'}
                  </Badge>
                </div>
                <Button 
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile}
                  className="gradient-primary border-0 w-full sm:w-auto"
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
