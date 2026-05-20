import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AIChatFAB } from './AIChatFAB';

// Patient-facing routes where the AI assistant should be available.
const ALLOWED_PREFIXES = [
  '/dashboard',
  '/vitals',
  '/medications',
  '/schedule',
  '/care-circle',
  '/health-vault',
  '/family',
  '/adherence-report',
  '/guidance',
  '/knowledge-base',
  '/medication-info',
  '/messages',
  '/settings',
];

// Routes to exclude even if a prefix matches.
const EXCLUDED_PREFIXES = [
  '/clinician',
  '/onboarding',
  '/install',
  '/subscription-success',
  '/assist', // Simple Mode IS the assistant — no need for a floating button on top of it
];

export function PatientAIChatMount() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (!user) return null;
  if (EXCLUDED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return null;
  if (!ALLOWED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return null;

  return <AIChatFAB />;
}
