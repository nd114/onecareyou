import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TenantAuthShell } from '@/components/tenant/TenantAuthShell';
import { TenantSignInForm } from '@/components/tenant/TenantSignInForm';
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

const HIGHLIGHTS = [
  'See the patients assigned to you by your department',
  'Vitals, medications and documents your patients choose to share',
  'Write guidance they actually receive, and notes that stay internal',
];

/**
 * Staff front door at a hospital's own address (lmc.onecare.you/staff).
 *
 * The patient side of this address has been branded since launch; this gives
 * clinicians the same front door instead of sending them to the generic
 * sign-up and asking them to type their hospital's name into a free-text box
 * that nobody checks. Returning staff sign in here too — same page, same
 * branding — and then join the hospital without a second account.
 *
 * Recognition is the hospital's, not ours: request_practice_affiliation()
 * admits anyone on an approved domain or the hospital's allowlist, and parks
 * everyone else in pending approval holding no access at all.
 */
export default function InstitutionStaffSignUp({
  institution: institutionProp,
  slug: slugProp,
  initialMode = 'sign-up',
}: {
  institution?: PublicInstitution | null;
  slug?: string | null;
  initialMode?: 'sign-up' | 'sign-in';
} = {}) {
  const slug = slugProp ?? institutionSlugFromHost();
  const branding = useInstitutionBranding(institutionProp ? null : slug);
  const institution = institutionProp ?? branding.institution;
  const isLoading = institutionProp ? false : branding.isLoading;

  const { signUp, user, loading: authLoading } = useAuth();
  const { createClinicianProfile, isClinician } = useClinicianProfile();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'sign-up' | 'sign-in'>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });

  const primary = institution?.primary_color || undefined;

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
    <TenantAuthShell
      institution={institution}
      eyebrow="For clinical staff"
      headline="Follow your patients after they leave the ward."
      highlights={HIGHLIGHTS}
      icon={Stethoscope}
      seoTitle={
        institution ? `Staff access — ${institution.name} by OneCare` : 'Staff access'
      }
      seoDescription={`Join or sign in to ${hospitalName} on OneCare as a member of clinical staff.`}
    >
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
              onClick={() =>
                navigate(outcome === 'active' ? '/clinician/today' : '/clinician/settings')
              }
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
              You're signed in as {user.email}. Joining tags this account with {hospitalName} — it
              does not create a second profile, and your own patients stay yours.
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
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate(isClinician ? '/clinician/today' : '/dashboard')}
            >
              Continue to OneCare
            </Button>
            {!isClinician && (
              <p className="text-xs text-muted-foreground">
                This account has no clinician profile yet. You can add one from Settings after
                joining.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">
              {mode === 'sign-up' ? 'Staff sign-up' : 'Staff sign-in'}
            </CardTitle>
            <CardDescription>
              {mode === 'sign-up'
                ? `Use your work email. ${hospitalName} recognises its own staff automatically — anything else goes to an administrator there to approve.`
                : `Sign in to your OneCare account at ${hospitalName}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'sign-up' | 'sign-in')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="sign-up">Create account</TabsTrigger>
                <TabsTrigger value="sign-in">Sign in</TabsTrigger>
              </TabsList>

              <TabsContent value="sign-up" className="mt-4 space-y-4">
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
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
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
                  <button
                    type="button"
                    onClick={() => setMode('sign-in')}
                    className="text-primary font-medium hover:underline"
                  >
                    Sign in
                  </button>{' '}
                  and join from here.
                </p>
              </TabsContent>

              <TabsContent value="sign-in" className="mt-4">
                <TenantSignInForm
                  brandColor={primary}
                  idPrefix="staff"
                  footer={
                    <p className="text-sm text-center text-muted-foreground">
                      New to OneCare?{' '}
                      <button
                        type="button"
                        onClick={() => setMode('sign-up')}
                        className="text-primary font-medium hover:underline"
                      >
                        Create a staff account
                      </button>
                    </p>
                  }
                />
              </TabsContent>
            </Tabs>

            <p className="text-xs text-center text-muted-foreground">
              Are you a patient?{' '}
              <Link to="/" className="text-primary hover:underline">
                Go to the patient page
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </TenantAuthShell>
  );
}
