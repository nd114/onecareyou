import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  TrendingUp, 
  Pill, 
  Activity, 
  Users, 
  Check, 
  Clock,
  ArrowRight,
  Bell,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useMedications } from '@/hooks/useMedications';
import { useScheduleEntries } from '@/hooks/useScheduleEntries';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useVitals } from '@/hooks/useVitals';
import { MEDICATION_TYPE_COLORS } from '@/types/health';
import { format } from 'date-fns';

const quickLinks = [
  { label: 'Health Metrics', href: '/vitals', icon: Activity },
  { label: 'Care Circle', href: '/care-circle', icon: Users },
  { label: 'Medicine Cabinet', href: '/medications', icon: Pill },
  { label: 'Health Profile', href: '/onboarding', icon: Users },
];

const Dashboard = () => {
  const { profile } = useAuth();
  const { medications, isLoading: loadingMeds } = useMedications();
  const { entries, pending, taken, total, markAsTaken, isLoading: loadingSchedule } = useScheduleEntries();
  const { stats, isLoading: loadingStats } = useDashboardStats();
  const { vitals, loading: loadingVitals } = useVitals();

  const userName = profile?.name?.split(' ')[0] || 'there';
  const isLoading = loadingMeds || loadingSchedule || loadingStats || loadingVitals;

  const statCards = [
    { 
      label: 'Adherence Rate', 
      value: stats.adherenceRate, 
      suffix: '%', 
      icon: TrendingUp,
      gradient: 'stat-card-1'
    },
    { 
      label: 'Daily Doses', 
      value: stats.dailyDoses, 
      icon: Pill,
      gradient: 'stat-card-2'
    },
    { 
      label: 'Health Markers', 
      value: stats.healthMarkers, 
      icon: Activity,
      gradient: 'stat-card-3'
    },
    { 
      label: 'Active Providers', 
      value: stats.activeProviders, 
      icon: Users,
      gradient: 'stat-card-4'
    },
  ];

  const handleMarkTaken = async (entryId: string) => {
    await markAsTaken.mutateAsync(entryId);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-display text-3xl font-bold mb-2">
            Welcome back, {userName}! 👋
          </h1>
          <p className="text-muted-foreground">
            Here's your health overview for today, {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </motion.div>

        {/* Onboarding Prompt */}
        {profile && !profile.onboarding_completed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-8"
          >
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Complete Your Health Profile</p>
                    <p className="text-sm text-muted-foreground">
                      Add your health details for personalized care coordination
                    </p>
                  </div>
                </div>
                <Button asChild className="gradient-primary border-0">
                  <Link to="/onboarding">Complete Profile</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Stat Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + index * 0.05 }}
            >
              <Card className={`${stat.gradient} text-primary-foreground border-0 overflow-hidden relative`}>
                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                      <stat.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm opacity-90">{stat.label}</p>
                      <p className="text-2xl font-bold">
                        {isLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          `${stat.value}${stat.suffix || ''}`
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* No Medications Prompt */}
        {!loadingMeds && medications.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Pill className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">No medications added yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start by adding your medications to track and share with your care team
                </p>
                <Button asChild className="gradient-primary border-0">
                  <Link to="/medications/add">Add Your First Medication</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Today's Regimen */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-2"
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    Today's Regimen
                  </CardTitle>
                  <CardDescription>
                    {total > 0 ? `${taken.length}/${total} doses completed` : 'No doses scheduled'}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/schedule">View All</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {loadingSchedule ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : entries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>No doses scheduled for today</p>
                    {medications.length > 0 && (
                      <p className="text-sm mt-2">Your medications will appear here once scheduled</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {entries.slice(0, 5).map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between p-4 rounded-xl border ${
                          entry.status === 'taken' 
                            ? 'bg-emerald-light border-primary/20' 
                            : 'bg-card border-border'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-center min-w-[60px]">
                            <p className="text-lg font-semibold">
                              {format(new Date(entry.scheduled_time), 'HH:mm')}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium">{entry.medication?.name || 'Unknown'}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {entry.medication && (
                                <>
                                  <Badge 
                                    variant="secondary" 
                                    className={`text-xs ${MEDICATION_TYPE_COLORS[entry.medication.type as keyof typeof MEDICATION_TYPE_COLORS] || ''}`}
                                  >
                                    {entry.medication.type}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {entry.medication.dosage}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div>
                          {entry.status === 'taken' ? (
                            <div className="flex items-center gap-2 text-primary">
                              <Check className="h-5 w-5" />
                              <span className="text-sm font-medium">Taken</span>
                            </div>
                          ) : entry.status === 'skipped' ? (
                            <Badge variant="secondary">Skipped</Badge>
                          ) : (
                            <Button 
                              size="sm" 
                              className="gradient-primary border-0"
                              onClick={() => handleMarkTaken(entry.id)}
                              disabled={markAsTaken.isPending}
                            >
                              {markAsTaken.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Mark Taken'
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {pending.length > 0 && (
                  <div className="mt-6 p-4 rounded-xl bg-muted/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {pending.length} dose{pending.length !== 1 ? 's' : ''} remaining today
                      </span>
                    </div>
                    <Button variant="ghost" size="sm">
                      Enable Reminders
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Quick Tools Sidebar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Quick Tools</CardTitle>
                <CardDescription>Access your health features</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {quickLinks.map((link) => (
                    <Link
                      key={link.label}
                      to={link.href}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <link.icon className="h-5 w-5 text-primary" />
                        </div>
                        <span className="font-medium">{link.label}</span>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </Link>
                  ))}
                </div>

                {profile?.subscription_tier === 'free' && (
                  <div className="mt-6 p-4 rounded-xl gradient-primary text-primary-foreground">
                    <p className="font-semibold mb-1">Upgrade to Premium</p>
                    <p className="text-sm opacity-90 mb-3">
                      Unlock unlimited medications and provider sharing
                    </p>
                    <Button size="sm" variant="secondary" asChild>
                      <Link to="/pricing">
                        Learn More
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
