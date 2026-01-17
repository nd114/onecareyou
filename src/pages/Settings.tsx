import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  User, Shield, Bell, Moon, Sun, 
  Brain, History, ChevronRight, LogOut,
  Mail, Phone, Heart, AlertTriangle, Globe, Scale, Thermometer, Droplets,
  BellRing, TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useAIConsent } from '@/hooks/useAIConsent';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { useServiceWorker } from '@/hooks/useServiceWorker';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GlucoseUnit, WeightUnit, TemperatureUnit, DEFAULT_UNIT_PREFERENCES } from '@/types/health';

interface ConsentLogEntry {
  id: string;
  action: string;
  previous_value: boolean | null;
  new_value: boolean;
  created_at: string;
}

// Timezones sorted by UTC offset (west to east)
const COMMON_TIMEZONES = [
  // UTC-12 to UTC-9
  { value: 'Pacific/Honolulu', label: '(UTC-10) Hawaii', offset: -10 },
  { value: 'America/Anchorage', label: '(UTC-9) Alaska', offset: -9 },
  // UTC-8 to UTC-5
  { value: 'America/Los_Angeles', label: '(UTC-8) Pacific Time (US & Canada)', offset: -8 },
  { value: 'America/Denver', label: '(UTC-7) Mountain Time (US & Canada)', offset: -7 },
  { value: 'America/Mexico_City', label: '(UTC-6) Mexico City', offset: -6 },
  { value: 'America/Chicago', label: '(UTC-6) Central Time (US & Canada)', offset: -6 },
  { value: 'America/New_York', label: '(UTC-5) Eastern Time (US & Canada)', offset: -5 },
  { value: 'America/Toronto', label: '(UTC-5) Toronto', offset: -5 },
  // UTC-4 to UTC-3
  { value: 'America/Buenos_Aires', label: '(UTC-3) Buenos Aires', offset: -3 },
  { value: 'America/Sao_Paulo', label: '(UTC-3) São Paulo', offset: -3 },
  // UTC+0
  { value: 'UTC', label: '(UTC+0) Coordinated Universal Time', offset: 0 },
  { value: 'Africa/Accra', label: '(UTC+0) Accra - Ghana', offset: 0 },
  { value: 'Africa/Dakar', label: '(UTC+0) Dakar - Senegal', offset: 0 },
  { value: 'Africa/Casablanca', label: '(UTC+0/+1) Casablanca - Morocco', offset: 0 },
  { value: 'Europe/London', label: '(UTC+0/+1) London', offset: 0 },
  // UTC+1
  { value: 'Africa/Lagos', label: '(UTC+1) Lagos - Nigeria, Cameroon', offset: 1 },
  { value: 'Africa/Algiers', label: '(UTC+1) Algiers - Algeria', offset: 1 },
  { value: 'Africa/Tunis', label: '(UTC+1) Tunis - Tunisia', offset: 1 },
  { value: 'Africa/Kinshasa', label: '(UTC+1) Kinshasa - DRC West', offset: 1 },
  { value: 'Europe/Paris', label: '(UTC+1/+2) Paris', offset: 1 },
  { value: 'Europe/Berlin', label: '(UTC+1/+2) Berlin', offset: 1 },
  // UTC+2
  { value: 'Africa/Cairo', label: '(UTC+2) Cairo - Egypt', offset: 2 },
  { value: 'Africa/Johannesburg', label: '(UTC+2) Johannesburg - South Africa', offset: 2 },
  { value: 'Africa/Kigali', label: '(UTC+2) Kigali - Rwanda', offset: 2 },
  { value: 'Africa/Lubumbashi', label: '(UTC+2) Lubumbashi - DRC East', offset: 2 },
  // UTC+3
  { value: 'Africa/Nairobi', label: '(UTC+3) Nairobi - Kenya, Tanzania', offset: 3 },
  { value: 'Africa/Addis_Ababa', label: '(UTC+3) Addis Ababa - Ethiopia', offset: 3 },
  { value: 'Asia/Riyadh', label: '(UTC+3) Riyadh', offset: 3 },
  { value: 'Europe/Moscow', label: '(UTC+3) Moscow', offset: 3 },
  { value: 'Europe/Istanbul', label: '(UTC+3) Istanbul', offset: 3 },
  // UTC+4
  { value: 'Asia/Dubai', label: '(UTC+4) Dubai', offset: 4 },
  // UTC+5 to UTC+5:30
  { value: 'Asia/Karachi', label: '(UTC+5) Karachi', offset: 5 },
  { value: 'Asia/Kolkata', label: '(UTC+5:30) Mumbai / Kolkata', offset: 5.5 },
  // UTC+7
  { value: 'Asia/Bangkok', label: '(UTC+7) Bangkok', offset: 7 },
  { value: 'Asia/Jakarta', label: '(UTC+7) Jakarta', offset: 7 },
  // UTC+8
  { value: 'Asia/Singapore', label: '(UTC+8) Singapore', offset: 8 },
  { value: 'Asia/Hong_Kong', label: '(UTC+8) Hong Kong', offset: 8 },
  { value: 'Asia/Shanghai', label: '(UTC+8) Shanghai', offset: 8 },
  { value: 'Asia/Manila', label: '(UTC+8) Manila', offset: 8 },
  { value: 'Australia/Perth', label: '(UTC+8) Perth', offset: 8 },
  // UTC+9
  { value: 'Asia/Tokyo', label: '(UTC+9) Tokyo', offset: 9 },
  { value: 'Asia/Seoul', label: '(UTC+9) Seoul', offset: 9 },
  // UTC+10 to UTC+11
  { value: 'Australia/Sydney', label: '(UTC+10/+11) Sydney', offset: 10 },
  { value: 'Australia/Melbourne', label: '(UTC+10/+11) Melbourne', offset: 10 },
  // UTC+12 to UTC+13
  { value: 'Pacific/Auckland', label: '(UTC+12/+13) Auckland', offset: 12 },
].sort((a, b) => a.offset - b.offset);

const Settings = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { hasConsent, consentUpdatedAt, grantConsent, revokeConsent } = useAIConsent();
  const { isSupported: notificationsSupported, isGranted: notificationsEnabled, requestPermission } = usePushNotifications();
  const { 
    settings: notificationSettings, 
    updatePushNotifications, 
    updateEmailNotifications,
    isSaving: savingNotifications 
  } = useNotificationSettings();
  
  // Initialize service worker for push notifications
  useServiceWorker();
  
  const navigate = useNavigate();
  
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showConsentHistory, setShowConsentHistory] = useState(false);
  const [consentLogs, setConsentLogs] = useState<ConsentLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [timezone, setTimezone] = useState<string>((profile as any)?.timezone || 'UTC');
  const [savingTimezone, setSavingTimezone] = useState(false);
  
  // Unit preferences - stored in localStorage for now (could be moved to profile later)
  const [glucoseUnit, setGlucoseUnit] = useState<GlucoseUnit>(() => {
    const saved = localStorage.getItem('unitPref_glucose');
    return (saved as GlucoseUnit) || DEFAULT_UNIT_PREFERENCES.glucose;
  });
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(() => {
    const saved = localStorage.getItem('unitPref_weight');
    return (saved as WeightUnit) || DEFAULT_UNIT_PREFERENCES.weight;
  });
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>(() => {
    const saved = localStorage.getItem('unitPref_temperature');
    return (saved as TemperatureUnit) || DEFAULT_UNIT_PREFERENCES.temperature;
  });

  useEffect(() => {
    // Check current theme
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    if ((profile as any)?.timezone) {
      setTimezone((profile as any).timezone);
    }
  }, [profile]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const handleTimezoneChange = async (newTimezone: string) => {
    if (!user) return;
    
    setSavingTimezone(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ timezone: newTimezone })
        .eq('user_id', user.id);

      if (error) throw error;
      
      setTimezone(newTimezone);
      toast.success('Timezone updated');
      refreshProfile?.();
    } catch (error) {
      console.error('Failed to update timezone:', error);
      toast.error('Failed to update timezone');
    } finally {
      setSavingTimezone(false);
    }
  };

  const handleUnitChange = (type: 'glucose' | 'weight' | 'temperature', value: string) => {
    localStorage.setItem(`unitPref_${type}`, value);
    if (type === 'glucose') setGlucoseUnit(value as GlucoseUnit);
    if (type === 'weight') setWeightUnit(value as WeightUnit);
    if (type === 'temperature') setTemperatureUnit(value as TemperatureUnit);
    toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} unit updated to ${value}`);
  };

  const fetchConsentLogs = async () => {
    if (!user) return;
    setLoadingLogs(true);
    
    try {
      const { data, error } = await supabase
        .from('consent_logs')
        .select('id, action, previous_value, new_value, created_at')
        .eq('user_id', user.id)
        .eq('consent_type', 'ai_processing')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setConsentLogs(data || []);
    } catch (error) {
      console.error('Failed to fetch consent logs:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleViewConsentHistory = () => {
    setShowConsentHistory(true);
    fetchConsentLogs();
  };

  const handleRevokeConsent = async () => {
    await revokeConsent();
    setShowRevokeDialog(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-8 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-display text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </motion.div>

        <div className="space-y-6">
          {/* Profile Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-2xl font-bold text-primary">
                      {(profile as any)?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold">{(profile as any)?.name || 'User'}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                
                <Separator />
                
                {/* Biodata */}
                <div className="grid grid-cols-2 gap-4">
                  {(profile as any)?.date_of_birth && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Date of Birth</p>
                      <p className="text-sm font-medium">{new Date((profile as any).date_of_birth).toLocaleDateString()}</p>
                    </div>
                  )}
                  {(profile as any)?.gender && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="text-sm font-medium">{(profile as any).gender}</p>
                    </div>
                  )}
                  {(profile as any)?.blood_type && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Blood Type</p>
                      <p className="text-sm font-medium">{(profile as any).blood_type}</p>
                    </div>
                  )}
                  {(profile as any)?.height && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Height</p>
                      <p className="text-sm font-medium">{(profile as any).height} cm</p>
                    </div>
                  )}
                </div>

                {/* Allergies & Conditions */}
                {((profile as any)?.allergies?.length > 0 || (profile as any)?.health_conditions?.length > 0) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      {(profile as any)?.allergies?.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Allergies</p>
                          <div className="flex flex-wrap gap-1">
                            {((profile as any).allergies as string[]).map((a) => (
                              <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {(profile as any)?.health_conditions?.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Health Conditions</p>
                          <div className="flex flex-wrap gap-1">
                            {((profile as any).health_conditions as string[]).map((c) => (
                              <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <Separator />
                
                <div className="space-y-3">
                  {(profile as any)?.phone_number && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{(profile as any).phone_number}</span>
                    </div>
                  )}
                  {(profile as any)?.emergency_contact_name && (
                    <div className="flex items-center gap-3 text-sm">
                      <Heart className="h-4 w-4 text-muted-foreground" />
                      <span>Emergency: {(profile as any).emergency_contact_name}</span>
                    </div>
                  )}
                </div>

                {/* Edit Profile Link */}
                <Link to="/onboarding">
                  <Button variant="outline" className="w-full mt-2">
                    Edit Health Profile
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>

          {/* AI & Privacy Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  AI & Privacy
                </CardTitle>
                <CardDescription>
                  Control how AI processes your health data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* AI Processing Consent */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label className="text-base font-medium">AI Data Processing</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow AI to analyze your lab reports and extract health metrics
                    </p>
                    {consentUpdatedAt && (
                      <p className="text-xs text-muted-foreground">
                        Last updated: {format(new Date(consentUpdatedAt), 'MMM d, yyyy h:mm a')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={hasConsent ? "default" : "secondary"}>
                      {hasConsent ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <Switch
                      checked={hasConsent}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          grantConsent();
                        } else {
                          setShowRevokeDialog(true);
                        }
                      }}
                    />
                  </div>
                </div>

                <Separator />

                {/* Consent History */}
                <button
                  onClick={handleViewConsentHistory}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <History className="h-5 w-5 text-muted-foreground" />
                    <div className="text-left">
                      <p className="font-medium">Consent History</p>
                      <p className="text-sm text-muted-foreground">View your consent audit log</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>

                <Separator />

                {/* Legal Links */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Legal Documents</p>
                  <div className="grid grid-cols-1 gap-2">
                    <Link 
                      to="/privacy" 
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Privacy Policy</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <Link 
                      to="/terms" 
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Terms of Service</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <Link 
                      to="/data-processing" 
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Data Processing Agreement</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Preferences */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Timezone */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Timezone</p>
                      <p className="text-sm text-muted-foreground">Set your local timezone for accurate scheduling</p>
                    </div>
                  </div>
                  <Select value={timezone} onValueChange={handleTimezoneChange} disabled={savingTimezone}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Push Notifications */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BellRing className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Push Notifications</p>
                      <p className="text-sm text-muted-foreground">
                        {notificationsSupported 
                          ? 'Get browser notifications for alerts and reminders' 
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
                          // First request browser permission
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
                        Receive email alerts for vital thresholds and important updates
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={notificationSettings.email_notifications_enabled}
                    disabled={savingNotifications}
                    onCheckedChange={updateEmailNotifications}
                />
                </div>

                <Separator />

                {/* Weekly Adherence Report */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Weekly Adherence Report</p>
                      <p className="text-sm text-muted-foreground">
                        Show medication adherence tracking and reports
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={(profile as any)?.weekly_adherence_report_enabled ?? true}
                    disabled={savingNotifications}
                    onCheckedChange={async (checked) => {
                      if (!user) return;
                      try {
                        const { error } = await supabase
                          .from('profiles')
                          .update({ weekly_adherence_report_enabled: checked })
                          .eq('user_id', user.id);
                        if (error) throw error;
                        toast.success(checked ? 'Adherence report enabled' : 'Adherence report disabled');
                        refreshProfile?.();
                      } catch (error) {
                        console.error('Failed to update setting:', error);
                        toast.error('Failed to update setting');
                      }
                    }}
                  />
                </div>

                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {theme === 'light' ? (
                      <Sun className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Moon className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">Dark Mode</p>
                      <p className="text-sm text-muted-foreground">Toggle dark theme</p>
                    </div>
                  </div>
                  <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Unit Preferences */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Unit Preferences
                </CardTitle>
                <CardDescription>
                  Choose your preferred units of measurement for vitals
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Blood Glucose */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Droplets className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Blood Glucose</p>
                      <p className="text-sm text-muted-foreground">mg/dL (US) or mmol/L (International)</p>
                    </div>
                  </div>
                  <Select value={glucoseUnit} onValueChange={(v) => handleUnitChange('glucose', v)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mg/dL">mg/dL</SelectItem>
                      <SelectItem value="mmol/L">mmol/L</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Weight */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Scale className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Weight</p>
                      <p className="text-sm text-muted-foreground">Kilograms or pounds</p>
                    </div>
                  </div>
                  <Select value={weightUnit} onValueChange={(v) => handleUnitChange('weight', v)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="lbs">lbs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Temperature */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Thermometer className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Temperature</p>
                      <p className="text-sm text-muted-foreground">Celsius or Fahrenheit</p>
                    </div>
                  </div>
                  <Select value={temperatureUnit} onValueChange={(v) => handleUnitChange('temperature', v)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="°C">°C</SelectItem>
                      <SelectItem value="°F">°F</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Sign Out */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Button 
              variant="outline" 
              className="w-full text-destructive hover:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </motion.div>
        </div>
      </main>

      {/* Revoke Consent Dialog */}
      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber" />
              Revoke AI Consent?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Disabling AI processing means:
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>You won't be able to upload and scan lab reports</li>
                <li>Manual entry will still work</li>
                <li>You can re-enable this at any time</li>
              </ul>
              <p className="mt-3">This action will be logged for compliance purposes.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeConsent}>
              Revoke Consent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Consent History Dialog */}
      <Dialog open={showConsentHistory} onOpenChange={setShowConsentHistory}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Consent History
            </DialogTitle>
            <DialogDescription>
              Your AI processing consent audit log
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px]">
            {loadingLogs ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : consentLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No consent history found
              </p>
            ) : (
              <div className="space-y-3">
                {consentLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      log.action === 'granted' 
                        ? 'bg-status-success/10 text-status-success' 
                        : 'bg-severity-high/10 text-severity-high'
                    }`}>
                      {log.action === 'granted' ? '✓' : '✕'}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium capitalize">
                        Consent {log.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), 'MMM d, yyyy h:mm:ss a')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
