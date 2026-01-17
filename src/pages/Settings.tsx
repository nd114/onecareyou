import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  User, Shield, Bell, Moon, Sun, 
  Brain, History, ChevronRight, LogOut,
  Mail, Phone, Heart, AlertTriangle, Globe, Scale, Thermometer, Droplets,
  BellRing
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

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  // Africa
  { value: 'Africa/Lagos', label: 'Lagos (WAT / GMT+1) - Nigeria, Cameroon' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST / GMT+2) - South Africa' },
  { value: 'Africa/Nairobi', label: 'Nairobi (EAT / GMT+3) - Kenya, Tanzania' },
  { value: 'Africa/Cairo', label: 'Cairo (EET / GMT+2) - Egypt' },
  { value: 'Africa/Casablanca', label: 'Casablanca (WET / GMT+0/+1) - Morocco' },
  { value: 'Africa/Accra', label: 'Accra (GMT) - Ghana' },
  { value: 'Africa/Addis_Ababa', label: 'Addis Ababa (EAT / GMT+3) - Ethiopia' },
  { value: 'Africa/Algiers', label: 'Algiers (CET / GMT+1) - Algeria' },
  { value: 'Africa/Kigali', label: 'Kigali (CAT / GMT+2) - Rwanda' },
  { value: 'Africa/Kinshasa', label: 'Kinshasa (WAT / GMT+1) - DRC West' },
  { value: 'Africa/Lubumbashi', label: 'Lubumbashi (CAT / GMT+2) - DRC East' },
  { value: 'Africa/Tunis', label: 'Tunis (CET / GMT+1) - Tunisia' },
  { value: 'Africa/Dakar', label: 'Dakar (GMT) - Senegal' },
  // Americas
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'America/Toronto', label: 'Toronto (EST/EDT)' },
  { value: 'America/Mexico_City', label: 'Mexico City (CST)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (ART)' },
  // Europe
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
  { value: 'Europe/Istanbul', label: 'Istanbul (TRT)' },
  // Asia
  { value: 'Asia/Dubai', label: 'Dubai (GST / GMT+4)' },
  { value: 'Asia/Kolkata', label: 'Mumbai/Kolkata (IST / GMT+5:30)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT / GMT+8)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT / GMT+8)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST / GMT+8)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST / GMT+9)' },
  { value: 'Asia/Seoul', label: 'Seoul (KST / GMT+9)' },
  { value: 'Asia/Jakarta', label: 'Jakarta (WIB / GMT+7)' },
  { value: 'Asia/Manila', label: 'Manila (PHT / GMT+8)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (ICT / GMT+7)' },
  { value: 'Asia/Karachi', label: 'Karachi (PKT / GMT+5)' },
  { value: 'Asia/Riyadh', label: 'Riyadh (AST / GMT+3)' },
  // Oceania
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
  { value: 'Australia/Perth', label: 'Perth (AWST)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
];

const Settings = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { hasConsent, consentUpdatedAt, grantConsent, revokeConsent } = useAIConsent();
  const { isSupported: notificationsSupported, isGranted: notificationsEnabled, requestPermission } = usePushNotifications();
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
                          ? 'Get reminders for scheduled medications' 
                          : 'Not supported in this browser'}
                      </p>
                    </div>
                  </div>
                  {notificationsSupported && (
                    <Switch
                      checked={notificationsEnabled}
                      onCheckedChange={() => {
                        if (!notificationsEnabled) {
                          requestPermission();
                        } else {
                          toast.info('To disable notifications, use your browser settings');
                        }
                      }}
                    />
                  )}
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
