import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { SEOHead } from '@/components/seo/SEOHead';
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Shield, Lock, Eye, Server, Users, FileText, Mail, Sparkles, KeyRound } from "lucide-react";

const Security = () => {
  return (
    <div className="min-h-screen bg-muted/30">
      <SEOHead
        title="Security"
        description="How OneCare protects health records: patient-controlled sharing, database-enforced access, encryption, audit trails, and a firm line on identifiable data."
        canonical="/security"
      />
      <Header />

      <main className="container py-12 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-4 mb-8">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">Security at OneCare</h1>
              <p className="text-muted-foreground">Last updated: October 6, 2026</p>
            </div>
          </div>

          <Alert className="mb-8 border-primary/30 bg-primary/5">
            <Lock className="h-4 w-4 text-primary" />
            <AlertTitle>Our position on your data</AlertTitle>
            <AlertDescription>
              OneCare does not commercialise identifiable patient data. OneCare may use aggregated, de-identified
              data for platform analytics, product improvement and research under the{" "}
              <Link to="/privacy" className="underline">OneCare Privacy Policy</Link> (onecare.you/privacy).
            </AlertDescription>
          </Alert>

          <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
            <Card>
              <CardContent className="p-6 space-y-3 text-muted-foreground leading-relaxed">
                <p>
                  This page puts our security stance and the processes behind it in one place. The detail lives in the{" "}
                  <Link to="/privacy" className="underline">Privacy Policy</Link>, the{" "}
                  <Link to="/data-processing" className="underline">Data Processing</Link> page and the{" "}
                  <Link to="/ai-use-policy" className="underline">AI Use Policy</Link>; this is the summary.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  1. The patient holds the power
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>Every connection starts with the patient. You invite a clinician or connect to a hospital, choose what they can see, and can narrow, pause or end it at any time.</li>
                  <li>Nothing is re-shared or redirected on your behalf, and only you can widen what is shared.</li>
                  <li>There is no back door. Nobody reads a record without an active share, and there is no "break-glass" override for staff.</li>
                  <li>Revoking a share takes effect on the next read, not when a page reloads or "eventually".</li>
                  <li>One party deleting their copy never removes the other party's copy or anything in your Vault.</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Server className="h-5 w-5 text-status-success" />
                  2. Rules live in the database, not the screen
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>Access rules are enforced as row-level security in the database, so a screen can explain a rule but is never the rule.</li>
                  <li>A clinician's access to a patient is checked at the moment of each read and write, against an active share or assignment.</li>
                  <li>People who leave a practice lose access to its patients straight away. The practice keeps what was filed there.</li>
                  <li>Hospital owners and administrators run the organisation; they see clinical records only when given a clinical seat.</li>
                  <li>Plan and seat limits, billing fields and similar settings can be changed only by the billing system or a platform administrator, never from a user's own session.</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Lock className="h-5 w-5 text-status-success" />
                  3. Protecting data
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li><strong>In transit:</strong> data is encrypted with TLS.</li>
                  <li><strong>At rest:</strong> stored data is encrypted by our cloud infrastructure provider.</li>
                  <li><strong>Passwords:</strong> hashed with industry-standard algorithms and checked against known breach lists.</li>
                  <li><strong>Sessions:</strong> sessions expire, and clinician sessions sign out after 30 minutes of inactivity.</li>
                  <li><strong>Files:</strong> documents open only from short-lived links created for you, never through a third-party viewer.</li>
                  <li><strong>Server-only actions:</strong> notices, audit entries, billing changes and similar records are written by the server, not by the app on a user's behalf.</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Your data is primarily stored in United States data centres. See the{" "}
                  <Link to="/privacy" className="underline">Privacy Policy</Link> for data location and transfers.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  4. Transparency and audit
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>When a provider accesses your data, we log it. You can always see who currently has access.</li>
                  <li>Practices can see their own audit log of who accessed what.</li>
                  <li>Consent changes are logged with a time, so there is a record of what you agreed to and when.</li>
                  <li>Corrections, withdrawals and deletions leave a visible remnant saying what happened, when, by whom and why, rather than silently disappearing.</li>
                  <li>When a connection ends, a permanent copy of the shared care record is filed in your Vault.</li>
                  <li>We say when we could not check something. "We could not check" is never shown as "nothing found".</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  5. Identifiable data is not for sale
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>OneCare does not commercialise identifiable patient data, and we do not sell your personal health information.</li>
                  <li>OneCare may use aggregated, de-identified data for platform analytics, product improvement and research under the <Link to="/privacy" className="underline">OneCare Privacy Policy</Link> (onecare.you/privacy).</li>
                  <li>How AI, secondary use, research, analytics and de-identification are handled is set out in the <Link to="/ai-use-policy" className="underline">OneCare AI Use Policy</Link> (onecare.you/ai-use-policy).</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  6. AI
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>AI processing of your health data happens only with your explicit consent, which you can withdraw at any time in Settings.</li>
                  <li>Our AI providers do not retain your data after processing and do not train their models on it.</li>
                  <li>AI output is information, not medical advice. A clinician reviews anything that goes into a clinical note.</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Full detail, including the limits of our de-identification, is in the{" "}
                  <Link to="/ai-use-policy" className="underline">AI Use Policy</Link>.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-amber" />
                  7. What we do not claim
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>OneCare does not verify clinicians' credentials. Connect only with people you know and trust.</li>
                  <li>OneCare is not a Covered Entity or Business Associate under HIPAA. We apply security measures aligned with HIPAA standards as a best practice. We are not "HIPAA certified".</li>
                  <li>OneCare gives no medical advice and is not a substitute for a clinician. See the <Link to="/disclaimer" className="underline">Medical Disclaimer</Link>.</li>
                  <li>Our PII stripping for lab-report AI extraction is pattern based and not perfect. The <Link to="/ai-use-policy" className="underline">AI Use Policy</Link> says how well it works and when you should not rely on it.</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-3">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  8. Report a security issue
                </h2>
                <p className="text-muted-foreground">
                  If you believe you have found a vulnerability or are worried about your account, email{" "}
                  <a href="mailto:support@onecare.you" className="underline">support@onecare.you</a> with
                  the details. Please do not include health information in the message, and please give us a
                  reasonable chance to fix a problem before sharing it publicly.
                </p>
                <Separator />
                <p className="text-sm text-muted-foreground">
                  If you think someone else has accessed your account, change your password and email us.
                </p>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

export default Security;
