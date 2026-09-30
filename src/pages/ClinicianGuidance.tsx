import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Send,
  Clock,
  CheckCircle,
  Loader2,
  Plus,
  Ban,
  Search,
  FileText,
  Eye,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useClinicianGuidance } from '@/hooks/useClinicianGuidance';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { CreateGuidanceDialog } from '@/components/clinician/CreateGuidanceDialog';
import { format } from 'date-fns';
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
import type { ClinicianGuidance } from '@/hooks/useClinicianGuidance';
import { Textarea } from '@/components/ui/textarea';
import { describeWithdrawal } from '@/lib/guidance-status';

const ClinicianGuidance = () => {
  const navigate = useNavigate();
  const { isLoading: isLoadingProfile, isClinician } = useClinicianProfile();
  const {
    clinicianGuidance,
    withdrawnGuidance,
    isLoading: isLoadingGuidance,
    withdrawGuidance,
  } = useClinicianGuidance();
  const { patients } = useClinicianPatients();

  const [searchQuery, setSearchQuery] = useState('');
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  // Withdrawing is permanent and the patient is told the reason, so it asks
  // for one before anything is sent.
  const [confirmWithdraw, setConfirmWithdraw] = useState<ClinicianGuidance | null>(null);
  const [withdrawReason, setWithdrawReason] = useState('');

  const list = showWithdrawn ? withdrawnGuidance : clinicianGuidance;

  const isLoading = isLoadingProfile || isLoadingGuidance;

  // Create a map of patient names by user_id for display
  const patientNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    patients.forEach(p => {
      map[p.user_id] = p.patient_name || 'Unknown Patient';
    });
    return map;
  }, [patients]);

  const filteredGuidance = useMemo(() => {
    if (!searchQuery.trim()) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(
      (g) =>
        g.title.toLowerCase().includes(query) ||
        g.instruction.toLowerCase().includes(query) ||
        patientNameMap[g.patient_user_id]?.toLowerCase().includes(query)
    );
  }, [list, searchQuery, patientNameMap]);

  const pendingCount = clinicianGuidance.filter(g => g.status === 'pending').length;
  const acknowledgedCount = clinicianGuidance.filter(g => g.status === 'acknowledged').length;
  const completedCount = clinicianGuidance.filter(g => g.status === 'completed').length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'acknowledged':
        return <Eye className="h-4 w-4 text-blue-500" />;
      case 'expired':
        return <XCircle className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary',
      sent: 'secondary',
      acknowledged: 'outline',
      completed: 'default',
      expired: 'destructive',
    };
    return (
      <Badge variant={variants[status] || 'secondary'} className="capitalize">
        {status === 'archived' ? 'withdrawn' : status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <ClinicianHeader />
      <SectionTabs section="communicate" variant="clinician" />
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
              <Send className="h-10 w-10 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-bold mb-4">
              Patient Guidance
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
      <SectionTabs section="communicate" variant="clinician" />
      
      <main className="container py-4 sm:py-8 px-4 sm:px-6">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
            Patient Guidance
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Send instructions and track patient compliance
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3 sm:gap-4 mb-6"
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Eye className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{acknowledgedCount}</p>
                  <p className="text-xs text-muted-foreground">Viewed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{completedCount}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base sm:text-lg">Guidance History</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {showWithdrawn
                    ? `${withdrawnGuidance.length} withdrawn — kept in each patient's record, marked withdrawn`
                    : `${clinicianGuidance.length} instruction${clinicianGuidance.length !== 1 ? 's' : ''} sent`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
              {(showWithdrawn || withdrawnGuidance.length > 0) && (
                <Button variant="ghost" size="sm" onClick={() => setShowWithdrawn((v) => !v)}>
                  {showWithdrawn ? 'Back to guidance' : `Withdrawn (${withdrawnGuidance.length})`}
                </Button>
              )}
              <CreateGuidanceDialog
                trigger={
                  <Button 
                    size="sm"
                    className="gradient-primary border-0"
                    disabled={patients.length === 0}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Guidance
                  </Button>
                }
                patients={patients.map(p => ({
                  id: p.id,
                  user_id: p.user_id,
                  patient_name: p.patient_name || 'Unknown Patient',
                  patient_email: p.patient_email,
                }))}
              />
              </div>
            </CardHeader>
            <CardContent>
              {list.length > 0 && (
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search guidance..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              )}

              {list.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No guidance sent yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Send personalized instructions to your patients
                  </p>
                  {patients.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      You need connected patients to send guidance
                    </p>
                  )}
                </div>
              ) : filteredGuidance.length === 0 ? (
                <div className="text-center py-8">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No matching guidance</h3>
                  <p className="text-sm text-muted-foreground">
                    Try a different search term
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredGuidance.map((guidance) => (
                    <div
                      key={guidance.id}
                      className="p-4 rounded-lg border"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {getStatusIcon(guidance.status || 'pending')}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className="font-medium">{guidance.title}</p>
                              {getStatusBadge(guidance.status || 'pending')}
                              {guidance.priority === 'high' && (
                                <Badge variant="destructive" className="text-xs">High Priority</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                              {guidance.instruction}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>To: {patientNameMap[guidance.patient_user_id] || 'Patient'}</span>
                              <span>•</span>
                              <span>{format(new Date(guidance.created_at), 'MMM d, yyyy')}</span>
                              {guidance.due_date && (
                                <>
                                  <span>•</span>
                                  <span>Due: {format(new Date(guidance.due_date), 'MMM d')}</span>
                                </>
                              )}
                            </div>
                            {showWithdrawn && (
                              <p className="mt-2 text-xs text-muted-foreground italic">
                                {describeWithdrawal(guidance, 'you')}
                              </p>
                            )}
                          </div>
                        </div>
                        {/* A withdrawal is final: no restore. Issue new guidance instead. */}
                        {!showWithdrawn && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setWithdrawReason('');
                              setConfirmWithdraw(guidance);
                            }}
                            disabled={withdrawGuidance.isPending}
                            aria-label={`Withdraw "${guidance.title}"`}
                            title="Withdraw this instruction"
                          >
                            <Ban className="mr-1.5 h-4 w-4" />
                            Withdraw
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* The patient may already have acted on this, so it is never deleted:
          it stays in their record marked withdrawn, with the reason, and they
          are told. Saying so here is the difference between a clinician
          choosing this and being surprised by it. */}
      <AlertDialog
        open={!!confirmWithdraw}
        onOpenChange={(open) => !open && setConfirmWithdraw(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this instruction?</AlertDialogTitle>
            <AlertDialogDescription>
              “{confirmWithdraw?.title}” stays in the patient's record, marked withdrawn by
              you today with the reason below, and they are notified. It cannot be deleted or
              undone. To change what you said, send new guidance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label htmlFor="withdraw-reason" className="text-sm font-medium">
              Reason (the patient will see this)
            </label>
            <Textarea
              id="withdraw-reason"
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value)}
              placeholder="For example: sent to the wrong patient, or the dose was wrong"
              maxLength={1000}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={!withdrawReason.trim() || withdrawGuidance.isPending}
              onClick={() => {
                if (confirmWithdraw && withdrawReason.trim()) {
                  withdrawGuidance.mutate({ id: confirmWithdraw.id, reason: withdrawReason.trim() });
                }
                setConfirmWithdraw(null);
              }}
            >
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClinicianGuidance;
