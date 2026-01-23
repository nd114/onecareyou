import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Stethoscope, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MEDICAL_SPECIALTIES } from '@/hooks/useClinicianProfile';
import { COUNTRY_LIST } from '@/hooks/useEmergencyNumbers';

const ClinicianSignUp = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'account' | 'profile'>('account');
  
  const [accountData, setAccountData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
  });

  const [profileData, setProfileData] = useState({
    practice_name: '',
    specialty: '',
    license_number: '',
    country: '',
  });

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (accountData.password !== accountData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (accountData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setStep('profile');
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Create the user account
      const { error: signUpError } = await signUp(
        accountData.email, 
        accountData.password, 
        accountData.name
      );

      if (signUpError) {
        toast.error(signUpError.message);
        setIsLoading(false);
        return;
      }

      // Wait a moment for the user to be created
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Create clinician profile
        const { error: profileError } = await supabase
          .from('clinician_profiles')
          .insert({
            user_id: user.id,
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-2xl font-bold">Marpe</span>
          </Link>
          <h1 className="font-display text-2xl font-bold">Healthcare Provider Sign Up</h1>
          <p className="text-muted-foreground mt-2">
            Create your clinician account to manage patients
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {step === 'account' ? 'Account Details' : 'Professional Information'}
            </CardTitle>
            <CardDescription>
              {step === 'account' 
                ? 'Enter your account credentials' 
                : 'Tell us about your practice'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'account' ? (
              <form onSubmit={handleAccountSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="Dr. Jane Smith"
                    value={accountData.name}
                    onChange={(e) => setAccountData({ ...accountData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="doctor@hospital.com"
                    value={accountData.email}
                    onChange={(e) => setAccountData({ ...accountData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={accountData.password}
                    onChange={(e) => setAccountData({ ...accountData, password: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={accountData.confirmPassword}
                    onChange={(e) => setAccountData({ ...accountData, confirmPassword: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit" className="w-full gradient-primary border-0">
                  Continue
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
                  <Input
                    id="practice"
                    placeholder="City General Hospital"
                    value={profileData.practice_name}
                    onChange={(e) => setProfileData({ ...profileData, practice_name: e.target.value })}
                  />
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
                  <Label htmlFor="license">License Number (Optional)</Label>
                  <Input
                    id="license"
                    placeholder="For verification purposes"
                    value={profileData.license_number}
                    onChange={(e) => setProfileData({ ...profileData, license_number: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    This helps verify your credentials (trust-based initially)
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
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    'Create Clinician Account'
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link to="/sign-in" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </div>
            
            <div className="mt-4 text-center text-sm">
              <span className="text-muted-foreground">Not a healthcare provider? </span>
              <Link to="/sign-up" className="text-primary hover:underline font-medium">
                Patient sign up
              </Link>
            </div>

            <div className="mt-6 pt-4 border-t border-border text-center">
              <Link 
                to="/clinician/why-marpe" 
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Why healthcare providers choose Marpe →
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default ClinicianSignUp;
