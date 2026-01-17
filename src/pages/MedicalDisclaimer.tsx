import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AlertTriangle, Stethoscope, BookOpen, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

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
              Please read this important information about the use of OneCare.
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
              </AlertDescription>
            </Alert>

            {/* Main Content */}
            <Card>
              <CardContent className="pt-6 prose prose-gray dark:prose-invert max-w-none">
                <h2>General Information</h2>
                <p>
                  OneCare provides tools for tracking medications, vitamins, and supplements, 
                  as well as information about potential drug interactions. This information is 
                  provided for educational purposes only and should not be used as a basis for 
                  making medical decisions.
                </p>

                <h2>Drug Interaction Information</h2>
                <p>
                  While we strive to provide accurate and up-to-date information about drug 
                  interactions, our database may not include all possible interactions. The 
                  absence of an interaction warning does not guarantee that an interaction 
                  does not exist.
                </p>
                <ul>
                  <li>Interaction information is based on general drug properties and may not 
                      account for individual patient factors</li>
                  <li>New interactions are discovered regularly, and our database may not 
                      reflect the most recent findings</li>
                  <li>Severity ratings are general guidelines and may vary based on individual 
                      circumstances</li>
                </ul>

                <h2>Always Consult Healthcare Professionals</h2>
                <p>
                  Before starting, stopping, or changing any medication or supplement regimen, 
                  always consult with:
                </p>
                <ul>
                  <li>Your primary care physician</li>
                  <li>A licensed pharmacist</li>
                  <li>Relevant medical specialists</li>
                </ul>

                <h2>Emergency Situations</h2>
                <p>
                  <strong>OneCare is not designed for emergency use.</strong> If you experience 
                  any of the following, seek immediate medical attention:
                </p>
                <ul>
                  <li>Severe allergic reactions (difficulty breathing, swelling, hives)</li>
                  <li>Unusual bleeding or bruising</li>
                  <li>Severe side effects from any medication</li>
                  <li>Overdose or suspected poisoning</li>
                  <li>Any life-threatening symptoms</li>
                </ul>

                <h2>Accuracy of Information</h2>
                <p>
                  We make every effort to ensure the accuracy of the information provided, 
                  including:
                </p>
                <ul>
                  <li>Regular updates to our medication database</li>
                  <li>Cross-referencing with reputable medical sources</li>
                  <li>Review by healthcare professionals</li>
                </ul>
                <p>
                  However, errors may occur, and medical knowledge evolves rapidly. We cannot 
                  guarantee that all information is complete, accurate, or current.
                </p>

                <h2>User Responsibility</h2>
                <p>By using OneCare, you acknowledge and agree that:</p>
                <ul>
                  <li>You are responsible for verifying any information with qualified 
                      healthcare professionals</li>
                  <li>You will not use OneCare as the sole basis for medical decisions</li>
                  <li>You understand the limitations of the information provided</li>
                  <li>You will seek professional medical advice for any health concerns</li>
                </ul>

                <h2>Limitation of Liability</h2>
                <p>
                  OneCare, its affiliates, employees, and partners are not liable for any 
                  damages or adverse outcomes resulting from the use of information provided 
                  by this application. This includes, but is not limited to:
                </p>
                <ul>
                  <li>Missed or incorrect drug interactions</li>
                  <li>Errors in medication scheduling or reminders</li>
                  <li>Decisions made based on app-provided information</li>
                  <li>Technical errors or service interruptions</li>
                </ul>
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
                    Always discuss medication changes with your healthcare provider.
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
                    Always read medication labels and package inserts carefully.
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
                    For medical emergencies, call emergency services immediately.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Last Updated */}
            <p className="text-sm text-muted-foreground text-center">
              Last updated: January 2025
            </p>

            {/* Back Link */}
            <div className="text-center">
              <Button variant="outline" asChild>
                <Link to="/">Return to Home</Link>
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
