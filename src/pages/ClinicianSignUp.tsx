import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Stethoscope, ArrowLeft, ArrowRight, Mail, Lock, User, Eye, EyeOff, Building2, Award } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MEDICAL_SPECIALTIES } from '@/hooks/useClinicianProfile';
import { COUNTRY_LIST } from '@/hooks/useEmergencyNumbers';
import { z } from 'zod';

const CLINICIAN_TITLES = [
  'Dr.',
  'Prof.',
  'Mr.',
  'Mrs.',
  'Ms.',
  'Nurse',
  'NP',
  'PA',
  'PharmD',
];

const accountSchema = z.object({
  title: z.string().min(1, 'Please select a title'),
  firstName: z.string().min(1, 'First name is required').max(50, 'First name must be less than 50 characters'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name must be less than 50 characters'),
  email: z.string().email('Please enter a valid email address').max(255, 'Email must be less than 255 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be less than 72 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

const ClinicianSignUp = () => {
  const navigate = useNavigate();
  const { signUp, user, loading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'account' | 'profile'>('account');
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [accountData, setAccountData] = useState({
    title: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [profileData, setProfileData] = useState({
    practice_name: '',
    specialty: '',
    license_number: '',
    country: '',
  });

  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      navigate('/clinician/dashboard', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    const result = accountSchema.safeParse(accountData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setStep('profile');
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Construct full name for the profiles table
      const fullName = `${accountData.title} ${accountData.firstName} ${accountData.lastName}`.trim();
      
      // Create the user account
      const { error: signUpError } = await signUp(
        accountData.email, 
        accountData.password, 
        fullName
      );

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          toast.error('This email is already registered. Please sign in instead.');
        } else {
          toast.error(signUpError.message);
        }
        setIsLoading(false);
        return;
      }

      // Wait a moment for the user to be created
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Create clinician profile with split name fields
        const { error: profileError } = await supabase
          .from('clinician_profiles')
          .insert({
            user_id: user.id,
            title: accountData.title || null,
            first_name: accountData.firstName || null,
            last_name: accountData.lastName || null,
            practice_name: profileData.practice_name || null,
            specialty: profileData.specialty || null,
            license_number: profileData.license_number || null,
            country: profileData.country || null,
          });

        if (profileError) {
          console.error('Error creating clinician profile:', profileError);
          toast.error('Account created but failed to set up clinician profile');
        }
      }

      toast.success('Clinician account created successfully!');
      navigate('/clinician/dashboard');
    } catch (error: any) {
      console.error('Sign up error:', error);
      toast.error(error.message || 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary">
            <Stethoscope className="h-7 w-7 text-primary-foreground" />
          </div>
          <span className="font-display text-2xl font-bold">Marpe</span>
        </Link>

        <Card className="border-border/50 shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {step === 'account' ? 'Create Clinician Account' : 'Professional Details'}
            </CardTitle>
            <CardDescription>
              {step === 'account' 
                ? 'Join Marpe to manage your patients remotely' 
                : 'Tell us about your practice (optional)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'account' ? (
              <form onSubmit={handleAccountSubmit} className="space-y-4">
                {/* Title and Name Row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Select
                      value={accountData.title}
                      onValueChange={(value) => setAccountData({ ...accountData, title: value })}
                    >
                      <SelectTrigger className={errors.title ? 'border-destructive' : ''}>
                        <SelectValue placeholder="Title" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLINICIAN_TITLES.map(title => (
                          <SelectItem key={title} value={title}>
                            {title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.title && (
                      <p className="text-xs text-destructive">{errors.title}</p>
                    )}
                  </div>
                  
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder="Jane"
                      value={accountData.firstName}
                      onChange={(e) => setAccountData({ ...accountData, firstName: e.target.value })}
                      className={errors.firstName ? 'border-destructive' : ''}
                    />
                    {errors.firstName && (
                      <p className="text-xs text-destructive">{errors.firstName}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="lastName"
                      type="text"
                      placeholder="Smith"
                      value={accountData.lastName}
                      onChange={(e) => setAccountData({ ...accountData, lastName: e.target.value })}
                      className={`pl-10 ${errors.lastName ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {errors.lastName && (
                    <p className="text-sm text-destructive">{errors.lastName}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="doctor@hospital.com"
                      value={accountData.email}
                      onChange={(e) => setAccountData({ ...accountData, email: e.target.value })}
                      className={`pl-10 ${errors.email ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimum 8 characters"
                      value={accountData.password}
                      onChange={(e) => setAccountData({ ...accountData, password: e.target.value })}
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

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      value={accountData.confirmPassword}
                      onChange={(e) => setAccountData({ ...accountData, confirmPassword: e.target.value })}
                      className={`pl-10 ${errors.confirmPassword ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                  )}
                </div>

                <Button type="submit" className="w-full gradient-primary border-0">
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            ) : (
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep('account')}
                  className="mb-2 -ml-2"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                
                <div className="space-y-2">
                  <Label htmlFor="practice">Practice/Hospital Name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="practice"
                      placeholder="City General Hospital"
                      value={profileData.practice_name}
                      onChange={(e) => setProfileData({ ...profileData, practice_name: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Specialty</Label>
                  <Select
                    value={profileData.specialty}
                    onValueChange={(value) => setProfileData({ ...profileData, specialty: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your specialty" />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDICAL_SPECIALTIES.map(specialty => (
                        <SelectItem key={specialty} value={specialty}>
                          {specialty}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="license">License Number</Label>
                  <div className="relative">
                    <Award className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="license"
                      placeholder="For verification purposes"
                      value={profileData.license_number}
                      onChange={(e) => setProfileData({ ...profileData, license_number: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Optional - helps verify your credentials
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select
                    value={profileData.country}
                    onValueChange={(value) => setProfileData({ ...profileData, country: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_LIST.map(country => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  type="submit" 
                  className="w-full gradient-primary border-0"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create Account
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/sign-in" className="text-primary font-medium hover:underline">
                  Sign in
                </Link>
              </p>
              
              <div className="flex items-center gap-2 justify-center text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Not a healthcare provider?</span>
                <Link to="/sign-up" className="text-primary font-medium hover:underline">
                  Patient sign up
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By creating an account, you agree to our{' '}
          <Link to="/terms" className="underline hover:text-foreground">Terms</Link>
          {' '}and{' '}
          <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
        </p>
      </motion.div>
    </div>
  );
};

export default ClinicianSignUp;
