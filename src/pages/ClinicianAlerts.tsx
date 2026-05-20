import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Bell,
  AlertTriangle,
  Loader2,
  Plus,
  Trash2,
  Search,
  Activity,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useAlertRules, type AlertLog } from '@/hooks/useAlertRules';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { CreateAlertRuleDialog } from '@/components/clinician/CreateAlertRuleDialog';
import { format } from 'date-fns';

const formatAlertType = (type: string): string => {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const ClinicianAlerts = () => {
  const navigate = useNavigate();
  const { isLoading: isLoadingProfile, isClinician } = useClinicianProfile();
  const { alertRules, alertLogs, isLoading: isLoadingAlerts, deleteAlertRule, toggleAlertRule, acknowledgeAlertLog } = useAlertRules();
  const [triageTab, setTriageTab] = useState<'unread' | 'acknowledged'>('unread');
  const { patients } = useClinicianPatients();
  
  const [searchQuery, setSearchQuery] = useState('');

  const isLoading = isLoadingProfile || isLoadingAlerts;

  const filteredRules = useMemo(() => {
    if (!searchQuery.trim()) return alertRules;
    const query = searchQuery.toLowerCase();
    return alertRules.filter(
      (r) =>
        r.vital_type.toLowerCase().includes(query) ||
        r.condition.toLowerCase().includes(query)
    );
  }, [alertRules, searchQuery]);

  const activeRulesCount = alertRules.filter(r => r.is_active).length;
  const recentAlertsCount = alertLogs.filter(log => {
    const logDate = new Date(log.sent_at);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return logDate > dayAgo;
  }).length;

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
              <Bell className="h-10 w-10 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-bold mb-4">
              Alert Management
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
            Alert Management
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Configure automated alerts for patient vital thresholds
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6"
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeRulesCount}</p>
                  <p className="text-xs text-muted-foreground">Active Rules</p>
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
                  <p className="text-2xl font-bold">{recentAlertsCount}</p>
                  <p className="text-xs text-muted-foreground">24h Alerts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{alertLogs.length}</p>
                  <p className="text-xs text-muted-foreground">Total Alerts</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Alert Rules */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg">Alert Rules</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {alertRules.length} rule{alertRules.length !== 1 ? 's' : ''} configured
                  </CardDescription>
                </div>
                <CreateAlertRuleDialog
                  trigger={
                    <Button 
                      size="sm"
                      className="gradient-primary border-0"
                      disabled={patients.length === 0}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New Rule
                    </Button>
                  }
                  patients={patients.map(p => ({
                    id: p.id,
                    user_id: p.user_id,
                    patient_name: p.patient_name || 'Unknown Patient',
                    patient_email: p.patient_email,
                  }))}
                />
              </CardHeader>
              <CardContent>
                {alertRules.length > 3 && (
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search rules..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                )}

                {alertRules.length === 0 ? (
                  <div className="text-center py-8">
                    <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-semibold mb-2">No alert rules yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create rules to get notified when patient vitals exceed thresholds
                    </p>
                    {patients.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        You need connected patients to create alert rules
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="p-3 rounded-lg border"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge variant="outline" className="capitalize">
                                {rule.vital_type.replace('_', ' ')}
                              </Badge>
                              <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                                {rule.is_active ? 'Active' : 'Paused'}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {rule.condition === 'above' ? '>' : rule.condition === 'below' ? '<' : 'Range'} {rule.threshold_value}
                              {rule.threshold_secondary ? ` - ${rule.threshold_secondary}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rule.is_active ?? false}
                              onCheckedChange={(checked) => 
                                toggleAlertRule.mutate({ id: rule.id, is_active: checked })
                              }
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteAlertRule.mutate(rule.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Recent Alert Logs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Recent Alerts</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Alert history from your monitoring rules
                </CardDescription>
              </CardHeader>
              <CardContent>
                {alertLogs.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-semibold mb-2">No alerts yet</h3>
                    <p className="text-sm text-muted-foreground">
                      Alerts will appear here when patient vitals trigger your rules
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {alertLogs.slice(0, 20).map((log) => (
                      <div
                        key={log.id}
                        className="p-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-950/20"
                      >
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge variant="destructive" className="text-xs">
                                {formatAlertType(log.alert_type)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(log.sent_at), 'MMM d, h:mm a')}
                              </span>
                            </div>
                            {log.message && (
                              <p className="text-sm text-muted-foreground">
                                {log.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>

      <CreateAlertRuleDialog
        trigger={<span className="hidden" />}
        patients={patients.map(p => ({
          id: p.id,
          user_id: p.user_id,
          patient_name: p.patient_name || 'Unknown Patient',
          patient_email: p.patient_email,
        }))}
      />
    </div>
  );
};

export default ClinicianAlerts;
