import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, Eye, EyeOff, Heart, Loader2, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { SEOHead } from '@/components/seo/SEOHead';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useAuth } from '@/contexts/AuthContext';
import { institutionSlugFromHost, useInstitutionBranding, type PublicInstitution } from '@/hooks/useInstitutionBranding';
import { ThemeToggle } from '@/components/layout/ThemeToggle';


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
 * Branded sign-up page served at an institution's own address
 * (e.g. lmc.onecare.you). The tenant is resolved from the hostname and
 * rendered in place — no redirect to a /i/:slug path.
 */
export default function InstitutionSignUp({
  institution: institutionProp,
  slug: slugProp,
}: {
  institution?: PublicInstitution | null;
  slug?: string | null;
} = {}) {
  const params = useParams<{ slug?: string }>();
  const slug = slugProp ?? institutionSlugFromHost() ?? params.slug ?? null;
  const branding = useInstitutionBranding(institutionProp ? null : slug);
  const institution = institutionProp ?? branding.institution;
  const isLoading = institutionProp ? false : branding.isLoading;

  const { signUp, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });

  useEffect(() => {
    if (user && !authLoading) navigate('/onboarding', { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    // localStorage so intake survives email confirmation and a fresh tab.
    if (slug) {
      localStorage.setItem('onecare.institution_slug', slug);
      sessionStorage.setItem('onecare.institution_slug', slug);
    }
  }, [slug]);


  const primary = institution?.primary_color || undefined;
  const accent = institution?.accent_color || undefined;

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
    <div className="relative min-h-screen bg-background">
      <SEOHead
        title={institution ? `${institution.name} — Join on OneCare` : 'Join on OneCare'}
        description={
          institution
            ? `Create your OneCare account to stay connected with ${institution.name} after you leave the ward.`
            : 'Create your OneCare account.'
        }
        noIndex
      />

      {/* Global theme control (light / dark / system) */}
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="grid lg:grid-cols-2 min-h-screen">

        {/* Branded panel */}
        <div
          className="relative hidden lg:flex flex-col justify-between p-12 text-primary-foreground"
          style={{
            background: primary
              ? `linear-gradient(160deg, ${primary}, ${accent || primary})`
              : undefined,
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
                  {institution?.name ?? 'OneCare'}
                </p>
                {institution && (
                  <p className="text-sm opacity-80">
                    {[institution.city, institution.country].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </div>

            <h1 className="font-display text-4xl font-bold mt-12 max-w-md leading-tight">
              Your care continues after you go home.
            </h1>
            <ul className="mt-8 space-y-3 max-w-md">
              {HIGHLIGHTS.map((h) => (
                <li key={h} className="flex items-start gap-3 text-sm opacity-90">
                  <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
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
                  <Heart className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
              <span className="font-display text-xl font-bold">
                {institution?.name ?? 'OneCare'}
              </span>
            </div>

            <Card className="border-border/60 shadow-xl">
              <CardHeader>
                <CardTitle className="text-2xl">Create your account</CardTitle>
                <CardDescription>
                  {institution
                    ? `${institution.name} invited you to keep your health record with you.`
                    : 'Start managing your health safely today.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <GoogleSignInButton />
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
                    {errors.password && (
                      <p className="text-xs text-destructive">{errors.password}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="inst-confirm">Confirm password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="inst-confirm"
                        type={showPassword ? 'text' : 'password'}
                        value={form.confirmPassword}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, confirmPassword: e.target.value }))
                        }
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
                  <Link to="/sign-in" className="text-primary font-medium hover:underline">
                    Sign in
                  </Link>
                </p>
                {institution?.slug && (
                  <p className="text-xs text-center text-muted-foreground">
                    After signing up, connect with the code{' '}
                    <span className="font-mono">{institution.slug}</span> in Care Circle.
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
