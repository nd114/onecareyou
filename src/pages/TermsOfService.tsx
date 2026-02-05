import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText, Users, AlertCircle, Scale, Ban, RefreshCw, Shield, Globe, Gavel, CreditCard, Server, UserX, Clock, Building2, AlertTriangle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-12 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="h-14 w-14 rounded-2xl bg-ocean/10 flex items-center justify-center">
              <FileText className="h-7 w-7 text-ocean" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">Terms of Service</h1>
              <p className="text-muted-foreground">Last updated: January 17, 2026</p>
            </div>
          </div>

          {/* Beta Disclaimer */}
          <Alert className="mb-8 border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-800 dark:text-amber-300">Beta Platform Notice</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              OneCare is currently in beta. Features, functionality, and terms may change as we continue development. 
              By using this beta version, you acknowledge that the service is provided "as is" with potential limitations.
            </AlertDescription>
          </Alert>

          <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
            {/* Introduction */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <p className="text-muted-foreground leading-relaxed">
                  Welcome to OneCare. These Terms of Service ("Terms") govern your access to and use of the OneCare platform, 
                  including our website, mobile applications, and all related services (collectively, the "Service"). 
                  Please read these Terms carefully before using our Service.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  By accessing or using the Service, you agree to be bound by these Terms and our Privacy Policy. 
                  If you do not agree to these Terms, you may not access or use the Service.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  1. Acceptance of Terms
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>By accessing or using OneCare ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
                  <p>The Service is intended for personal health tracking and informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment.</p>
                  <p><strong>Eligibility:</strong> You must be at least 18 years of age to use this Service. If you are under 18, you may only use the Service with the involvement of a parent or legal guardian who agrees to these Terms.</p>
                  <p><strong>Account Registration:</strong> To access certain features, you must register for an account. You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate, current, and complete.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-severity-high" />
                  2. Medical Disclaimer
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p className="font-semibold text-foreground bg-destructive/10 p-4 rounded-lg border border-destructive/20">
                    IMPORTANT: OneCare is not a medical device and is not intended to diagnose, treat, cure, or prevent any disease. 
                    The Service is designed to help you organize and track health information, but it does not provide medical advice.
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition</li>
                    <li>Never disregard professional medical advice or delay in seeking it because of something you have read on this Service</li>
                    <li>Drug interaction warnings are informational only and may not cover all possible interactions. Our database may be incomplete or outdated.</li>
                    <li>AI-extracted lab values should always be verified against your original lab reports before making any health decisions</li>
                    <li>Medication reminders are provided as a convenience and should not be relied upon as your sole method of medication management</li>
                    <li>In case of a medical emergency, call your local emergency services (e.g., 911 in the US) immediately</li>
                    <li>Information from external APIs (such as NIH DailyMed, OpenFDA) is provided as-is and may not reflect the most current information</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Scale className="h-5 w-5 text-ocean" />
                  3. User Responsibilities
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>You agree to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Provide accurate and complete information when creating your account and entering health data</li>
                    <li>Maintain the security of your account credentials and not share your login information with others</li>
                    <li>Only upload documents and data that belong to you or for which you have explicit authorization</li>
                    <li>Use the Service in compliance with all applicable laws and regulations</li>
                    <li>Not attempt to access other users' data or circumvent security measures</li>
                    <li>Notify us immediately of any unauthorized access to your account</li>
                    <li>Not use the Service for any illegal, fraudulent, or unauthorized purpose</li>
                    <li>Not attempt to reverse engineer, decompile, or disassemble any part of the Service</li>
                    <li>Not use automated scripts, bots, or scrapers to access the Service</li>
                  </ul>
                  <Separator className="my-4" />
                  <p><strong>Family Member Data:</strong> If you enter health information for family members, you represent that you have their consent (or legal authority as a parent/guardian for minors) to do so.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  4. Healthcare Provider Access
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>OneCare allows you to share your health data with healthcare providers ("Clinicians"). By using this feature:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Voluntary Sharing:</strong> You control which healthcare providers can access your data. Sharing is always initiated by you.</li>
                    <li><strong>Access Duration:</strong> You may revoke a provider's access at any time through your account settings.</li>
                    <li><strong>Clinician Verification:</strong> While we encourage providers to enter their license information, we do not independently verify clinician credentials. You should independently verify that any healthcare provider you share data with is properly licensed.</li>
                    <li><strong>Guidance & Instructions:</strong> Healthcare providers may send you guidance or instructions through the platform. These communications do not create a physician-patient relationship and do not constitute medical advice. Always follow up with your provider directly for medical concerns.</li>
                    <li><strong>No Liability for Provider Actions:</strong> We are not responsible for any actions, advice, or communications from healthcare providers using our platform.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-status-success" />
                  5. Subscription & Payment Terms
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p><strong>Free Tier:</strong> Basic features are available at no cost. Free tier users may have limitations on certain features, such as the number of family members or care contacts.</p>
                  <p><strong>Paid Subscriptions:</strong> Premium features require a paid subscription. By subscribing, you agree to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Pay all applicable fees for your chosen subscription plan</li>
                    <li>Provide valid payment information and keep it current</li>
                    <li>Automatic renewal at the end of each billing period unless cancelled</li>
                  </ul>
                  <p><strong>Cancellation:</strong> You may cancel your subscription at any time. Access to premium features will continue until the end of your current billing period.</p>
                  <p><strong>Refunds:</strong> Subscription fees are generally non-refundable. Exceptions may be made at our sole discretion for billing errors or other extenuating circumstances.</p>
                  <p><strong>Price Changes:</strong> We may change subscription prices with 30 days' advance notice. Continued use after the price change constitutes acceptance.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Server className="h-5 w-5 text-indigo" />
                  6. Third-Party Services & APIs
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>OneCare integrates with various third-party services to provide enhanced functionality:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Drug Information:</strong> NIH DailyMed, OpenFDA, and RxNorm APIs provide drug label and interaction data. This information is sourced from official FDA databases but may not be complete or current.</li>
                    <li><strong>AI Processing:</strong> With your explicit consent, we may use AI services to process uploaded documents. See our Privacy Policy for details on data handling.</li>
                    <li><strong>Email Services:</strong> We use third-party email services for notifications and alerts.</li>
                  </ul>
                  <p>We are not responsible for the accuracy, availability, or reliability of third-party services. These services are subject to their own terms and privacy policies.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  7. Intellectual Property
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p><strong>Our Content:</strong> The Service, including its design, features, and content (excluding user-provided data), is owned by OneCare and protected by copyright, trademark, and other intellectual property laws.</p>
                  <p><strong>Your Content:</strong> You retain ownership of all health data and documents you upload to the Service. By using the Service, you grant us a limited license to store, process, and display your content solely to provide the Service to you.</p>
                  <p><strong>Feedback:</strong> If you provide suggestions, ideas, or feedback about the Service, we may use this feedback without any obligation to compensate you.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Ban className="h-5 w-5 text-amber" />
                  8. Limitation of Liability
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p className="font-semibold text-foreground">TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, either express or implied</li>
                    <li>We do not guarantee the accuracy, completeness, or timeliness of AI-extracted data, drug interaction information, or any other health-related content</li>
                    <li>We are not liable for any health decisions, outcomes, or consequences resulting from use of or reliance on information from the Service</li>
                    <li>We are not liable for any missed medication reminders, failed notifications, or system downtime</li>
                    <li>Our total aggregate liability shall not exceed the greater of: (a) the amount you paid for the Service in the past 12 months, or (b) $100 USD</li>
                    <li>We are not liable for indirect, incidental, special, consequential, or punitive damages, including lost profits, data, or goodwill</li>
                    <li>We are not liable for any actions, advice, or conduct of healthcare providers who access your data through the platform</li>
                  </ul>
                  <p className="text-sm">Some jurisdictions do not allow limitation of certain warranties or liabilities, so some of the above limitations may not apply to you.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Gavel className="h-5 w-5 text-primary" />
                  9. Indemnification
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>You agree to indemnify, defend, and hold harmless OneCare, its affiliates, officers, directors, employees, and agents from any claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Your use of the Service</li>
                    <li>Your violation of these Terms</li>
                    <li>Your violation of any third-party rights, including intellectual property or privacy rights</li>
                    <li>Any content you upload or share through the Service</li>
                    <li>Your negligent or wrongful conduct</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <UserX className="h-5 w-5 text-destructive" />
                  10. Termination
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p><strong>By You:</strong> You may terminate your account at any time by contacting support or using the account deletion feature in settings.</p>
                  <p><strong>By Us:</strong> We may terminate or suspend your access to the Service immediately, without prior notice or liability, for any reason, including:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Breach of these Terms</li>
                    <li>Fraudulent, abusive, or illegal activity</li>
                    <li>Non-payment of subscription fees</li>
                    <li>Extended periods of inactivity</li>
                    <li>At our sole discretion for any other reason</li>
                  </ul>
                  <p><strong>Effect of Termination:</strong> Upon termination, your right to use the Service will immediately cease. You may request export of your data before termination. After termination, we may delete your data in accordance with our data retention policies.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  11. Service Availability
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We strive to maintain high availability of the Service, but we do not guarantee uninterrupted access. The Service may be temporarily unavailable due to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Scheduled maintenance (we will attempt to provide advance notice)</li>
                    <li>System updates and improvements</li>
                    <li>Technical difficulties or outages</li>
                    <li>Circumstances beyond our control</li>
                  </ul>
                  <p><strong>Critical Reminder:</strong> Do not rely solely on OneCare for critical medication reminders. Always have backup reminder methods for essential medications.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-status-success" />
                  12. Changes to Terms
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We reserve the right to modify these Terms at any time. We will notify you of significant changes by:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Posting the updated Terms on our website with a new "Last Updated" date</li>
                    <li>Sending an email notification to your registered email address for material changes</li>
                    <li>Displaying a notice within the Service</li>
                  </ul>
                  <p>Your continued use of the Service after changes constitutes acceptance of the new Terms. If you do not agree to the changes, you must stop using the Service.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Globe className="h-5 w-5 text-indigo" />
                  13. Governing Law & Dispute Resolution
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p><strong>Governing Law:</strong> These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions.</p>
                  <p><strong>Arbitration:</strong> Any disputes arising from these Terms will be resolved through binding arbitration administered by the American Arbitration Association, except where prohibited by law. You agree to waive your right to a jury trial and to participate in class action lawsuits.</p>
                  <p><strong>Exceptions:</strong> Notwithstanding the above, either party may seek injunctive relief in any court of competent jurisdiction for violations of intellectual property rights or confidentiality obligations.</p>
                  <p><strong>Time Limit:</strong> Any cause of action or claim you may have arising out of these Terms must be commenced within one (1) year after the cause of action accrues.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold">14. Miscellaneous</h2>
                <div className="space-y-3 text-muted-foreground">
                  <p><strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy and Medical Disclaimer, constitute the entire agreement between you and OneCare regarding the Service.</p>
                  <p><strong>Severability:</strong> If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.</p>
                  <p><strong>Waiver:</strong> Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights.</p>
                  <p><strong>Assignment:</strong> You may not assign or transfer these Terms or your rights under them without our prior written consent. We may assign our rights and obligations without restriction.</p>
                  <p><strong>Contact Us:</strong> For questions about these Terms, please contact us at legal@onecare.you</p>
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

export default TermsOfService;
