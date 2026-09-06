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
  Loader2,
  BarChart3,
  BookOpen,
  FolderOpen
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Panel, PanelBody, PanelEmpty, PanelHeader, PanelRow, PanelRows } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useAuth } from '@/contexts/AuthContext';
import { useMedications } from '@/hooks/useMedications';
import { useScheduleEntries } from '@/hooks/useScheduleEntries';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useVitals } from '@/hooks/useVitals';
import { MEDICATION_TYPE_COLORS } from '@/types/health';
import { format } from 'date-fns';
import { PendingInvitationsCard } from '@/components/patient/PendingInvitationsCard';
import { UpcomingAppointments } from '@/components/patient/UpcomingAppointments';
import { BillingNotice } from '@/components/patient/BillingNotice';
import { CarePlanCard } from '@/components/patient/CarePlanCard';
import { InstitutionIntakeCard } from '@/components/patient/InstitutionIntakeCard';
import { TenantOwnerInvitationCard } from '@/components/clinician/TenantOwnerInvitationCard';

import { PendingClinicianRecordsBanner } from '@/components/consent/PendingClinicianRecordsBanner';
import { medicationTypeLabel } from '@/lib/medication-labels';
import { GettingStartedCard } from '@/components/patient/GettingStartedCard';


const getQuickLinks = (showAdherence: boolean) => [
  { label: 'Health Metrics', href: '/vitals', icon: Activity },
  { label: 'Care Circle', href: '/care-circle', icon: Users },
  { label: 'Medicine Cabinet', href: '/medications', icon: Pill },
  { label: 'Health Vault', href: '/health-vault', icon: FolderOpen },
  ...(showAdherence ? [{ label: 'Adherence Report', href: '/adherence-report', icon: BarChart3 }] : []),
  { label: 'Knowledge Base', href: '/knowledge-base', icon: BookOpen },
];

const Dashboard = () => {
  const { profile } = useAuth();
  const { medications, isLoading: loadingMeds } = useMedications();
  const { entries, pending, taken, total, markAsTaken, isLoading: loadingSchedule } = useScheduleEntries();
  const { stats, isLoading: loadingStats } = useDashboardStats();
  const { vitals, loading: loadingVitals } = useVitals();

  const userName = profile?.name?.split(' ')[0] || 'there';
  const isLoading = loadingMeds || loadingSchedule || loadingStats || loadingVitals;
  const showAdherenceReport = profile?.weekly_adherence_report_enabled ?? true;
  const quickLinks = getQuickLinks(showAdherenceReport);

  const statCards = [
    {
      label: 'Adherence Rate',
      value: stats.adherenceRate === null ? '—' : stats.adherenceRate,
      suffix: stats.adherenceRate === null ? '' : '%',
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
      <SectionTabs section="today" variant="patient" />
      
      <main className="container px-4 sm:px-6 py-4 sm:py-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
            Welcome back, {userName}! 👋
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Here's your health overview for today, <span className="font-semibold text-foreground">{format(new Date(), 'EEEE, MMMM d')}</span>
          </p>
        </motion.div>

        {/* What to do first, for as long as there is a first thing to do. */}
        <GettingStartedCard />

        {/* An institution owner invited by OneCare may land here before accepting;
            accepting moves them to their administrative dashboard. */}
        <div className="mb-4">
          <TenantOwnerInvitationCard />
        </div>

        {/* Finish intake for someone who signed up at a hospital's own address */}
        <div className="mb-4">
          <InstitutionIntakeCard />
        </div>


        {/* Pending Invitations from Clinicians */}
        <PendingInvitationsCard />

        {/* Visits a clinician booked, visible to the person being booked. */}
        <CarePlanCard />
        <UpcomingAppointments />
        <BillingNotice />


        {/* Pending Clinician-Imported Records Consent */}
        <PendingClinicianRecordsBanner />

        {/* Onboarding Prompt (resume-aware) */}
        {profile && !profile.onboarding_completed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-6 sm:mb-8"
          >
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm sm:text-base">
                      {(profile as any).onboarding_last_step
                        ? 'Pick up where you left off'
                        : 'Complete Your Health Profile'}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {(profile as any).onboarding_last_step
                        ? 'You skipped onboarding earlier — finish anytime for personalized care.'
                        : 'Add your health details for personalized care'}
                    </p>
                  </div>
                </div>
                <Button asChild className="gradient-primary border-0 w-full sm:w-auto" size="sm">
                  <Link to="/onboarding">
                    {(profile as any).onboarding_last_step ? 'Resume onboarding' : 'Complete Profile'}
                  </Link>
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
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8"
        >
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + index * 0.05 }}
            >
              <Card className={`${stat.gradient} text-primary-foreground border-0 overflow-hidden relative`}>
                <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardContent className="p-3 sm:p-6">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <stat.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm opacity-90 truncate">{stat.label}</p>
                      <p className="text-lg sm:text-2xl font-bold">
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
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
            <Panel>
              <PanelHeader
                eyebrow="Today's regimen"
                description={total > 0 ? `${taken.length} of ${total} doses taken` : 'No doses scheduled'}
              >
                <Button variant="outline" size="sm" asChild>
                  <Link to="/schedule">View all</Link>
                </Button>
              </PanelHeader>

              {loadingSchedule ? (
                <PanelEmpty>
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </PanelEmpty>
              ) : entries.length === 0 ? (
                <PanelEmpty className="py-10">
                  <Clock className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <p>No doses scheduled for today</p>
                  {medications.length > 0 && (
                    <p className="mt-2 text-xs">Your medications appear here once scheduled</p>
                  )}
                </PanelEmpty>
              ) : (
                <PanelRows>
                  {entries.slice(0, 5).map((entry) => (
                    <PanelRow
                      key={entry.id}
                      className={entry.status === 'taken' ? 'bg-[hsl(var(--emerald-light))]/40' : undefined}
                      glyph={
                        <span className="w-[46px] text-center text-sm font-semibold tabular-nums sm:w-[56px] sm:text-base">
                          {format(new Date(entry.scheduled_time), 'HH:mm')}
                        </span>
                      }
                      label={entry.medication?.name || 'Unknown'}
                      trailing={
                        entry.status === 'taken' ? (
                          <span className="flex items-center gap-1.5 text-primary">
                            <Check className="h-4 w-4" />
                            <span className="sr-only sm:not-sr-only text-xs font-medium">Taken</span>
                          </span>
                        ) : entry.status === 'skipped' ? (
                          <Badge variant="secondary" className="text-xs">Skipped</Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="h-8 border-0 px-2 gradient-primary text-xs sm:px-3"
                            onClick={() => handleMarkTaken(entry.id)}
                            disabled={markAsTaken.isPending}
                            aria-label={`Mark ${entry.medication?.name || 'this dose'} as taken`}
                          >
                            {markAsTaken.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <Check className="mr-1 h-3.5 w-3.5" />
                                <span className="sm:hidden">Take</span>
                                <span className="hidden sm:inline">Mark taken</span>
                              </>
                            )}
                          </Button>
                        )
                      }
                    >
                      {entry.medication && (
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] sm:text-xs ${MEDICATION_TYPE_COLORS[entry.medication.type as keyof typeof MEDICATION_TYPE_COLORS] || ''}`}
                          >
                            {medicationTypeLabel(entry.medication.type)}
                          </Badge>
                          <span className="truncate text-xs text-muted-foreground">
                            {entry.medication.dosage}
                          </span>
                        </span>
                      )}
                    </PanelRow>
                  ))}
                </PanelRows>
              )}

              {pending.length > 0 && (
                <PanelBody className="flex flex-col items-start justify-between gap-2 border-t border-primary/[0.07] bg-secondary/40 sm:flex-row sm:items-center sm:gap-3">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground sm:gap-3 sm:text-sm">
                    <Bell className="h-4 w-4 shrink-0" />
                    {pending.length} dose{pending.length !== 1 ? 's' : ''} remaining today
                  </span>
                  <Button variant="ghost" size="sm" className="h-8 w-full text-xs sm:w-auto sm:text-sm" asChild>
                    <Link to="/settings?section=notifications">Enable reminders</Link>
                  </Button>
                </PanelBody>
              )}
            </Panel>
          </motion.div>

          {/* Quick Tools Sidebar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Panel>
              <PanelHeader eyebrow="Quick tools" description="Everything else in your record" />
              <PanelRows>
                {quickLinks.map((link) => (
                  <PanelRow
                    key={link.label}
                    interactive
                    className="p-0 sm:p-0"
                    label={
                      <Link
                        to={link.href}
                        className="flex items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-6 sm:py-3.5"
                      >
                        <span className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10">
                            <link.icon className="h-4 w-4 text-primary" />
                          </span>
                          <span className="font-medium">{link.label}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    }
                  />
                ))}
              </PanelRows>

              {profile?.subscription_tier === 'free' && (
                <PanelBody className="border-t border-primary/[0.07]">
                  <div className="rounded-xl p-4 gradient-primary text-primary-foreground">
                    <p className="mb-1 font-semibold">Upgrade to Premium</p>
                    <p className="mb-3 text-sm opacity-90">
                      Unlock unlimited medications, family profiles, and AI health insights
                    </p>
                    <Button size="sm" variant="secondary" asChild>
                      <Link to="/pricing">
                        Learn more
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </PanelBody>
              )}
            </Panel>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
