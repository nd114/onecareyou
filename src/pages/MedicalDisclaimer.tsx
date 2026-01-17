import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AlertTriangle, Stethoscope, BookOpen, Phone, Shield, Pill, Heart, Brain, Clock, FileText, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Separator } from '@/components/ui/separator';

const MedicalDisclaimer = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden gradient-hero py-16">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 text-destructive mb-6">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Important Notice</span>
            </div>
            
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-6">
              Medical Disclaimer
            </h1>
            
            <p className="text-lg text-muted-foreground">
              Please read this important information carefully before using OneCare.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 bg-background">
        <div className="container max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            {/* Critical Alert */}
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Not a Substitute for Professional Medical Advice</AlertTitle>
              <AlertDescription>
                OneCare is designed to assist with medication tracking and provide general information. 
                It is NOT intended to replace professional medical advice, diagnosis, or treatment. 
                ALWAYS seek the advice of qualified healthcare professionals.
              </AlertDescription>
            </Alert>

            {/* Main Content */}
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <Shield className="h-5 w-5 text-primary" />
                    General Information Purpose
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">
                    OneCare provides tools for tracking medications, vitamins, and supplements, 
                    as well as information about potential drug interactions. This information is 
                    provided for <strong>educational and organizational purposes only</strong> and should not be used as a basis for 
                    making medical decisions without consulting a qualified healthcare provider.
                  </p>
                </div>

                <Separator />

                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <Pill className="h-5 w-5 text-amber" />
                    Drug Interaction Information
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    While we strive to provide accurate and up-to-date information about drug 
                    interactions, our database may not include all possible interactions. 
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>Interaction information is sourced from FDA databases (DailyMed, OpenFDA, RxNorm) and may not reflect the most recent findings</li>
                    <li>The absence of an interaction warning does NOT guarantee that an interaction does not exist</li>
                    <li>Severity ratings are general guidelines and may vary based on individual patient factors</li>
                    <li>Drug-food, drug-supplement, and drug-condition interactions may not be fully covered</li>
                    <li>Interactions may differ based on dosage, timing, individual health conditions, and other factors</li>
                  </ul>
                  <p className="text-muted-foreground mt-4 font-semibold">
                    Always consult a pharmacist or physician to verify drug interactions before starting, stopping, or changing any medication.
                  </p>
                </div>

                <Separator />

                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <Brain className="h-5 w-5 text-indigo" />
                    AI-Extracted Information
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    OneCare uses artificial intelligence to extract data from uploaded lab reports and medical documents. 
                    While we strive for accuracy, AI-extracted data is subject to errors.
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li><strong>Always verify</strong> AI-extracted values against your original lab reports</li>
                    <li>Reference ranges may vary between laboratories and testing methods</li>
                    <li>Extracted values should not be used for self-diagnosis or treatment decisions</li>
                    <li>Report any extraction errors to help us improve accuracy</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <Clock className="h-5 w-5 text-ocean" />
                    Medication Reminders
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    Medication reminders are provided as a convenience tool and should not be relied upon as your sole method of medication management.
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>Technical issues, device settings, or connectivity problems may prevent reminders from being delivered</li>
                    <li>Always maintain backup reminder methods for critical medications</li>
                    <li>We are not responsible for missed doses due to undelivered reminders</li>
                    <li>Consult your healthcare provider for medication scheduling guidance</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <Heart className="h-5 w-5 text-rose" />
                    Vital Signs & Health Metrics
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    OneCare allows you to track vital signs and health metrics. This tracking is for personal organization and does not constitute medical monitoring.
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>Vital sign ranges and alerts are general guidelines, not personalized medical advice</li>
                    <li>Abnormal readings should be discussed with your healthcare provider</li>
                    <li>OneCare is not a substitute for medical monitoring devices or professional supervision</li>
                    <li>Do not rely on OneCare alerts for detecting medical emergencies</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <Users className="h-5 w-5 text-primary" />
                    Healthcare Provider Features
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    OneCare allows patients to share data with healthcare providers and receive guidance. Important limitations:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>Provider communications through OneCare do not create a physician-patient relationship</li>
                    <li>Guidance received through the platform does not constitute formal medical advice</li>
                    <li>We do not independently verify healthcare provider credentials</li>
                    <li>Always follow up with providers directly for medical concerns</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <Stethoscope className="h-5 w-5 text-status-success" />
                    Always Consult Healthcare Professionals
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    Before starting, stopping, or changing any medication or supplement regimen, always consult with:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>Your primary care physician</li>
                    <li>A licensed pharmacist</li>
                    <li>Relevant medical specialists</li>
                    <li>Your prescribing healthcare provider</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4 text-destructive">
                    <Phone className="h-5 w-5" />
                    Emergency Situations
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    <strong className="text-foreground">OneCare is NOT designed for emergency use.</strong> If you experience any of the following, seek immediate medical attention:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>Severe allergic reactions (difficulty breathing, swelling, hives)</li>
                    <li>Unusual bleeding or bruising</li>
                    <li>Severe side effects from any medication</li>
                    <li>Overdose or suspected poisoning</li>
                    <li>Chest pain, sudden numbness, or stroke symptoms</li>
                    <li>Any life-threatening symptoms</li>
                  </ul>
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mt-4">
                    <p className="text-destructive font-semibold flex items-center gap-2">
                      <Phone className="h-5 w-5" />
                      In a medical emergency, call 911 (US) or your local emergency services immediately.
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    Accuracy of Information
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    We make every effort to ensure the accuracy of the information provided:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>Drug information is sourced from FDA-maintained databases</li>
                    <li>Regular updates to our medication database</li>
                    <li>Cross-referencing with reputable medical sources</li>
                  </ul>
                  <p className="text-muted-foreground mt-4">
                    However, errors may occur, and medical knowledge evolves rapidly. We cannot 
                    guarantee that all information is complete, accurate, or current.
                  </p>
                </div>

                <Separator />

                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <Shield className="h-5 w-5 text-amber" />
                    User Responsibility & Acknowledgment
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    By using OneCare, you acknowledge and agree that:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>You are responsible for verifying any information with qualified healthcare professionals</li>
                    <li>You will not use OneCare as the sole basis for medical decisions</li>
                    <li>You understand the limitations of the information and tools provided</li>
                    <li>You will seek professional medical advice for any health concerns</li>
                    <li>You accept full responsibility for your health decisions</li>
                    <li>You will not hold OneCare liable for outcomes resulting from your use of the Service</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h2 className="text-xl font-semibold mb-4">
                    Limitation of Liability
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    OneCare, its affiliates, employees, and partners are not liable for any 
                    damages or adverse outcomes resulting from the use of information provided 
                    by this application. This includes, but is not limited to:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>Missed or incorrect drug interactions</li>
                    <li>Errors in medication scheduling or reminders</li>
                    <li>Inaccurate AI-extracted lab values</li>
                    <li>Decisions made based on app-provided information</li>
                    <li>Technical errors, service interruptions, or data loss</li>
                    <li>Actions or advice from healthcare providers using the platform</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Quick Reference Cards */}
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="text-center">
                <CardContent className="pt-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Stethoscope className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">Consult Your Doctor</h3>
                  <p className="text-sm text-muted-foreground">
                    Always discuss medication changes and health concerns with your healthcare provider.
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardContent className="pt-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">Read All Labels</h3>
                  <p className="text-sm text-muted-foreground">
                    Always read medication labels and package inserts carefully for complete information.
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardContent className="pt-6">
                  <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                    <Phone className="h-6 w-6 text-destructive" />
                  </div>
                  <h3 className="font-semibold mb-2">Emergency: Call 911</h3>
                  <p className="text-sm text-muted-foreground">
                    For medical emergencies, call emergency services immediately. OneCare is not for emergencies.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Last Updated */}
            <p className="text-sm text-muted-foreground text-center">
              Last updated: January 17, 2026
            </p>

            {/* Back Link */}
            <div className="text-center space-x-4">
              <Button variant="outline" asChild>
                <Link to="/">Return to Home</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/terms-of-service">View Terms of Service</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/privacy-policy">View Privacy Policy</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default MedicalDisclaimer;
