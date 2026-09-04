import { motion } from 'framer-motion';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Users } from 'lucide-react';

import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PracticeTeamSection } from '@/components/clinician/PracticeTeamSection';
import { PracticeBrandingCard } from '@/components/clinician/PracticeBrandingCard';
import { EHRConnectionsSection } from '@/components/clinician/EHRConnectionsSection';
import { SubscriptionManagementCard } from '@/components/clinician/SubscriptionManagementCard';
import { HospitalPatientsCard } from '@/components/clinician/HospitalPatientsCard';
import { DepartmentsCard } from '@/components/clinician/DepartmentsCard';
import { ClinicianAllowlistCard } from '@/components/clinician/ClinicianAllowlistCard';
import { PracticeAccessOverviewCard } from '@/components/clinician/PracticeAccessOverviewCard';
import { HospitalCodeCard } from '@/components/clinician/HospitalCodeCard';
import { PracticeContactCard } from '@/components/clinician/PracticeContactCard';
import { PracticeRevenueShareCard } from '@/components/clinician/PracticeRevenueShareCard';
import { PracticeCurrencyCard } from '@/components/clinician/PracticeCurrencyCard';
import { PracticeStorageCard } from '@/components/clinician/PracticeStorageCard';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { useClinicianSubscription, hasFeatureAccess } from '@/hooks/useClinicianSubscription';
import { usePractice } from '@/hooks/usePractice';
import { usePracticeTenant } from '@/hooks/usePracticeTenant';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { availableSections, findSection } from '@/lib/practice-sections';

/**
 * One group of practice settings.
 *
 * The cards are unchanged — they are the same components the old single page
 * rendered, each still deciding for itself whether it applies. What changed is
 * that they are now four short pages instead of one long one, and that a
 * section is not offered at all unless something in it will render.
 *
 * `@/lib/practice-sections` holds the grouping and that availability rule, so
 * the hub and this page cannot disagree about which sections exist.
 */
const ClinicianPracticeSection = () => {
  const { sectionId } = useParams<{ sectionId: string }>();
  const { isClinician, isLoading: isLoadingProfile } = useClinicianProfile();
  const { patients } = useClinicianPatients();
  const { currentPractice, currentMembership } = usePractice();
  const { tenant } = usePracticeTenant(currentPractice?.id);
  const { tier } = useClinicianSubscription();

  useSessionTimeout();

  const section = findSection(sectionId);

  if (isLoadingProfile) {
    return (
      <div className="min-h-screen bg-muted/30">
        <ClinicianHeader />
        <SectionTabs section="practice" variant="clinician" />
        <main className="container flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!isClinician) return null;

  const context = {
    hasPractice: Boolean(currentPractice),
    isHospital: (tenant?.tenant_type ?? 'practice') === 'hospital',
    isAdmin: currentMembership?.role === 'owner' || currentMembership?.role === 'admin',
    canManageTeam: hasFeatureAccess(tier, 'team_management'),
  };

  // An unknown section, or one this clinician has nothing in, goes back to the
  // hub rather than rendering an empty page under a confident heading.
  const offered = availableSections(context).some((s) => s.id === section?.id);
  if (!section || !offered) return <Navigate to="/clinician/practice" replace />;

  return (
    <div className="min-h-screen bg-muted/30">
      <ClinicianHeader />
      <SectionTabs section="practice" variant="clinician" />

      <main className="container max-w-3xl px-4 py-4 sm:px-6 sm:py-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Button variant="ghost" size="sm" className="-ml-2 mb-3" asChild>
            <Link to="/clinician/practice">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Practice
            </Link>
          </Button>

          <div className="mb-6">
            <h1 className="mb-1 font-display text-2xl font-bold sm:text-3xl">{section.label}</h1>
            <p className="text-sm text-muted-foreground">{section.summary}</p>
          </div>

          <div className="space-y-6">
            {section.id === 'people' && (
              <>
                {context.canManageTeam ? <PracticeTeamSection /> : <TeamUpgradeCard />}
                <ClinicianAllowlistCard />
                <DepartmentsCard />
              </>
            )}

            {section.id === 'access' && (
              <>
                <HospitalPatientsCard />
                <PracticeAccessOverviewCard />
                <EHRConnectionsSection />
              </>
            )}

            {section.id === 'details' && (
              <>
                <PracticeContactCard />
                <HospitalCodeCard />
                <PracticeCurrencyCard />
                {hasFeatureAccess(tier, 'practice_branding') && <PracticeBrandingCard />}
              </>
            )}

            {section.id === 'plan' && (
              <>
                <SubscriptionManagementCard patientCount={patients.length} />
                <PracticeStorageCard />
                <PracticeRevenueShareCard />
              </>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
};

/**
 * What stands in for the team section on a plan that does not include it.
 *
 * The alternative is a blank People page, which answers "how do I add a
 * colleague?" with silence. This answers it.
 */
function TeamUpgradeCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5 text-primary" />
          Adding colleagues
        </CardTitle>
        <CardDescription>
          Inviting other clinicians into the practice, and giving them roles, is part of the Pro
          plan and above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          On your current plan the practice is yours alone. Patients who share with you share with
          you, not with a team — which is the right arrangement for a single clinician and the
          wrong one the moment somebody covers for you.
        </p>
        <Button asChild size="sm">
          <Link to="/pricing?audience=clinicians">See what Pro includes</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default ClinicianPracticeSection;
