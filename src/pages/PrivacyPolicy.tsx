import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Lock, Eye, Database, UserCheck, Globe, Mail, Server, Users, Clock, FileText, AlertTriangle, Share2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

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
            {/* Introduction */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <p className="text-muted-foreground leading-relaxed">
                  At OneCare, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, 
                  and safeguard your information when you use our health tracking and medication management platform.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  By using OneCare, you consent to the data practices described in this policy. If you do not agree with 
                  the practices described herein, please do not use our Service.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  1. Information We Collect
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <div>
                    <p className="font-semibold text-foreground">Personal Information:</p>
                    <ul className="list-disc pl-6 space-y-1 mt-2">
                      <li>Name, email address, and password (encrypted)</li>
                      <li>Phone number (optional, for account recovery)</li>
                      <li>Date of birth, gender, and demographic information</li>
                      <li>Emergency contact information</li>
                      <li>Location/timezone (for reminder scheduling)</li>
                    </ul>
                  </div>
                  <Separator />
                  <div>
                    <p className="font-semibold text-foreground">Health Information:</p>
                    <ul className="list-disc pl-6 space-y-1 mt-2">
                      <li>Medications, dosages, schedules, and prescribers</li>
                      <li>Vital signs (blood pressure, heart rate, glucose, weight, temperature)</li>
                      <li>Lab results and medical test values</li>
                      <li>Allergies and health conditions</li>
                      <li>Medication adherence history</li>
                      <li>Blood type and other medical identifiers</li>
                    </ul>
                  </div>
                  <Separator />
                  <div>
                    <p className="font-semibold text-foreground">Family Member Information:</p>
                    <ul className="list-disc pl-6 space-y-1 mt-2">
                      <li>Names and relationships of family members you track</li>
                      <li>Health information for family members (with your authorization)</li>
                      <li>Care alert recipient contact information</li>
                    </ul>
                  </div>
                  <Separator />
                  <div>
                    <p className="font-semibold text-foreground">Uploaded Documents:</p>
                    <ul className="list-disc pl-6 space-y-1 mt-2">
                      <li>Lab reports and medical documents you choose to upload</li>
                      <li>Medication photos for identification purposes</li>
                    </ul>
                  </div>
                  <Separator />
                  <div>
                    <p className="font-semibold text-foreground">Usage & Technical Data:</p>
                    <ul className="list-disc pl-6 space-y-1 mt-2">
                      <li>Device information (type, operating system, browser)</li>
                      <li>IP address and general location</li>
                      <li>Service usage patterns and feature interactions</li>
                      <li>Error logs and performance data</li>
                      <li>Push notification tokens (if enabled)</li>
                    </ul>
                  </div>
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
                    <li><strong>Provide Core Services:</strong> Track medications, record vitals, send reminders, and manage your health data</li>
                    <li><strong>Process Documents:</strong> Extract data from uploaded lab reports (with your explicit consent for AI processing)</li>
                    <li><strong>Send Notifications:</strong> Medication reminders, refill alerts, care alerts, and system notifications</li>
                    <li><strong>Enable Provider Sharing:</strong> Allow you to share your health data with healthcare providers you designate</li>
                    <li><strong>Improve Services:</strong> Analyze usage patterns to enhance features and user experience</li>
                    <li><strong>Customer Support:</strong> Respond to inquiries and resolve issues</li>
                    <li><strong>Security:</strong> Detect, prevent, and address fraud, abuse, and security issues</li>
                    <li><strong>Legal Compliance:</strong> Comply with applicable laws, regulations, and legal processes</li>
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
                  <p className="font-semibold text-foreground bg-primary/10 p-4 rounded-lg">
                    AI processing of your health data only occurs with your explicit, informed consent, which you can grant or revoke at any time in your account settings.
                  </p>
                  <p><strong>How AI Processing Works:</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Consent Required:</strong> You must explicitly opt-in before any AI processing occurs</li>
                    <li><strong>Anonymization:</strong> Before data is sent to AI services, all personal identifiers (name, email, user ID, account information) are stripped</li>
                    <li><strong>Limited Transmission:</strong> Only the document content/image is processed; no account or personal information is transmitted</li>
                    <li><strong>Result Association:</strong> Extracted results are associated with your account only after processing is complete</li>
                  </ul>
                  <Separator className="my-4" />
                  <p><strong>AI Service Providers:</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>We use enterprise-grade AI services with strong privacy commitments</li>
                    <li>AI providers are contractually prohibited from retaining or training on your data</li>
                    <li>Processing occurs in secure, encrypted environments</li>
                  </ul>
                  <Separator className="my-4" />
                  <p><strong>Audit Trail:</strong> All consent changes are logged with timestamps, IP addresses, and user agent information for your records and legal compliance.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Share2 className="h-5 w-5 text-indigo" />
                  4. Information Sharing & Disclosure
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p className="font-semibold text-foreground">We do NOT sell your personal health information.</p>
                  <p>We may share your information in the following circumstances:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>With Your Consent:</strong> When you explicitly choose to share data with healthcare providers through our provider sharing feature</li>
                    <li><strong>Care Alerts:</strong> When you configure care alerts, we send notifications to your designated contacts about missed medications</li>
                    <li><strong>Service Providers:</strong> With third-party vendors who assist in operating our Service (hosting, email, analytics), under strict confidentiality agreements</li>
                    <li><strong>Legal Requirements:</strong> When required by law, court order, or government request</li>
                    <li><strong>Safety:</strong> To protect the safety, rights, or property of OneCare, our users, or the public</li>
                    <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets (you will be notified beforehand)</li>
                  </ul>
                  <Separator className="my-4" />
                  <p><strong>Aggregated/Anonymous Data:</strong> We may share aggregated, de-identified data that cannot reasonably be used to identify you for research, analytics, or industry benchmarking purposes.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  5. Healthcare Provider Access
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>When you choose to share data with healthcare providers:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>You Control Access:</strong> You initiate all provider shares and can revoke access at any time</li>
                    <li><strong>Granular Permissions:</strong> You choose what data types to share (vitals, medications, adherence, profile)</li>
                    <li><strong>Access Logging:</strong> We log when providers access your data</li>
                    <li><strong>Expiration:</strong> You can set expiration dates for provider access</li>
                    <li><strong>Provider Responsibilities:</strong> Healthcare providers who access your data are responsible for maintaining confidentiality according to their professional obligations and applicable laws (e.g., HIPAA)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-amber" />
                  6. Your Rights
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>Depending on your location, you may have the following rights under applicable privacy laws including GDPR (EU), CCPA (California, USA), POPIA (South Africa), PIPEDA (Canada), and other regional regulations:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Access:</strong> Request a copy of all personal data we hold about you</li>
                    <li><strong>Rectification:</strong> Correct inaccurate or incomplete personal data</li>
                    <li><strong>Erasure ("Right to be Forgotten"):</strong> Request deletion of your personal data</li>
                    <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format</li>
                    <li><strong>Withdraw Consent:</strong> Revoke AI processing consent or other consents at any time</li>
                    <li><strong>Object:</strong> Object to certain processing activities</li>
                    <li><strong>Restrict Processing:</strong> Request limitation of how we process your data</li>
                    <li><strong>Non-Discrimination:</strong> We will not discriminate against you for exercising your privacy rights</li>
                  </ul>
                  <Separator className="my-4" />
                  <p><strong>Jurisdiction-Specific Rights:</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>South Africa (POPIA):</strong> You have the right to object to processing, request correction or deletion of personal information, and lodge complaints with the Information Regulator</li>
                    <li><strong>Canada (PIPEDA):</strong> You may access your personal information, challenge its accuracy, and withdraw consent (subject to legal or contractual restrictions)</li>
                    <li><strong>European Union (GDPR):</strong> You have rights to data portability, restriction of processing, and to lodge complaints with your local supervisory authority</li>
                    <li><strong>California (CCPA/CPRA):</strong> You have the right to know, delete, opt-out of sale/sharing, and non-discrimination for exercising your rights</li>
                  </ul>
                  <Separator className="my-4" />
                  <p><strong>Exercising Your Rights:</strong> To exercise these rights, contact us at <strong>privacy@onecare.health</strong> or use the data management features in your account settings. We will respond to all requests within the timeframe required by applicable law (typically 30 days).</p>
                  <p><strong>Verification:</strong> We may need to verify your identity before processing certain requests.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Server className="h-5 w-5 text-status-success" />
                  7. Data Security & Storage
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We implement industry-standard security measures to protect your data:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Encryption in Transit:</strong> All data is encrypted using TLS 1.3 during transmission</li>
                    <li><strong>Encryption at Rest:</strong> Data is encrypted using AES-256 when stored</li>
                    <li><strong>Access Controls:</strong> Strict authentication and authorization requirements</li>
                    <li><strong>Row-Level Security:</strong> Database-level controls ensure you only access your own data</li>
                    <li><strong>Regular Audits:</strong> Security audits and vulnerability assessments</li>
                    <li><strong>Secure Infrastructure:</strong> Data stored in SOC 2 Type II compliant cloud infrastructure</li>
                    <li><strong>Password Protection:</strong> Passwords are hashed using industry-standard algorithms and checked against known breach databases</li>
                    <li><strong>Session Security:</strong> Automatic session expiration and secure token management</li>
                  </ul>
                  <Separator className="my-4" />
                  <p><strong>Data Location:</strong> Your data is primarily stored in data centers located in the United States. If you access the Service from outside the US, your data may be transferred to the US.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  8. Data Retention
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We retain your data for as long as your account is active or as needed to provide services to you.</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Active Accounts:</strong> Data is retained indefinitely while your account is active</li>
                    <li><strong>Account Deletion:</strong> Upon account deletion, we will delete or anonymize your data within 30 days, except as required by law</li>
                    <li><strong>Legal Retention:</strong> Some data may be retained longer to comply with legal obligations, resolve disputes, or enforce agreements</li>
                    <li><strong>Backups:</strong> Backup copies may persist for up to 90 days after deletion</li>
                    <li><strong>Audit Logs:</strong> Consent and access logs may be retained for up to 7 years for legal compliance</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  9. Cookies & Tracking
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We use cookies and similar technologies for:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Essential Cookies:</strong> Required for authentication, security, and basic functionality</li>
                    <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
                    <li><strong>Analytics Cookies:</strong> Understand how you use our Service to improve it</li>
                  </ul>
                  <p>We do not use advertising or marketing tracking cookies. You can control cookie preferences through your browser settings.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber" />
                  10. Children's Privacy
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>OneCare is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.</p>
                  <p>If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately at privacy@onecare.health.</p>
                  <p><strong>Family Member Tracking:</strong> Parents and guardians may track medications and health information for their minor children through the family member feature. This data is managed under the parent/guardian's account and subject to this Privacy Policy.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Globe className="h-5 w-5 text-indigo" />
                  11. International Data Transfers
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>If you access OneCare from outside the United States, please be aware that your data may be transferred to, stored, and processed in the United States.</p>
                  <p>By using our Service, you consent to such transfers. We take steps to ensure that your data is treated securely and in accordance with this Privacy Policy, regardless of where it is processed.</p>
                  <p>For EU/EEA users: We rely on Standard Contractual Clauses and other appropriate safeguards for international data transfers.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  12. Regulatory Compliance Notices
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <div>
                    <p className="font-semibold text-foreground">HIPAA (United States)</p>
                    <p>OneCare is not a Covered Entity or Business Associate under HIPAA. However, we implement security measures aligned with HIPAA standards as a best practice for protecting health information, including administrative, physical, and technical safeguards.</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="font-semibold text-foreground">POPIA (South Africa)</p>
                    <p>For users in South Africa, we comply with the Protection of Personal Information Act. Your personal information is processed lawfully, and you have the right to access, correct, or delete your data. Complaints may be directed to the Information Regulator.</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="font-semibold text-foreground">PIPEDA (Canada)</p>
                    <p>For users in Canada, we comply with the Personal Information Protection and Electronic Documents Act. We obtain meaningful consent for collection, use, and disclosure of personal information. You may withdraw consent at any time, subject to legal restrictions.</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="font-semibold text-foreground">GDPR (European Union)</p>
                    <p>For users in the EU/EEA, we process personal data in accordance with the General Data Protection Regulation. Our lawful basis for processing includes consent (for AI features) and legitimate interests (for service provision). Data transfers outside the EU are protected by Standard Contractual Clauses.</p>
                  </div>
                  <Separator />
                  <p className="text-sm">If you are a healthcare provider using OneCare to view patient data, you are responsible for ensuring your use complies with HIPAA and other applicable regulations in your jurisdiction.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold">13. Changes to This Policy</h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We may update this Privacy Policy from time to time. We will notify you of significant changes by:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Posting the updated policy with a new "Last Updated" date</li>
                    <li>Sending an email notification for material changes</li>
                    <li>Displaying a notice within the Service</li>
                  </ul>
                  <p>Your continued use of the Service after changes constitutes acceptance of the updated policy.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Mail className="h-5 w-5 text-rose" />
                  14. Contact Us
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>For privacy-related inquiries or to exercise your rights:</p>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                    <p><strong>Privacy Team:</strong> privacy@onecare.health</p>
                    <p><strong>Data Protection Officer:</strong> dpo@onecare.health</p>
                    <p><strong>General Support:</strong> support@onecare.health</p>
                  </div>
                  <p>We will respond to all privacy requests within 30 days.</p>
                  <p><strong>EU Representative:</strong> For users in the European Union, our EU representative can be contacted at eu-privacy@onecare.health</p>
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
