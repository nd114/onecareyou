import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Shield, 
  FileText,
  Loader2,
  Check,
  Download,
  AlertTriangle,
  Calendar,
  Building2,
  User as UserIcon,
  Mail,
  Phone,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SignaturePad } from '@/components/signature/SignaturePad';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { COUNTRY_LIST } from '@/hooks/useEmergencyNumbers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Current BAA version - increment when agreement terms change
const CURRENT_BAA_VERSION = '1.0';

const BAA_TEXT = `BUSINESS ASSOCIATE AGREEMENT

This Business Associate Agreement ("Agreement") is entered into as of the date of electronic signature below.

PARTIES:
- Covered Entity: The healthcare practice/provider identified below
- Business Associate: Marpe Health Technologies ("Marpe")

RECITALS:
Marpe provides remote patient monitoring and care coordination services that may involve the creation, receipt, maintenance, or transmission of Protected Health Information (PHI) as defined under the Health Insurance Portability and Accountability Act of 1996 (HIPAA).

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

interface ExistingBAA {
  id: string;
  practice_name: string;
  practice_address: string | null;
  practice_npi: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  signed_at: string;
  agreement_version: string;
  status: string;
}

const ClinicianBAA = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { clinicianProfile } = useClinicianProfile();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSigned, setJustSigned] = useState(false);
  const [hasReadAgreement, setHasReadAgreement] = useState(false);
  const [agreesToTerms, setAgreesToTerms] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    practice_name: clinicianProfile?.practice_name || '',
    practice_street: '',
    practice_city: '',
    practice_state: '',
    practice_postal_code: '',
    practice_country: clinicianProfile?.country || '',
    practice_npi: '',
    contact_name: profile?.name || '',
    contact_email: user?.email || '',
    contact_phone: profile?.phone_number || '',
    contact_title: '',
  });

  // Query for existing BAA agreement
  const { data: existingBAA, isLoading: isLoadingBAA, refetch } = useQuery({
    queryKey: ['baa-agreement', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('baa_agreements')
        .select('*')
        .eq('clinician_user_id', user.id)
        .eq('status', 'active')
        .order('signed_at', { ascending: false })
        .maybeSingle();

      if (error) throw error;
      return data as ExistingBAA | null;
    },
    enabled: !!user?.id,
  });

  const isVersionOutdated = existingBAA && existingBAA.agreement_version !== CURRENT_BAA_VERSION;

  const buildFullAddress = () => {
    const parts = [
      formData.practice_street,
      formData.practice_city,
      formData.practice_state,
      formData.practice_postal_code,
      COUNTRY_LIST.find(c => c.code === formData.practice_country)?.name,
    ].filter(Boolean);
    return parts.join(', ');
  };

  const handleSign = async () => {
    if (!user) {
      toast.error('Please sign in to continue');
      return;
    }

    if (!hasReadAgreement || !agreesToTerms) {
      toast.error('Please read and accept the agreement');
      return;
    }

    if (!formData.practice_name || !formData.contact_name || !formData.contact_email || !formData.contact_phone) {
      toast.error('Please fill in all required fields including phone number');
      return;
    }

    if (!signatureDataUrl) {
      toast.error('Please provide your signature');
      return;
    }

    setIsSubmitting(true);
    try {
      const fullAddress = buildFullAddress();
      
      const { error } = await supabase
        .from('baa_agreements' as any)
        .insert({
          clinician_user_id: user.id,
          practice_name: formData.practice_name,
          practice_address: fullAddress || null,
          practice_npi: formData.practice_npi || null,
          contact_name: formData.contact_name,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone,
          user_agent: navigator.userAgent,
          agreement_version: CURRENT_BAA_VERSION,
        });

      if (error) throw error;

      setJustSigned(true);
      refetch();
      toast.success('BAA signed successfully');
    } catch (error: any) {
      console.error('Error signing BAA:', error);
      toast.error('Failed to sign agreement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = 
    hasReadAgreement && 
    agreesToTerms && 
    formData.practice_name && 
    formData.contact_name && 
    formData.contact_email && 
    formData.contact_phone &&
    signatureDataUrl;

  const handleDownloadPDF = (baaData?: ExistingBAA) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    let yPos = 20;

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('BUSINESS ASSOCIATE AGREEMENT', pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    // Signing details
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const practiceName = baaData?.practice_name || formData.practice_name;
    const contactName = baaData?.contact_name || formData.contact_name;
    const contactEmail = baaData?.contact_email || formData.contact_email;
    const signedDate = baaData?.signed_at ? format(new Date(baaData.signed_at), 'MMMM d, yyyy') : new Date().toLocaleDateString();
    const version = baaData?.agreement_version || CURRENT_BAA_VERSION;

    doc.text(`Signed on: ${signedDate}`, margin, yPos);
    yPos += 6;
    doc.text(`Agreement Version: ${version}`, margin, yPos);
    yPos += 6;
    doc.text(`Practice: ${practiceName}`, margin, yPos);
    yPos += 6;
    doc.text(`Signatory: ${contactName}`, margin, yPos);
    yPos += 6;
    doc.text(`Email: ${contactEmail}`, margin, yPos);
    yPos += 15;

    // Agreement text
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(BAA_TEXT, maxWidth);
    
    for (const line of lines) {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(line, margin, yPos);
      yPos += 5;
    }

    // Signature section
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('ELECTRONIC SIGNATURE', margin, yPos);
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.text(`Signed by: ${contactName}`, margin, yPos);
    yPos += 6;
    doc.text(`Date: ${signedDate}`, margin, yPos);

    doc.save('Marpe_BAA_Agreement.pdf');
    toast.success('PDF downloaded successfully');
  };

  // Loading state
  if (isLoadingBAA) {
    return (
      <div className="min-h-screen bg-background">
        <ClinicianHeader />
        <main className="container py-16 px-4 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  // Just signed confirmation view
  if (justSigned) {
    return (
      <div className="min-h-screen bg-background">
        <ClinicianHeader />
        <main className="container py-16 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-lg mx-auto text-center"
          >
            <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
              <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-bold mb-4">BAA Signed Successfully</h1>
            <p className="text-muted-foreground mb-8">
              Your Business Associate Agreement has been executed. A copy has been sent to your email 
              and is available in your account settings.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline" onClick={() => handleDownloadPDF()}>
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

  // Existing signed BAA view
  if (existingBAA) {
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
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            {/* Version Update Banner */}
            {isVersionOutdated && (
              <Alert className="mb-6 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-200">Agreement Updated</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  This agreement was updated to version {CURRENT_BAA_VERSION}. By continuing to use Marpe, 
                  you accept the updated terms. You can review the current terms below and download the 
                  updated agreement for your records.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Agreement Details */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Shield className="h-6 w-6 text-primary" />
                        <div>
                          <CardTitle>HIPAA Business Associate Agreement</CardTitle>
                          <CardDescription>Your signed agreement with Marpe</CardDescription>
                        </div>
                      </div>
                      <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                        <Check className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Signing Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                      <div className="flex items-start gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Signed On</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(existingBAA.signed_at), 'MMMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Agreement Version</p>
                          <p className="text-sm text-muted-foreground">
                            {existingBAA.agreement_version}
                            {isVersionOutdated && (
                              <span className="text-amber-600 ml-1">(Current: {CURRENT_BAA_VERSION})</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Practice</p>
                          <p className="text-sm text-muted-foreground">{existingBAA.practice_name}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <UserIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Signatory</p>
                          <p className="text-sm text-muted-foreground">{existingBAA.contact_name}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Contact Email</p>
                          <p className="text-sm text-muted-foreground">{existingBAA.contact_email}</p>
                        </div>
                      </div>
                      {existingBAA.contact_phone && (
                        <div className="flex items-start gap-3">
                          <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">Contact Phone</p>
                            <p className="text-sm text-muted-foreground">{existingBAA.contact_phone}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Agreement Text */}
                    <div className="space-y-2">
                      <Label>Agreement Terms {isVersionOutdated && `(Version ${CURRENT_BAA_VERSION})`}</Label>
                      <ScrollArea className="h-[300px] rounded-md border p-4 bg-muted/30">
                        <pre className="text-xs whitespace-pre-wrap font-mono">
                          {BAA_TEXT}
                        </pre>
                      </ScrollArea>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                      <Button onClick={() => handleDownloadPDF(existingBAA)} className="flex-1">
                        <Download className="h-4 w-4 mr-2" />
                        Download Signed Agreement
                      </Button>
                      {isVersionOutdated && (
                        <Button variant="outline" onClick={() => handleDownloadPDF()}>
                          <Download className="h-4 w-4 mr-2" />
                          Download Updated Terms
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-green-800 dark:text-green-200">
                      <Check className="h-5 w-5" />
                      Compliance Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-green-700 dark:text-green-300 space-y-3">
                    <p>
                      Your organization is compliant with HIPAA Business Associate requirements for using Marpe services.
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      This agreement remains in effect for the duration of your service relationship with Marpe.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Need Updates?</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-3">
                    <p>
                      If your practice information has changed (name, address, authorized signatory), 
                      please contact our support team to update your agreement.
                    </p>
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <a href="mailto:compliance@marpe.care">Contact Support</a>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  // Signing form (no existing BAA)
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
                    </div>

                    {/* Address Fields */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-medium text-muted-foreground">Practice Address</h4>
                      <div className="space-y-2">
                        <Label htmlFor="practice_street">Street Address</Label>
                        <Input
                          id="practice_street"
                          value={formData.practice_street}
                          onChange={(e) => setFormData({ ...formData, practice_street: e.target.value })}
                          placeholder="123 Medical Center Dr, Suite 100"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="practice_city">City</Label>
                          <Input
                            id="practice_city"
                            value={formData.practice_city}
                            onChange={(e) => setFormData({ ...formData, practice_city: e.target.value })}
                            placeholder="New York"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="practice_state">State/Province</Label>
                          <Input
                            id="practice_state"
                            value={formData.practice_state}
                            onChange={(e) => setFormData({ ...formData, practice_state: e.target.value })}
                            placeholder="NY"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="practice_postal_code">Postal/ZIP Code</Label>
                          <Input
                            id="practice_postal_code"
                            value={formData.practice_postal_code}
                            onChange={(e) => setFormData({ ...formData, practice_postal_code: e.target.value })}
                            placeholder="10001"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="practice_country">Country</Label>
                          <Select
                            value={formData.practice_country}
                            onValueChange={(value) => setFormData({ ...formData, practice_country: value })}
                          >
                            <SelectTrigger id="practice_country">
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
                          placeholder="Jane Smith"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact_title">Title/Position</Label>
                        <Input
                          id="contact_title"
                          value={formData.contact_title}
                          onChange={(e) => setFormData({ ...formData, contact_title: e.target.value })}
                          placeholder="Chief Medical Officer"
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
                        <Label htmlFor="contact_phone">Phone Number *</Label>
                        <Input
                          id="contact_phone"
                          value={formData.contact_phone}
                          onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                          placeholder="+1 (555) 123-4567"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Signature Pad */}
                  <SignaturePad onSignatureChange={setSignatureDataUrl} />

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
                    disabled={isSubmitting || !isFormValid}
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
                    This agreement establishes the legal framework for how Marpe will protect 
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
