import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, Loader2 } from 'lucide-react';

import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Panel, PanelHeader, PanelRow, PanelRows } from '@/components/ui/panel';
import { PracticeInvitationsCard } from '@/components/clinician/PracticeInvitationsCard';
import { TenantOwnerInvitationCard } from '@/components/clinician/TenantOwnerInvitationCard';
import { usePractice } from '@/hooks/usePractice';
import { usePracticeTenant } from '@/hooks/usePracticeTenant';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useClinicianSubscription, hasFeatureAccess } from '@/hooks/useClinicianSubscription';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { availableSections, sectionForLegacyAnchor } from '@/lib/practice-sections';

/**
 * Practice, as a hub rather than a pile.
 *
 * This page used to carry fifteen cards in one column — an ownership
 * invitation, the team, the postal address, the billing currency, the joining
 * code, the staff allowlist, departments, shared patients, an access overview,
 * revenue share, storage, the subscription, EHR connections and branding — all
 * as Cards, so all the same weight, in an order that followed no principle.
 *
 * Now it leads with the only things on it that are time-sensitive (an
 * invitation waiting for an answer is not a setting) and then hands off to
 * four sections grouped by how often somebody touches them. The grouping and,
 * more importantly, the rule that a section is only offered when it has
 * something behind it, live in `@/lib/practice-sections`.
 */
const ClinicianPractice = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isClinician, isLoading: isLoadingProfile } = useClinicianProfile();
  const { currentPractice, currentMembership } = usePractice();
  const { tenant } = usePracticeTenant(currentPractice?.id);
  const { tier } = useClinicianSubscription();

  useSessionTimeout();

  // A bookmark to one of the old anchors should land on the page that absorbed
  // it, rather than on a hub that no longer has the section they wanted.
  useEffect(() => {
    if (!location.hash) return;
    const section = sectionForLegacyAnchor(location.hash);
    if (section) navigate(section.path, { replace: true });
  }, [location.hash, navigate]);

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

  const sections = availableSections({
    hasPractice: Boolean(currentPractice),
    isHospital: (tenant?.tenant_type ?? 'practice') === 'hospital',
    isAdmin: currentMembership?.role === 'owner' || currentMembership?.role === 'admin',
    canManageTeam: hasFeatureAccess(tier, 'team_management'),
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <ClinicianHeader />
      <SectionTabs section="practice" variant="clinician" />

      <main className="container max-w-3xl px-4 py-4 sm:px-6 sm:py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="mb-1 font-display text-2xl font-bold sm:text-3xl">
                {currentPractice?.name ?? 'Practice'}
              </h1>
              <p className="text-sm text-muted-foreground">
                Everything about how the practice runs, in four places instead of one long one.
              </p>
            </div>
          </div>

          {/* Anything waiting on an answer. Both of these render nothing when
              there is nothing pending, so they do not leave a gap. */}
          <TenantOwnerInvitationCard />
          <PracticeInvitationsCard />

          <Panel className="mt-6">
            <PanelHeader
              eyebrow="Manage"
              description="Grouped by how often you need them, most-touched first."
            />
            <PanelRows>
              {sections.map((section) => (
                <PanelRow
                  key={section.id}
                  label={section.label}
                  detail={section.summary}
                  detailClassName="whitespace-normal"
                  trailing={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  onSelect={() => navigate(section.path)}
                  selectLabel={`${section.label} — ${section.summary}`}
                />
              ))}
            </PanelRows>
          </Panel>

          <p className="mt-6 text-xs text-muted-foreground">
            Looking for your own details rather than the practice&rsquo;s? They are under your name
            in the top right. Reports and Compliance have their own tabs above.{' '}
            <Link to="/clinician/settings" className="underline underline-offset-2">
              Settings
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
};

export default ClinicianPractice;
