import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Users, AlertCircle, Scale, Ban, RefreshCw } from 'lucide-react';

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

          <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  1. Acceptance of Terms
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>By accessing or using OneCare ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
                  <p>The Service is intended for personal health tracking and informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment.</p>
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
                  <p className="font-semibold text-foreground">IMPORTANT: OneCare is not a medical device and is not intended to diagnose, treat, cure, or prevent any disease.</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition</li>
                    <li>Never disregard professional medical advice or delay in seeking it because of something you have read on this Service</li>
                    <li>Drug interaction warnings are informational only and may not cover all possible interactions</li>
                    <li>AI-extracted lab values should always be verified against your original lab reports</li>
                    <li>In case of a medical emergency, call your local emergency services immediately</li>
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
                    <li>Provide accurate and complete information when creating your account</li>
                    <li>Maintain the security of your account credentials</li>
                    <li>Only upload documents and data that belong to you or for which you have authorization</li>
                    <li>Use the Service in compliance with all applicable laws and regulations</li>
                    <li>Not attempt to access other users' data or circumvent security measures</li>
                    <li>Notify us immediately of any unauthorized access to your account</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Ban className="h-5 w-5 text-amber" />
                  4. Limitation of Liability
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>To the maximum extent permitted by law:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>The Service is provided "as is" without warranties of any kind</li>
                    <li>We do not guarantee the accuracy of AI-extracted data or drug interaction information</li>
                    <li>We are not liable for any health decisions made based on information from the Service</li>
                    <li>Our total liability shall not exceed the amount you paid for the Service in the past 12 months</li>
                    <li>We are not liable for indirect, incidental, special, or consequential damages</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-status-success" />
                  5. Changes to Terms
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We reserve the right to modify these Terms at any time. We will notify you of significant changes by:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Posting the updated Terms on our website</li>
                    <li>Sending an email notification to your registered email address</li>
                    <li>Displaying a notice within the Service</li>
                  </ul>
                  <p>Your continued use of the Service after changes constitutes acceptance of the new Terms.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold">6. Termination</h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>You may terminate your account at any time by contacting support.</p>
                  <p>We may terminate or suspend your access to the Service immediately, without prior notice or liability, for any reason, including breach of these Terms.</p>
                  <p>Upon termination, your right to use the Service will immediately cease. You may request deletion of your data in accordance with our Privacy Policy.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold">7. Governing Law</h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which OneCare operates, without regard to its conflict of law provisions.</p>
                  <p>Any disputes arising from these Terms will be resolved through binding arbitration, except where prohibited by law.</p>
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
