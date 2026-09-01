import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { KingsChatSignInButton } from '@/components/auth/KingsChatSignInButton';
import { TenantAuthShell } from '@/components/tenant/TenantAuthShell';
import { TenantSignInForm } from '@/components/tenant/TenantSignInForm';
import { useAuth } from '@/contexts/AuthContext';
import { institutionSlugFromHost, useInstitutionBranding, type PublicInstitution } from '@/hooks/useInstitutionBranding';


const schema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Please enter a valid email address').max(255),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

const HIGHLIGHTS = [
  'Your medications, vitals and documents in one place',
  'Share updates with your care team — you stay in control',
  'Catch-up reminders so nothing slips after discharge',
];

/**
 * Branded patient front door served at an institution's own address
 * (e.g. lmc.onecare.you). The tenant is resolved from the hostname and
 * rendered in place — no redirect to a /i/:slug path.
 *
 * The same page carries both halves of the door: creating an account and
 * signing back into one, so a returning patient never lands on an unbranded
 * OneCare form.
 */
export default function InstitutionSignUp({
  institution: institutionProp,
  slug: slugProp,
  initialMode = 'sign-up',
}: {
  institution?: PublicInstitution | null;
  slug?: string | null;
  initialMode?: 'sign-up' | 'sign-in';
} = {}) {
  const params = useParams<{ slug?: string }>();
  const slug = slugProp ?? institutionSlugFromHost() ?? params.slug ?? null;
  const branding = useInstitutionBranding(institutionProp ? null : slug);
  const institution = institutionProp ?? branding.institution;
  const isLoading = institutionProp ? false : branding.isLoading;

  const { signUp, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'sign-up' | 'sign-in'>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });

  useEffect(() => {
    // Only intake sends people to onboarding; the sign-in tab decides its own
    // destination from the account (patient dashboard vs clinician surface).
    if (mode === 'sign-up' && user && !authLoading) navigate('/onboarding', { replace: true });
  }, [mode, user, authLoading, navigate]);

  useEffect(() => {
    // localStorage so intake survives email confirmation and a fresh tab.
    if (slug) {
      localStorage.setItem('onecare.institution_slug', slug);
      sessionStorage.setItem('onecare.institution_slug', slug);
    }
  }, [slug]);

  const primary = institution?.primary_color || undefined;

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
    const { error } = await signUp(form.email, form.password, form.name);
    if (error) {
      toast.error(
        error.message.includes('already registered')
          ? 'This email is already registered. Please sign in instead.'
          : error.message,
      );
      setSubmitting(false);
      return;
    }
    toast.success('Account created — let’s set up your health profile.');
    navigate('/onboarding');
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TenantAuthShell
      institution={institution}
      eyebrow={
        institution ? [institution.city, institution.country].filter(Boolean).join(', ') : undefined
      }
      headline="Your care continues after you go home."
      highlights={HIGHLIGHTS}
      icon={ShieldCheck}
      seoTitle={
        institution
          ? `${institution.name} — Join or sign in on OneCare`
          : 'Join or sign in on OneCare'
      }
      seoDescription={
        institution
          ? `Create your OneCare account or sign in to stay connected with ${institution.name} after you leave the ward.`
          : 'Create your OneCare account or sign in.'
      }
    >
      <Card className="border-border/60 shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">
            {mode === 'sign-up' ? 'Create your account' : 'Welcome back'}
          </CardTitle>
          <CardDescription>
            {mode === 'sign-up'
              ? institution
                ? `${institution.name} invited you to keep your health record with you.`
                : 'Start managing your health safely today.'
              : institution
                ? `Sign in to your OneCare account at ${institution.name}.`
                : 'Sign in to your OneCare account.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'sign-up' | 'sign-in')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sign-up">Create account</TabsTrigger>
              <TabsTrigger value="sign-in">Sign in</TabsTrigger>
            </TabsList>

            <TabsContent value="sign-up" className="mt-4 space-y-4">
              <GoogleSignInButton />
              <KingsChatSignInButton />
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inst-name">Full name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="inst-name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Your name"
                      className="pl-9"
                    />
                  </div>
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inst-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="inst-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="you@example.com"
                      className="pl-9"
                    />
                  </div>
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inst-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="inst-password"
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
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inst-confirm">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="inst-confirm"
                      type={showPassword ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                      placeholder="Repeat your password"
                      className="pl-9"
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-destructive">{errors.confirmPassword}</p>
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
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  Create account
                </Button>
              </form>

              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('sign-in')}
                  className="text-primary font-medium hover:underline"
                >
                  Sign in
                </button>
              </p>
            </TabsContent>

            <TabsContent value="sign-in" className="mt-4">
              <TenantSignInForm
                brandColor={primary}
                idPrefix="inst"
                footer={
                  <p className="text-sm text-center text-muted-foreground">
                    New here?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('sign-up')}
                      className="text-primary font-medium hover:underline"
                    >
                      Create an account
                    </button>
                  </p>
                }
              />
            </TabsContent>
          </Tabs>

          {institution?.slug && mode === 'sign-up' && (
            <p className="text-xs text-center text-muted-foreground">
              After signing up, connect with the code{' '}
              <span className="font-mono">{institution.slug}</span> in Care Circle.
            </p>
          )}
          {institution && (
            <p className="text-xs text-center text-muted-foreground">
              Work at {institution.name}?{' '}
              <Link
                to={mode === 'sign-in' ? '/clinician/sign-in' : '/staff'}
                className="text-primary hover:underline"
              >
                {mode === 'sign-in' ? 'Staff sign-in' : 'Staff sign-up'}
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </TenantAuthShell>
  );
}
