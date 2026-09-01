import { ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { KingsChatSignInButton } from '@/components/auth/KingsChatSignInButton';
import { useAuth } from '@/contexts/AuthContext';
import { resolveSignedInDestination } from '@/lib/post-signin-destination';

const schema = z.object({
  email: z.string().email('Please enter a valid email address').max(255),
  password: z.string().min(1, 'Enter your password'),
});

/**
 * Sign-in on a hospital's own address.
 *
 * Same providers as the generic page — Google, KingsChat, email and password —
 * so someone who already has an account never has to leave the branded front
 * door. The destination follows the account, not the link they arrived on.
 */
export function TenantSignInForm({
  brandColor,
  idPrefix = 'tenant',
  footer,
}: {
  brandColor?: string;
  idPrefix?: string;
  footer?: ReactNode;
}) {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    const { error } = await signIn(form.email, form.password);
    if (error) {
      toast.error(
        error.message.toLowerCase().includes('invalid login')
          ? 'That email and password do not match an account.'
          : error.message,
      );
      setSubmitting(false);
      return;
    }

    const destination = await resolveSignedInDestination();
    toast.success('Welcome back');
    navigate(destination, { replace: true });
  };

  return (
    <div className="space-y-4">
      <GoogleSignInButton label="Sign in with Google" />
      <KingsChatSignInButton label="Sign in with KingsChat" />

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
          <Label htmlFor={`${idPrefix}-signin-email`}>Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id={`${idPrefix}-signin-email`}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
              className="pl-9"
            />
          </div>
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${idPrefix}-signin-password`}>Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id={`${idPrefix}-signin-password`}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Your password"
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

        <Button
          type="submit"
          className="w-full gradient-primary border-0"
          disabled={submitting}
          style={brandColor ? { background: brandColor } : undefined}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          Sign in
        </Button>
      </form>

      {footer}
    </div>
  );
}

export default TenantSignInForm;
