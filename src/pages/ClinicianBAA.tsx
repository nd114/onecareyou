import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Shield, 
  FileText,
  Loader2,
  Check,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const BAA_TEXT = `BUSINESS ASSOCIATE AGREEMENT

This Business Associate Agreement ("Agreement") is entered into as of the date of electronic signature below.

PARTIES:
- Covered Entity: The healthcare practice/provider identified below
- Business Associate: OneCare Health Technologies ("OneCare")

RECITALS:
OneCare provides remote patient monitoring and care coordination services that may involve the creation, receipt, maintenance, or transmission of Protected Health Information (PHI) as defined under the Health Insurance Portability and Accountability Act of 1996 (HIPAA).

TERMS AND CONDITIONS:

1. DEFINITIONS
All terms used in this Agreement shall have the same meaning as those terms defined in HIPAA, including but not limited to "Protected Health Information," "Electronic Protected Health Information," and "Breach."

2. OBLIGATIONS OF BUSINESS ASSOCIATE
Business Associate agrees to:
a) Not use or disclose PHI other than as permitted by this Agreement or as required by law
b) Use appropriate safeguards to prevent unauthorized use or disclosure of PHI
c) Report to Covered Entity any use or disclosure not provided for by this Agreement
d) Ensure that any subcontractors agree to the same restrictions and conditions
e) Make PHI available to Covered Entity as required under HIPAA
f) Amend PHI as directed by Covered Entity
g) Provide an accounting of disclosures as required under HIPAA
h) Make internal practices available to the Secretary of HHS for compliance determination
i) Return or destroy PHI upon termination of this Agreement

3. PERMITTED USES AND DISCLOSURES
Business Associate may use PHI for:
a) Performance of services described in the underlying service agreement
b) Proper management and administration of Business Associate
c) Legal responsibilities of Business Associate
d) Data aggregation services as permitted by HIPAA

4. SECURITY REQUIREMENTS
Business Associate shall:
a) Implement administrative, physical, and technical safeguards
b) Ensure confidentiality, integrity, and availability of ePHI
c) Protect against anticipated threats or hazards
d) Protect against unauthorized use or disclosure
e) Ensure workforce compliance

5. BREACH NOTIFICATION
In the event of a breach of unsecured PHI, Business Associate shall:
a) Notify Covered Entity within 60 days of discovery
b) Provide all information necessary for Covered Entity notifications
c) Cooperate with Covered Entity in breach response

6. TERM AND TERMINATION
This Agreement shall terminate when:
a) All PHI is destroyed or returned
b) Either party terminates for material breach
c) The underlying service agreement terminates

7. GENERAL PROVISIONS
a) This Agreement shall be governed by applicable federal and state law
b) Any ambiguity shall be resolved in favor of HIPAA compliance
c) The provisions of this Agreement shall survive termination

By signing below, the parties agree to be bound by the terms of this Business Associate Agreement.`;

const ClinicianBAA = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { clinicianProfile } = useClinicianProfile();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [hasReadAgreement, setHasReadAgreement] = useState(false);
  const [agreesToTerms, setAgreesToTerms] = useState(false);

  const [formData, setFormData] = useState({
    practice_name: clinicianProfile?.practice_name || '',
    practice_address: '',
    practice_npi: '',
    contact_name: profile?.name || '',
    contact_email: user?.email || '',
    contact_phone: profile?.phone_number || '',
  });

  const handleSign = async () => {
    if (!user) {
      toast.error('Please sign in to continue');
      return;
    }

    if (!hasReadAgreement || !agreesToTerms) {
      toast.error('Please read and accept the agreement');
      return;
    }

    if (!formData.practice_name || !formData.contact_name || !formData.contact_email) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('baa_agreements' as any)
        .insert({
          clinician_user_id: user.id,
          practice_name: formData.practice_name,
          practice_address: formData.practice_address || null,
          practice_npi: formData.practice_npi || null,
          contact_name: formData.contact_name,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone || null,
          user_agent: navigator.userAgent,
          agreement_version: '1.0',
        });

      if (error) throw error;

      setSigned(true);
      toast.success('BAA signed successfully');
    } catch (error: any) {
      console.error('Error signing BAA:', error);
      toast.error('Failed to sign agreement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (signed) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-16 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-lg mx-auto text-center"
          >
            <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold mb-4">BAA Signed Successfully</h1>
            <p className="text-muted-foreground mb-8">
              Your Business Associate Agreement has been executed. A copy has been sent to your email 
              and is available in your account settings.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <Button onClick={() => navigate('/clinician/settings')}>
                Go to Settings
              </Button>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <Button 
            variant="ghost" 
            className="mb-6"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Agreement */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    HIPAA Business Associate Agreement
                  </CardTitle>
                  <CardDescription>
                    Required for Enterprise tier and HIPAA compliance
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Agreement Text */}
                  <div className="space-y-2">
                    <Label>Agreement Terms</Label>
                    <ScrollArea className="h-[300px] rounded-md border p-4 bg-muted/30">
                      <pre className="text-xs whitespace-pre-wrap font-mono">
                        {BAA_TEXT}
                      </pre>
                    </ScrollArea>
                  </div>

                  <Separator />

                  {/* Practice Information */}
                  <div className="space-y-4">
                    <h3 className="font-medium">Covered Entity Information</h3>
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
                        <Label htmlFor="practice_npi">NPI Number</Label>
                        <Input
                          id="practice_npi"
                          value={formData.practice_npi}
                          onChange={(e) => setFormData({ ...formData, practice_npi: e.target.value })}
                          placeholder="1234567890"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="practice_address">Practice Address</Label>
                        <Input
                          id="practice_address"
                          value={formData.practice_address}
                          onChange={(e) => setFormData({ ...formData, practice_address: e.target.value })}
                          placeholder="123 Medical Center Dr, City, State 12345"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Signatory Information */}
                  <div className="space-y-4">
                    <h3 className="font-medium">Authorized Signatory</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contact_name">Full Name *</Label>
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
                      <div className="space-y-2">
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

                  <Separator />

                  {/* Acknowledgments */}
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="hasRead"
                        checked={hasReadAgreement}
                        onCheckedChange={(checked) => setHasReadAgreement(checked === true)}
                      />
                      <label htmlFor="hasRead" className="text-sm leading-relaxed cursor-pointer">
                        I have read and understand the terms of this Business Associate Agreement
                      </label>
                    </div>
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="agreesToTerms"
                        checked={agreesToTerms}
                        onCheckedChange={(checked) => setAgreesToTerms(checked === true)}
                      />
                      <label htmlFor="agreesToTerms" className="text-sm leading-relaxed cursor-pointer">
                        I am authorized to sign this agreement on behalf of the Covered Entity 
                        and agree to be bound by its terms
                      </label>
                    </div>
                  </div>

                  <Button
                    onClick={handleSign}
                    className="w-full gradient-primary border-0"
                    disabled={isSubmitting || !hasReadAgreement || !agreesToTerms}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Signing...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Sign Agreement
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Why a BAA?</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-3">
                  <p>
                    Under HIPAA, a Business Associate Agreement (BAA) is required when a service 
                    provider handles Protected Health Information (PHI) on behalf of a healthcare provider.
                  </p>
                  <p>
                    This agreement establishes the legal framework for how OneCare will protect 
                    and handle your patients' health information.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardContent className="pt-6 text-sm">
                  <p className="font-medium mb-2">What's covered:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• Data security requirements</li>
                    <li>• Breach notification procedures</li>
                    <li>• PHI use and disclosure rules</li>
                    <li>• Audit and compliance rights</li>
                    <li>• Termination and data handling</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default ClinicianBAA;
