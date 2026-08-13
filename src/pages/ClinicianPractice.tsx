import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { useClinicianSubscription, hasFeatureAccess } from '@/hooks/useClinicianSubscription';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { PracticeInvitationsCard } from '@/components/clinician/PracticeInvitationsCard';
import { TenantOwnerInvitationCard } from '@/components/clinician/TenantOwnerInvitationCard';
import { PracticeTeamSection } from '@/components/clinician/PracticeTeamSection';
import { PracticeBrandingCard } from '@/components/clinician/PracticeBrandingCard';
import { EHRConnectionsSection } from '@/components/clinician/EHRConnectionsSection';
import { SubscriptionManagementCard } from '@/components/clinician/SubscriptionManagementCard';
import { HospitalPatientsCard } from '@/components/clinician/HospitalPatientsCard';
import { HospitalCodeCard } from '@/components/clinician/HospitalCodeCard';
import { PracticeContactCard } from '@/components/clinician/PracticeContactCard';
import { PracticeRevenueShareCard } from '@/components/clinician/PracticeRevenueShareCard';
import { PracticeStorageCard } from '@/components/clinician/PracticeStorageCard';
import { Loader2 } from 'lucide-react';

const ClinicianPractice = () => {
  const location = useLocation();
  const { isClinician, isLoading: isLoadingProfile } = useClinicianProfile();
  const { patients } = useClinicianPatients();
  const { tier } = useClinicianSubscription();

  useSessionTimeout();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
  }, [location.hash]);

  if (isLoadingProfile) {
    return (
      <div className="min-h-screen bg-muted/30">
        <ClinicianHeader />
        <SectionTabs section="practice" variant="clinician" />
        <main className="container py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!isClinician) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <ClinicianHeader />
      <SectionTabs section="practice" variant="clinician" />

      <main className="container py-4 sm:py-8 px-4 sm:px-6 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-6 flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">
                Practice
              </h1>
              <p className="text-muted-foreground text-sm">
                Manage your team, subscription, EHR connections and practice branding.
              </p>
            </div>
          </div>

          {/* Ownership invitation from OneCare (if any) */}
          <div className="mt-2">
            <TenantOwnerInvitationCard />
          </div>

          {/* Practice Invitations (if any) */}
          <div className="mt-2">
            <PracticeInvitationsCard />
          </div>


          {/* Team Management - Pro+ */}
          {hasFeatureAccess(tier, 'team_management') && (
            <div id="practice-team" className="mt-6 scroll-mt-20">
              <PracticeTeamSection />
            </div>
          )}

          {/* Contact and address - owned by the tenant */}
          <div id="practice-contact" className="mt-6 scroll-mt-20">
            <PracticeContactCard />
          </div>

          {/* Hospital code (tenant slug) */}
          <div id="hospital-code" className="mt-6 scroll-mt-20">
            <HospitalCodeCard />
          </div>

          {/* Institution-shared patients (hospital tenancy) */}
          <div id="institution-patients" className="mt-6 scroll-mt-20">
            <HospitalPatientsCard />
          </div>

          {/* Revenue share (institutional partners only) */}
          <div id="revenue-share" className="mt-6 scroll-mt-20">
            <PracticeRevenueShareCard />
          </div>

          {/* Storage & durability */}
          <div id="storage" className="mt-6 scroll-mt-20">
            <PracticeStorageCard />
          </div>

          {/* Subscription */}
          <div id="subscription" className="mt-6 scroll-mt-20">

            <SubscriptionManagementCard patientCount={patients.length} />
          </div>

          {/* EHR Connections */}
          <div id="ehr-connections" className="mt-6 scroll-mt-20">
            <EHRConnectionsSection />
          </div>

          {/* Branding - Enterprise only */}
          {hasFeatureAccess(tier, 'practice_branding') && (
            <div id="branding" className="mt-6 scroll-mt-20">
              <PracticeBrandingCard />
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default ClinicianPractice;
