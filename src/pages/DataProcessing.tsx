import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Database, Shield, Brain, Clock, FileCheck, Users, Lock, Smartphone } from 'lucide-react';

const DataProcessing = () => {
  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-12 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="h-14 w-14 rounded-2xl bg-status-success/10 flex items-center justify-center">
              <Database className="h-7 w-7 text-status-success" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">Data Processing Agreement</h1>
              <p className="text-muted-foreground">Last updated: January 17, 2026</p>
            </div>
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-primary" />
                  1. Purpose and Scope
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>This Data Processing Agreement ("DPA") outlines how OneCare processes your personal health data, particularly in relation to AI-powered features.</p>
                  <p><strong>Data Controller:</strong> You (the user) are the controller of your personal health data.</p>
                  <p><strong>Data Processor:</strong> OneCare acts as the processor of your data on your behalf.</p>
                  <p><strong>Sub-processors:</strong> Third-party AI services that may process anonymized data.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Brain className="h-5 w-5 text-ocean" />
                  2. AI Data Processing Details
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <h3 className="font-semibold text-foreground">2.1 What Data is Processed by AI</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Images of lab reports and medical documents you upload</li>
                    <li>Text content extracted from these documents</li>
                    <li>Numerical health values for extraction and categorization</li>
                  </ul>
                  
                  <h3 className="font-semibold text-foreground mt-4">2.2 What Data is NOT Sent to AI</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Your name, email, or any account identifiers</li>
                    <li>Your user ID or internal identifiers</li>
                    <li>Your location, IP address, or device information</li>
                    <li>Your medication history or other stored health records</li>
                    <li>Any data from Care Circle or shared provider information</li>
                  </ul>
                  
                  <h3 className="font-semibold text-foreground mt-4">2.3 AI Processing Purpose</h3>
                  <p>AI is used solely to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Extract numerical health values from lab report images</li>
                    <li>Identify and categorize health metrics (glucose, cholesterol, etc.)</li>
                    <li>Convert extracted data to a structured format for your records</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" />
                  3. On-Device Processing (Privacy-First Mode)
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <div className="flex items-start gap-3 p-4 bg-background rounded-lg border">
                    <Smartphone className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Your images never leave your device</p>
                      <p className="text-sm mt-1">For image uploads (JPG, PNG, WebP), we use on-device OCR technology. The raw image is processed entirely on your phone or computer using Tesseract.js. Only the extracted text is sent for analysis.</p>
                    </div>
                  </div>
                  
                  <h3 className="font-semibold text-foreground">3.1 How On-Device Processing Works</h3>
                  <ol className="list-decimal pl-6 space-y-2">
                    <li><strong>Local OCR:</strong> Your device runs Tesseract.js to read text from the image locally</li>
                    <li><strong>Text-Only Transmission:</strong> Only extracted text (not the image) is sent to our servers</li>
                    <li><strong>PII Stripping:</strong> Personal identifiers are removed from the text before AI analysis</li>
                    <li><strong>Vital Extraction:</strong> AI analyzes the anonymized text to extract health metrics</li>
                  </ol>
                  
                  <h3 className="font-semibold text-foreground mt-4">3.2 What This Means For You</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Lab report images with your name, DOB, and other PII never leave your device</li>
                    <li>Only anonymous numerical health data is processed by AI</li>
                    <li>Maximum privacy with no compromise on functionality</li>
                  </ul>
                  
                  <p className="text-sm italic mt-4">Note: PDF files still require server-side processing, but undergo strict PII stripping before AI analysis.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Shield className="h-5 w-5 text-status-success" />
                  4. Additional Anonymization Measures
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>In addition to on-device processing, we implement the following anonymization measures:</p>
                  
                  <h3 className="font-semibold text-foreground">4.1 Technical Measures</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>User ID Stripping:</strong> All internal user identifiers are removed from the request</li>
                    <li><strong>Session Isolation:</strong> Each AI request is independent with no session tracking</li>
                    <li><strong>Metadata Removal:</strong> EXIF data and document metadata are stripped from images</li>
                    <li><strong>PII Pattern Removal:</strong> Names, dates of birth, IDs, phone numbers, and addresses are detected and redacted</li>
                    <li><strong>No Correlation:</strong> AI cannot correlate requests to specific users</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">4.2 Verification</h3>
                  <p>Our anonymization process is verified through:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Regular code audits of data processing functions</li>
                    <li>Logging of all AI requests (without personal data) for compliance</li>
                    <li>Third-party security assessments</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber" />
                  5. Data Retention
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <h3 className="font-semibold text-foreground">4.1 AI Service Retention</h3>
                  <p>Our AI service providers do not retain your processed data. Data is:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Processed in memory only</li>
                    <li>Not stored in any logs or databases</li>
                    <li>Not used for training AI models</li>
                    <li>Deleted immediately after processing</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">4.2 OneCare Retention</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Uploaded documents:</strong> Stored in your secure bucket until you delete them</li>
                    <li><strong>Extracted health data:</strong> Stored in your account until deletion</li>
                    <li><strong>Consent logs:</strong> Retained for 7 years for legal compliance</li>
                    <li><strong>Account data:</strong> Retained while account is active</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo" />
                  6. Sub-Processors
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We use the following sub-processors for AI data processing:</p>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-semibold">Provider</th>
                          <th className="text-left py-2 font-semibold">Purpose</th>
                          <th className="text-left py-2 font-semibold">Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="py-2">Google Cloud (Gemini)</td>
                          <td className="py-2">AI processing for lab report extraction</td>
                          <td className="py-2">USA/EU</td>
                        </tr>
                        <tr className="border-b">
                          <td className="py-2">Supabase</td>
                          <td className="py-2">Database and file storage</td>
                          <td className="py-2">USA/EU</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-4">All sub-processors are bound by data processing agreements that ensure compliance with applicable data protection laws.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold">7. Your Rights</h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>You have the right to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Grant consent:</strong> Enable AI processing through Settings</li>
                    <li><strong>Revoke consent:</strong> Disable AI processing at any time</li>
                    <li><strong>View consent history:</strong> Access your consent log in Settings</li>
                    <li><strong>Delete data:</strong> Request deletion of all your data</li>
                    <li><strong>Export data:</strong> Request a copy of your data</li>
                    <li><strong>Restrict processing:</strong> Limit how your data is used</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold">8. Contact Information</h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>For questions about data processing or to exercise your rights:</p>
                  <p><strong>Data Protection Officer:</strong> dpo@onecare.you</p>
                  <p><strong>Privacy Team:</strong> privacy@onecare.you</p>
                  <p><strong>General Support:</strong> support@onecare.you</p>
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

export default DataProcessing;
