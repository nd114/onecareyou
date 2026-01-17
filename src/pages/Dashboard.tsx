import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  TrendingUp, 
  Pill, 
  Activity, 
  Users, 
  Check, 
  Clock,
  AlertTriangle,
  ArrowRight,
  Bell,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { 
  mockMedications, 
  mockScheduleEntries, 
  mockDashboardStats,
  mockInteractions 
} from '@/lib/mock-data';
import { MEDICATION_TYPE_COLORS } from '@/types/health';

const statCards = [
  { 
    label: 'Adherence Rate', 
    value: mockDashboardStats.adherenceRate, 
    suffix: '%', 
    icon: TrendingUp,
    gradient: 'stat-card-1'
  },
  { 
    label: 'Daily Doses', 
    value: mockDashboardStats.dailyDoses, 
    icon: Pill,
    gradient: 'stat-card-2'
  },
  { 
    label: 'Health Markers', 
    value: mockDashboardStats.healthMarkers, 
    icon: Activity,
    gradient: 'stat-card-3'
  },
  { 
    label: 'Active Providers', 
    value: mockDashboardStats.activeProviders, 
    icon: Users,
    gradient: 'stat-card-4'
  },
];

const quickLinks = [
  { label: 'Health Metrics', href: '/vitals', icon: Activity },
  { label: 'Care Circle', href: '/care-circle', icon: Users },
  { label: 'Medicine Cabinet', href: '/medications', icon: Pill },
  { label: 'My Profile', href: '/profile', icon: Users },
];

const Dashboard = () => {
  const todaySchedule = mockScheduleEntries.map(entry => ({
    ...entry,
    medication: mockMedications.find(m => m.id === entry.medicationId)
  }));

  const pendingDoses = todaySchedule.filter(e => e.status === 'pending');
  const completedDoses = todaySchedule.filter(e => e.status === 'taken');

  return (
    <div className="min-h-screen bg-muted/30">
      <Header isAuthenticated userName="John" />
      
      <main className="container py-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-display text-3xl font-bold mb-2">
            Welcome back, John! 👋
          </h1>
          <p className="text-muted-foreground">
            Here's your health overview for today, {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </motion.div>

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
                        {stat.value}{stat.suffix || ''}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Compliance Alert */}
        {mockDashboardStats.adherenceRate < 80 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <Card className="border-severity-moderate bg-amber-light">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-severity-moderate/20 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-severity-moderate" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Adherence Alert</p>
                  <p className="text-sm text-muted-foreground">
                    Your adherence rate is below 80%. Consistent medication intake is important for your health.
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  View Tips
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Interaction Warnings */}
        {mockInteractions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mb-8"
          >
            <Card className="border-severity-low bg-emerald-light">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Low-Risk Interaction Detected</p>
                  <p className="text-sm text-muted-foreground">
                    {mockInteractions[0].medication1} + {mockInteractions[0].medication2}: {mockInteractions[0].description}
                  </p>
                </div>
                <Badge variant="outline" className="border-primary text-primary">Low</Badge>
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
                    {completedDoses.length}/{todaySchedule.length} doses completed
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/schedule">View All</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {todaySchedule.slice(0, 5).map((entry) => (
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
                          <p className="text-lg font-semibold">{entry.scheduledTime}</p>
                        </div>
                        <div>
                          <p className="font-medium">{entry.medication?.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ${MEDICATION_TYPE_COLORS[entry.medication?.type || 'prescription']}`}
                            >
                              {entry.medication?.type}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {entry.medication?.dosage}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div>
                        {entry.status === 'taken' ? (
                          <div className="flex items-center gap-2 text-primary">
                            <Check className="h-5 w-5" />
                            <span className="text-sm font-medium">Taken</span>
                          </div>
                        ) : (
                          <Button size="sm" className="gradient-primary border-0">
                            Mark Taken
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {pendingDoses.length > 0 && (
                  <div className="mt-6 p-4 rounded-xl bg-muted/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {pendingDoses.length} doses remaining today
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

                <div className="mt-6 p-4 rounded-xl gradient-primary text-primary-foreground">
                  <p className="font-semibold mb-1">Upgrade to Premium</p>
                  <p className="text-sm opacity-90 mb-3">
                    Unlock unlimited medications and advanced features
                  </p>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/subscription">
                      Learn More
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
