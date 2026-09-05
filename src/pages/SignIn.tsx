import { motion } from 'framer-motion';
import { AuthHeader } from '@/components/layout/AuthHeader';
import { SEOHead } from '@/components/seo/SEOHead';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, Stethoscope, Heart } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useAdminRole } from '@/hooks/useAdminRole';
import { homeRouteFor } from '@/lib/home-route';

import { z } from 'zod';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { KingsChatSignInButton } from '@/components/auth/KingsChatSignInButton';
import { safeInternalPath } from '@/lib/safe-path';

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * One sign-in form, two doors.
 *
 * /clinician/sign-in fell through to this page unchanged off a hospital host,
 * so a doctor arriving at the clinician door was told to "sign in to access
 * your health dashboard" and offered a patient sign-up underneath. The
 * credentials and the destination are the same either way — the account
 * decides where you land — but the words should match the door you came in.
 */
const SignIn = ({ audience = 'patient' }: { audience?: 'patient' | 'clinician' } = {}) => {
  const forClinicians = audience === 'clinician';
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, user, loading: authLoading } = useAuth();
  const { isClinician, isTenantAdmin, isLoading: clinicianLoading } = useClinicianProfile();
  const { isAdmin, isLoading: adminLoading } = useAdminRole();

  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  // Why the sign-in was refused stays on the form. A toast in the corner is
  // easy to miss and gone before you have read it.
  const [formError, setFormError] = useState<string | null>(null);

  // Where they were headed before the guard sent them here. It comes from
  // the URL, so it is not ours to trust — see safeInternalPath.
  const from = safeInternalPath(
    (location.state as { from?: { pathname?: unknown } } | null)?.from?.pathname,
    '',
  );

  // Already signed in? Go where this person belongs. `homeRouteFor` is shared
  // with the root route so the logo and a sign-in redirect cannot disagree:
  // admins to the console, hospital owners to their practice, clinicians to
  // their working day, everyone else to their own record.
  useEffect(() => {
    if (user && !authLoading && !clinicianLoading && !adminLoading) {
      navigate(from || homeRouteFor({ isAdmin, isTenantAdmin, isClinician }), { replace: true });
    }
  }, [
    user, authLoading, clinicianLoading, adminLoading,
    isAdmin, isTenantAdmin, isClinician, navigate, from,
  ]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    
    // Validate form
    const result = signInSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as keyof typeof fieldErrors] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }
    
    setIsLoading(true);
    
    const { error } = await signIn(formData.email, formData.password);
    
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setFormError('That email and password do not match an account.');
      } else if (error.message.includes('Email not confirmed')) {
        setFormError('Confirm your email address before signing in — check your inbox.');
      } else {
        setFormError(error.message);
      }
      setIsLoading(false);
      return;
    }
    
    toast.success('Welcome back!');
    // Without a remembered destination this used to be navigate(undefined),
    // which quietly re-navigates to the sign-in page and leaves the effect
    // above to do the real work a render later.
    navigate(from || homeRouteFor({ isAdmin, isTenantAdmin, isClinician }), { replace: true });
  };

  if (authLoading || clinicianLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <AuthHeader />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AuthHeader />
      <div className="flex-1 gradient-hero flex items-center justify-center p-4">

      <SEOHead
        title={forClinicians ? 'Clinician sign in' : 'Sign In'}
        description={
          forClinicians
            ? 'Sign in to OneCare to see your patients, their alerts and your practice.'
            : 'Sign in to your OneCare account to access your health dashboard, medications, vitals, and care team.'
        }
        canonical={forClinicians ? '/clinician/sign-in' : '/sign-in'}
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary">
            <Heart className="h-7 w-7 text-primary-foreground" />
          </div>
          <span className="font-display text-2xl font-bold">OneCare</span>
        </Link>

        <Card className="border-border/50 shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome Back</CardTitle>
            <CardDescription>
              {forClinicians
                ? 'Sign in to your patients, alerts and practice'
                : 'Sign in to access your health dashboard'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {formError && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {formError}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`pl-10 ${errors.email ? 'border-destructive' : ''}`}
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link 
                    to="/forgot-password" 
                    className="text-xs text-muted-foreground hover:text-primary"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={`pl-10 pr-10 ${errors.password ? 'border-destructive' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full gradient-primary border-0" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <GoogleSignInButton label="Sign in with Google" />

            <div className="mt-3">
              <KingsChatSignInButton label="Sign in with KingsChat" />
            </div>

            <div className="mt-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Link
                  to={forClinicians ? '/clinician/sign-up' : '/sign-up'}
                  className="text-primary font-medium hover:underline"
                >
                  {forClinicians ? 'Register your practice' : 'Sign up'}
                </Link>
              </p>

              <div className="flex items-center gap-2 justify-center text-sm">
                {forClinicians ? (
                  <>
                    <Heart className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Here for your own record?</span>
                    <Link to="/sign-up" className="text-primary font-medium hover:underline">
                      Start here
                    </Link>
                  </>
                ) : (
                  <>
                    <Stethoscope className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Healthcare provider?</span>
                    <Link to="/clinician/sign-up" className="text-primary font-medium hover:underline">
                      Register here
                    </Link>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By signing in, you agree to our{' '}
          <Link to="/terms" className="underline hover:text-foreground">Terms</Link>
          {' '}and{' '}
          <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
        </p>
      </motion.div>
      </div>
    </div>
  );
};

export default SignIn;
