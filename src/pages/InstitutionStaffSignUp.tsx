import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Stethoscope,
  User,
} from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { SEOHead } from '@/components/seo/SEOHead';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import {
  institutionSlugFromHost,
  useInstitutionBranding,
  type PublicInstitution,
} from '@/hooks/useInstitutionBranding';

const schema = z
  .object({
    firstName: z.string().min(1, 'Enter your first name').max(60),
    lastName: z.string().min(1, 'Enter your last name').max(60),
    email: z.string().email('Please enter a valid work email address').max(255),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  })
  .strict();

type Outcome = 'active' | 'pending_approval' | null;

/**
 * Staff registration at a hospital's own address (lmc.onecare.you/staff).
 *
 * The patient side of this address has been branded since launch; this gives
 * clinicians the same front door instead of sending them to the generic
 * sign-up and asking them to type their hospital's name into a free-text box
 * that nobody checks.
 *
 * Recognition is the hospital's, not ours: request_practice_affiliation()
 * admits anyone on an approved domain or the hospital's allowlist, and parks
 * everyone else in pending approval holding no access at all.
 */
export default function InstitutionStaffSignUp({
  institution: institutionProp,
  slug: slugProp,
}: {
  institution?: PublicInstitution | null;
  slug?: string | null;
} = {}) {
  const slug = slugProp ?? institutionSlugFromHost();
  const branding = useInstitutionBranding(institutionProp ? null : slug);
  const institution = institutionProp ?? branding.institution;
  const isLoading = institutionProp ? false : branding.isLoading;

  const { signUp, user, loading: authLoading } = useAuth();
  const { createClinicianProfile, isClinician } = useClinicianProfile();
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });

  // Tenant branding here is name, logo and colours — the same front door the
  // patient side uses.
  const primary = institution?.primary_color || undefined;
  const accent = institution?.accent_color || undefined;

  useEffect(() => {
    if (slug) sessionStorage.setItem('onecare.staff_slug', slug);
  }, [slug]);

  const requestAffiliation = async () => {
    if (!slug) return null;
    const { data, error } = await (supabase as any).rpc('request_practice_affiliation', {
      _slug: slug,
    });
    if (error) throw error;
    return data as Outcome;
  };

  /** Already signed in — join this hospital without creating a second account. */
  const handleJoin = async () => {
    setSubmitting(true);
    try {
      const status = await requestAffiliation();
      setOutcome(status);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send your request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const result = schema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
    const { error } = await signUp(form.email, form.password, fullName);
    if (error) {
      toast.error(
        error.message.includes('already registered')
          ? 'This email already has a OneCare account — sign in and you can join from here.'
          : error.message,
      );
      setSubmitting(false);
      return;
    }

    try {
      // Affiliation tags the account; the clinical profile is what makes them a
      // clinician rather than a patient. Both, in that order, then the outcome.
      await createClinicianProfile.mutateAsync({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        practice_name: institution?.name ?? undefined,
      });
      const status = await requestAffiliation();
      setOutcome(status);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Account created, but the request did not send',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hospitalName = institution?.name ?? 'this hospital';

  return (
    <div className="relative min-h-screen bg-background">
      <SEOHead
        title={institution ? `Staff sign-up — ${institution.name} by OneCare` : 'Staff sign-up'}
        description={`Join ${hospitalName} on OneCare as a member of clinical staff.`}
        noIndex
      />

      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="grid lg:grid-cols-2 min-h-screen">
        {/* Branded panel */}
        <div
          className="relative hidden lg:flex flex-col justify-between p-12 text-primary-foreground"
          style={{
            background: primary ? `linear-gradient(160deg, ${primary}, ${accent || primary})` : undefined,
          }}
        >
          {!primary && <div className="absolute inset-0 gradient-primary" aria-hidden />}
          <div className="relative">
            <div className="flex items-center gap-3">
              {institution?.logo_url ? (
                <img
                  src={institution.logo_url}
                  alt={`${institution.name} logo`}
                  className="h-12 w-12 rounded-xl bg-background/90 object-contain p-1"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background/20">
                  <Building2 className="h-6 w-6" />
                </div>
              )}
              <div>
                <p className="font-display text-2xl font-bold leading-tight">
                  {institution ? `${institution.name} by OneCare` : 'OneCare'}
                </p>
                <p className="text-sm opacity-80">For clinical staff</p>
              </div>
            </div>

            <h1 className="font-display text-4xl font-bold mt-12 max-w-md leading-tight">
              Follow your patients after they leave the ward.
            </h1>
            <ul className="mt-8 space-y-3 max-w-md text-sm opacity-90">
              {[
                'See the patients assigned to you by your department',
                'Vitals, medications and documents your patients choose to share',
                'Write guidance they actually receive, and notes that stay internal',
              ].map((h) => (
                <li key={h} className="flex items-start gap-3">
                  <Stethoscope className="h-4 w-4 mt-0.5 shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs opacity-75">
            Powered by OneCare · Encrypted at rest and in transit
          </p>
        </div>

        {/* Form */}
        <div className="flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md"
          >
            <div className="lg:hidden flex items-center gap-3 mb-6">
              {institution?.logo_url ? (
                <img
                  src={institution.logo_url}
                  alt={`${institution.name} logo`}
                  className="h-10 w-10 rounded-lg border object-contain p-1"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary">
                  <Stethoscope className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
              <span className="font-display text-xl font-bold">
                {institution ? `${institution.name} by OneCare` : 'OneCare'}
              </span>
            </div>

            {/* Outcome — recognised, or waiting for the hospital to approve. */}
            {outcome ? (
              <Card className="border-border/60 shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    {outcome === 'active' ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        You're in
                      </>
                    ) : (
                      <>
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        Waiting for approval
                      </>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {outcome === 'active'
                      ? `${hospitalName} recognised your account. You can start now — patients appear here once your department assigns them to you.`
                      : `We've sent your request to ${hospitalName}. An administrator there needs to approve it before you can see any patient information. You'll keep your OneCare account either way.`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    className="w-full gradient-primary border-0"
                    onClick={() => navigate(outcome === 'active' ? '/clinician/today' : '/clinician/settings')}
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    {outcome === 'active' ? 'Go to my patients' : 'Finish my profile'}
                  </Button>
                </CardContent>
              </Card>
            ) : user ? (
              /* Signed in already — no second account, just the affiliation. */
              <Card className="border-border/60 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-xl">Join {hospitalName}</CardTitle>
                  <CardDescription>
                    You're signed in as {user.email}. Joining tags this account with{' '}
                    {hospitalName} — it does not create a second profile, and your own patients
                    stay yours.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    className="w-full gradient-primary border-0"
                    onClick={handleJoin}
                    disabled={submitting}
                    style={primary ? { background: primary } : undefined}
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                    Request affiliation
                  </Button>
                  {!isClinician && (
                    <p className="text-xs text-muted-foreground">
                      This account has no clinician profile yet. You can add one from Settings
                      after joining.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/60 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-2xl">Staff sign-up</CardTitle>
                  <CardDescription>
                    Use your work email. {hospitalName} recognises its own staff automatically —
                    anything else goes to an administrator there to approve.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="staff-first">First name</Label>
                        <Input
                          id="staff-first"
                          value={form.firstName}
                          onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                          placeholder="Ada"
                        />
                        {errors.firstName && (
                          <p className="text-xs text-destructive">{errors.firstName}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="staff-last">Last name</Label>
                        <Input
                          id="staff-last"
                          value={form.lastName}
                          onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                          placeholder="Obi"
                        />
                        {errors.lastName && (
                          <p className="text-xs text-destructive">{errors.lastName}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="staff-email">Work email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="staff-email"
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          placeholder="you@hospital.org"
                          className="pl-9"
                        />
                      </div>
                      {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="staff-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="staff-password"
                          type={showPassword ? 'text' : 'password'}
                          value={form.password}
                          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                          placeholder="At least 8 characters"
                          className="pl-9 pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.password && (
                        <p className="text-xs text-destructive">{errors.password}</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full gradient-primary border-0"
                      disabled={submitting}
                      style={primary ? { background: primary } : undefined}
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <User className="h-4 w-4 mr-2" />
                      )}
                      Create my staff account
                    </Button>
                  </form>

                  <p className="text-sm text-center text-muted-foreground">
                    Already have a OneCare account?{' '}
                    <Link to="/sign-in" className="text-primary font-medium hover:underline">
                      Sign in
                    </Link>{' '}
                    and join from here.
                  </p>
                  <p className="text-xs text-center text-muted-foreground">
                    Are you a patient?{' '}
                    <Link to="/" className="text-primary hover:underline">
                      Sign up here instead
                    </Link>
                    .
                  </p>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
