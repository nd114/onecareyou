import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Lock, Eye, Database, UserCheck, Globe, Mail } from 'lucide-react';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-12 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">Privacy Policy</h1>
              <p className="text-muted-foreground">Last updated: January 17, 2026</p>
            </div>
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  1. Information We Collect
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p><strong>Personal Information:</strong> When you create an account, we collect your name, email address, and password (encrypted).</p>
                  <p><strong>Health Information:</strong> You may voluntarily provide health data including medications, vital signs, lab results, allergies, and health conditions.</p>
                  <p><strong>Usage Data:</strong> We collect information about how you interact with our services, including device information and log data.</p>
                  <p><strong>Uploaded Documents:</strong> Lab reports or medical documents you choose to upload for processing.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Database className="h-5 w-5 text-ocean" />
                  2. How We Use Your Information
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We use your information to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Provide and maintain our health tracking services</li>
                    <li>Process and extract data from uploaded lab reports (with your explicit consent)</li>
                    <li>Send medication reminders and health alerts</li>
                    <li>Improve our services and develop new features</li>
                    <li>Communicate with you about your account and updates</li>
                    <li>Comply with legal obligations</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Lock className="h-5 w-5 text-status-success" />
                  3. AI Processing & Data Anonymization
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p><strong>Consent Required:</strong> AI processing of your health data only occurs with your explicit consent, which you can grant or revoke at any time.</p>
                  <p><strong>Anonymization:</strong> Before any data is sent to AI services for processing:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>All personal identifiers (name, email, user ID) are stripped from the data</li>
                    <li>Only the document content/image is processed</li>
                    <li>No account information is transmitted to AI services</li>
                    <li>Extracted results are associated with your account only after processing</li>
                  </ul>
                  <p><strong>No Data Retention by AI:</strong> Third-party AI services do not store or retain your processed data.</p>
                  <p><strong>Audit Trail:</strong> All consent changes are logged with timestamps for your records and legal compliance.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-amber" />
                  4. Your Rights
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>Under GDPR, CCPA, and other applicable laws, you have the right to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Access:</strong> Request a copy of your personal data</li>
                    <li><strong>Rectification:</strong> Correct inaccurate personal data</li>
                    <li><strong>Erasure:</strong> Request deletion of your personal data</li>
                    <li><strong>Portability:</strong> Receive your data in a portable format</li>
                    <li><strong>Withdraw Consent:</strong> Revoke AI processing consent at any time</li>
                    <li><strong>Object:</strong> Object to certain processing activities</li>
                  </ul>
                  <p>To exercise these rights, contact us at privacy@onecare.health</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Globe className="h-5 w-5 text-indigo" />
                  5. Data Security & Storage
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We implement industry-standard security measures:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>All data is encrypted in transit (TLS 1.3) and at rest (AES-256)</li>
                    <li>Access controls and authentication requirements</li>
                    <li>Regular security audits and vulnerability assessments</li>
                    <li>Data stored in secure, compliant cloud infrastructure</li>
                    <li>Row-level security ensuring you only access your own data</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Mail className="h-5 w-5 text-rose" />
                  6. Contact Us
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>For privacy-related inquiries or to exercise your rights:</p>
                  <p><strong>Email:</strong> privacy@onecare.health</p>
                  <p><strong>Data Protection Officer:</strong> dpo@onecare.health</p>
                  <p>We will respond to all requests within 30 days.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </main>
      
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
