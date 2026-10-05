import { useNavigate } from 'react-router-dom';
import { LimitBanner } from '@/components/LimitBanner';
import { useEntitlements } from '@/hooks/useEntitlements';
import { CLINICIAN_TIER_INFO } from '@/hooks/useClinicianSubscription';

interface PatientLimitBannerProps {
  patientCount: number;
}

/**
 * The next plan up, named and sized from CLINICIAN_TIER_INFO (the pricing page's
 * own figures), as a sentence for the banner. Null when there is nothing above.
 */
export function upgradeHintFor(tier: string): string | null {
  const next = (key: 'solo' | 'pro' | 'clinic' | 'enterprise') =>
    `Upgrade to ${CLINICIAN_TIER_INFO[key].name} for up to ${CLINICIAN_TIER_INFO[key].patientLimit.toLocaleString('en-US')} patients.`;
  if (tier === 'trial' || tier === 'community') return next('solo');
  if (tier === 'solo') return next('pro');
  if (tier === 'pro') return next('clinic');
  if (tier === 'clinic') return next('enterprise');
  return null;
}

/**
 * The clinician's patient-limit banner. The limit comes from entitlements_for,
 * the same figure the database enforces; the count is the page's own so the
 * banner and the list agree. Drawn only once the answer is in.
 */
export function PatientLimitBanner({ patientCount }: PatientLimitBannerProps) {
  const navigate = useNavigate();
  const { entitlements, ready } = useEntitlements();

  if (!ready || !entitlements) return null;

  return (
    <LimitBanner
      kind="patients"
      used={patientCount}
      limit={entitlements.patientLimit}
      upgradeHint={upgradeHintFor(entitlements.tier)}
      onUpgrade={() => navigate('/clinician/pricing')}
    />
  );
}
