import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Building2, 
  Send, 
  Loader2,
  Check,
  Shield,
  Users,
  Link2,
  HeadphonesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile, MEDICAL_SPECIALTIES } from '@/hooks/useClinicianProfile';
import { COUNTRY_LIST } from '@/hooks/useEmergencyNumbers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const EHR_SYSTEMS = [
  'Epic',
  'Cerner',
  'Allscripts',
  'Meditech',
  'NextGen',
  'eClinicalWorks',
  'Veradigm (Allscripts)',
  'HealthBridge Clinical',
  'Other',
  'None / Custom',
];

const PRACTICE_SIZES = [
  '1-5 providers',
  '6-20 providers',
  '21-50 providers',
  '51-100 providers',
  '100+ providers',
  'Hospital / Health System',
];

const EnterpriseInquiry = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { clinicianProfile } = useClinicianProfile();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    contact_name: profile?.name || '',
    contact_email: user?.email || '',
    contact_phone: profile?.phone_number || '',
    practice_name: clinicianProfile?.practice_name || '',
    practice_size: '',
    specialty: clinicianProfile?.specialty || '',
    country: clinicianProfile?.country || '',
    ehr_system: '',
    requirements: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.contact_email || !formData.practice_name || !formData.contact_name) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('enterprise_inquiries' as any)
        .insert({
          clinician_user_id: user?.id || null,
          contact_name: formData.contact_name,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone || null,
          practice_name: formData.practice_name,
          practice_size: formData.practice_size || null,
          specialty: formData.specialty || null,
          country: formData.country || null,
          ehr_system: formData.ehr_system || null,
          requirements: formData.requirements || null,
        });

      if (error) throw error;

      // Fire-and-forget confirmation email (don't block UX on email delivery)
      supabase.functions
        .invoke('notify-enterprise-inquiry', {
          body: {
            contact_name: formData.contact_name,
            contact_email: formData.contact_email,
            contact_phone: formData.contact_phone || null,
            practice_name: formData.practice_name,
            practice_size: formData.practice_size || null,
            specialty: formData.specialty || null,
            country: formData.country || null,
            ehr_system: formData.ehr_system || null,
            requirements: formData.requirements || null,
          },
        })
        .catch((err) => console.warn('Enterprise confirmation email failed:', err));

      setSubmitted(true);
      toast.success('Inquiry submitted! Check your inbox for a confirmation.');
    } catch (error: any) {
      console.error('Error submitting inquiry:', error);
      toast.error('Failed to submit inquiry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <ClinicianHeader />
        <main className="container py-16 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-lg mx-auto text-center"
          >
            <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Thank You!</h1>
            <p className="text-muted-foreground mb-8">
              We've received your enterprise inquiry. A member of our team will reach out 
              within 24 hours to discuss your practice's needs and schedule a personalized demo.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline" onClick={() => navigate('/clinician/pricing')}>
                Back to Pricing
              </Button>
              <Button onClick={() => navigate('/clinician/dashboard')}>
                Go to Dashboard
              </Button>
            </div>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ClinicianHeader />
      
      <main className="container py-8 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <Button 
            variant="ghost" 
            className="mb-6"
            onClick={() => navigate('/clinician/pricing')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Pricing
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Enterprise Inquiry
                  </CardTitle>
                  <CardDescription>
                    Tell us about your practice so we can customize a solution for you
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Contact Information */}
                    <div className="space-y-4">
                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                        Contact Information
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="contact_name">Your Name *</Label>
                          <Input
                            id="contact_name"
                            value={formData.contact_name}
                            onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                            placeholder="Dr. Jane Smith"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="contact_email">Email Address *</Label>
                          <Input
                            id="contact_email"
                            type="email"
                            value={formData.contact_email}
                            onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                            placeholder="jane@practice.com"
                            required
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="contact_phone">Phone Number</Label>
                          <Input
                            id="contact_phone"
                            value={formData.contact_phone}
                            onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                            placeholder="+1 (555) 123-4567"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Practice Information */}
                    <div className="space-y-4">
                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                        Practice Information
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="practice_name">Practice/Organization Name *</Label>
                          <Input
                            id="practice_name"
                            value={formData.practice_name}
                            onChange={(e) => setFormData({ ...formData, practice_name: e.target.value })}
                            placeholder="City Medical Group"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Practice Size</Label>
                          <Select
                            value={formData.practice_size}
                            onValueChange={(value) => setFormData({ ...formData, practice_size: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select size" />
                            </SelectTrigger>
                            <SelectContent>
                              {PRACTICE_SIZES.map(size => (
                                <SelectItem key={size} value={size}>{size}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Primary Specialty</Label>
                          <Select
                            value={formData.specialty}
                            onValueChange={(value) => setFormData({ ...formData, specialty: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select specialty" />
                            </SelectTrigger>
                            <SelectContent>
                              {MEDICAL_SPECIALTIES.map(specialty => (
                                <SelectItem key={specialty} value={specialty}>{specialty}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Country</Label>
                          <Select
                            value={formData.country}
                            onValueChange={(value) => setFormData({ ...formData, country: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select country" />
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
                      </div>
                    </div>

                    {/* Integration Requirements */}
                    <div className="space-y-4">
                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                        Integration & Requirements
                      </h3>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Current EHR System</Label>
                          <Select
                            value={formData.ehr_system}
                            onValueChange={(value) => setFormData({ ...formData, ehr_system: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select EHR system" />
                            </SelectTrigger>
                            <SelectContent>
                              {EHR_SYSTEMS.map(ehr => (
                                <SelectItem key={ehr} value={ehr}>{ehr}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="requirements">Additional Requirements</Label>
                          <Textarea
                            id="requirements"
                            value={formData.requirements}
                            onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                            placeholder="Tell us about your specific needs, integration requirements, compliance considerations, or any questions you have..."
                            rows={4}
                          />
                        </div>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full gradient-primary border-0"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Submit Inquiry
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Enterprise Includes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { icon: Users, text: 'Unlimited patients & team members' },
                    { icon: Shield, text: 'HIPAA BAA included' },
                    { icon: Link2, text: 'EHR/FHIR integration support' },
                    { icon: HeadphonesIcon, text: 'Dedicated account manager' },
                  ].map(({ icon: Icon, text }, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm">{text}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    <strong>What happens next?</strong>
                    <br /><br />
                    1. We'll review your inquiry within 24 hours
                    <br /><br />
                    2. Schedule a personalized demo call
                    <br /><br />
                    3. Receive a custom proposal tailored to your practice
                    <br /><br />
                    4. Complete BAA and get onboarded with priority support
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

export default EnterpriseInquiry;
