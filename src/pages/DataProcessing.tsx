import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Database, Shield, Brain, Clock, FileCheck, Users, Lock, Smartphone, AlertTriangle } from 'lucide-react';

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

          {/* Beta Disclaimer */}
          <Alert className="mb-8 border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-800 dark:text-amber-300">Beta Platform Notice</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              OneCare is currently in beta. While we implement robust data protection measures, some features may still be under development. 
              We recommend reviewing this agreement periodically as our practices evolve.
            </AlertDescription>
          </Alert>

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
                  2. AI Data Processing — Two Modes
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>OneCare uses AI in two distinct processing modes. Each handles your data differently:</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" />
                  3. Mode 1: Vitals Extraction (Anonymized Processing)
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <div className="flex items-start gap-3 p-4 bg-background rounded-lg border">
                    <Smartphone className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Your images never leave your device</p>
                      <p className="text-sm mt-1">For lab report image uploads (JPG, PNG, WebP), we use on-device OCR technology (Tesseract.js). The raw image is processed entirely on your phone or computer. Only the extracted text is sent for analysis.</p>
                    </div>
                  </div>
                  
                  <h3 className="font-semibold text-foreground">3.1 How On-Device Processing Works</h3>
                  <ol className="list-decimal pl-6 space-y-2">
                    <li><strong>Local OCR:</strong> Your device runs Tesseract.js to read text from the image locally</li>
                    <li><strong>Text-Only Transmission:</strong> Only extracted text (not the image) is sent to our servers</li>
                    <li><strong>PII Stripping:</strong> 13 regex-based patterns attempt to remove personal identifiers (names, DOB, IDs, phone numbers, addresses, SSNs, insurance info) from the text</li>
                    <li><strong>Vital Extraction:</strong> AI analyzes the processed text to extract health metrics</li>
                  </ol>
                  
                  <h3 className="font-semibold text-foreground mt-4">3.2 Limitations of PII Stripping</h3>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                    <p className="font-semibold text-foreground flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Honest Disclosure
                    </p>
                    <p className="text-sm">Our PII stripping uses pattern-based matching and is not perfect. It is estimated to be 80-90% effective on well-formatted English-language lab reports. Known limitations include:</p>
                    <ul className="list-disc pl-6 space-y-1 text-sm">
                      <li>Unlabeled names (e.g., a name appearing alone without a "Patient:" prefix)</li>
                      <li>Non-English name formats and international identifiers (e.g., South African ID numbers, UK postcodes)</li>
                      <li>Freeform notes or handwritten annotations</li>
                      <li>OCR artifacts that distort recognizable patterns</li>
                      <li>Contextual identifiers (e.g., room numbers, case references)</li>
                    </ul>
                    <p className="text-sm mt-2">We are actively investigating Named Entity Recognition (NER) AI models to improve de-identification accuracy in future releases.</p>
                  </div>
                  
                  <p className="text-sm italic mt-4">Note: PDF files still require server-side processing. Text is extracted and undergoes the same PII stripping process before AI analysis.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Brain className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  4. Mode 2: Health Vault Summarization (Full Document Processing)
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>When you choose to use "Summarize with AI" on a document in the Health Vault, a different processing approach is used:</p>
                  
                  <h3 className="font-semibold text-foreground">4.1 What Happens</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Full File Transmission:</strong> The actual document file (image, PDF, or text) is transmitted to our AI service for analysis</li>
                    <li><strong>Deep Analysis:</strong> The AI reads the full document to generate a comprehensive summary, category, and searchable tags</li>
                    <li><strong>PII in Output Prevented:</strong> The AI is specifically instructed not to include patient names, IDs, or personal identifiers in its summary output</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">4.2 What This Means For You</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>The AI service <strong>can see</strong> personal information present in your uploaded documents</li>
                    <li>No account identifiers (user ID, email, OneCare account info) are sent alongside the file</li>
                    <li>The AI does not retain, store, or learn from your documents</li>
                    <li>This mode provides significantly better summarization quality than text-only processing</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">4.3 Why This Differs From Vitals Extraction</h3>
                  <p>Vitals extraction only needs numerical health values, so anonymized text is sufficient. Health Vault summarization requires understanding the full document context — layout, headers, visual elements, and relationships between sections — which cannot be achieved from stripped text alone.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Shield className="h-5 w-5 text-status-success" />
                  5. Additional Security Measures
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
                    <li>Third-party security assessments (planned)</li>
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
