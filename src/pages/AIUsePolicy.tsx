import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { SEOHead } from '@/components/seo/SEOHead';
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, Lock, Stethoscope, FlaskConical, EyeOff, UserCheck, Mail, AlertTriangle } from "lucide-react";

const AIUsePolicy = () => {
  return (
    <div className="min-h-screen bg-muted/30">
      <SEOHead
        title="AI Use Policy"
        description="How OneCare uses AI, and how secondary data use, research, analytics and de-identification work. Consent first, no sale of identifiable data."
        canonical="/ai-use-policy"
      />
      <Header />

      <main className="container py-12 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-4 mb-8">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">OneCare AI Use Policy</h1>
              <p className="text-muted-foreground">Last updated: October 6, 2026</p>
            </div>
          </div>

          <Alert className="mb-8 border-primary/30 bg-primary/5">
            <Lock className="h-4 w-4 text-primary" />
            <AlertTitle>In short</AlertTitle>
            <AlertDescription>
              The use of AI, secondary data use, research, analytics and de-identification at OneCare follow this
              policy. OneCare does not commercialise identifiable patient data. OneCare may use aggregated,
              de-identified data for platform analytics, product improvement and research under the{" "}
              <Link to="/privacy" className="underline">OneCare Privacy Policy</Link>.
            </AlertDescription>
          </Alert>

          <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  1. Where OneCare uses AI
                </h2>
                <p className="text-muted-foreground">
                  Patient-side AI features are part of the Plus plan. Your consent is required before any AI
                  processing of your health data, and you can withdraw it at any time in Settings.
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>The assistant:</strong> answers general health-education questions and helps you use
                    the platform. Only the text of your question is sent. It does not diagnose or advise on
                    treatment.
                  </li>
                  <li>
                    <strong>Voice questions:</strong> speech is turned into text in your browser. Only the text is
                    sent, and no audio is stored.
                  </li>
                  <li>
                    <strong>Lab report extraction:</strong> the report is scanned on your device, personal
                    identifiers are stripped by pattern matching, and only the anonymised text with the health
                    values is sent. The raw image never leaves your device.
                  </li>
                  <li>
                    <strong>Health Vault summaries:</strong> when you choose to summarise a document, the file
                    itself is sent for analysis. It may contain personal information visible in the document. No
                    account identifiers are sent with it.
                  </li>
                </ul>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
                  <strong className="text-foreground">Honest limit:</strong> our personal-information stripping is
                  pattern based, roughly 80 to 90 percent effective on well-formatted English lab reports. It can
                  miss unlabelled names, non-English identifiers, unusual address formats and scanning artefacts.
                  We cannot guarantee that every identifier is removed.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-primary" />
                  2. AI used by clinicians
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>The visit scribe and voice memos:</strong> turn a recording into a transcript and a
                    draft note. The clinician is asked to confirm the patient's consent before recording. The scribe
                    is part of the Practice, Clinic and Enterprise plans.
                  </li>
                  <li>
                    <strong>The clinician assistant:</strong> can propose actions and drafts. Nothing it produces is
                    final until the clinician reviews and accepts it.
                  </li>
                  <li>
                    A clinician stays responsible for everything in a clinical record. A draft from AI is a draft,
                    not a finding, and it is never sent to a patient or filed as a signed note without a clinician
                    acting on it.
                  </li>
                  <li>
                    OneCare does not verify clinicians and does not give medical advice. See the{" "}
                    <Link to="/disclaimer" className="underline">Medical Disclaimer</Link>.
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Lock className="h-5 w-5 text-status-success" />
                  3. What our AI providers may do with your data
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>They process it to answer the request and do not retain it afterwards.</li>
                  <li>They do not use it to train AI models.</li>
                  <li>Transfers are encrypted in transit.</li>
                  <li>Requests are not linked to your name, email or account identifiers.</li>
                  <li>We log that a request happened, without the personal content, for compliance.</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-primary" />
                  4. Secondary use, analytics and research
                </h2>
                <p className="text-muted-foreground">
                  Secondary use means using data for something other than looking after the person it belongs to.
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>Identifiable data is never commercialised.</strong> We do not sell it, license it or
                    share it for another party's commercial gain.
                  </li>
                  <li>
                    OneCare may use <strong>aggregated, de-identified data</strong> for platform analytics, product
                    improvement and research, under the{" "}
                    <Link to="/privacy" className="underline">OneCare Privacy Policy</Link>.
                  </li>
                  <li>
                    Analytics and research work on results about groups of people. They are not used to look up,
                    profile or contact an individual.
                  </li>
                  <li>
                    Content you write to the assistant, your documents and your messages are not used to train
                    AI models, ours or anyone else's.
                  </li>
                  <li>
                    A clinician's or hospital's patients stay theirs. Secondary use never lets one practice see
                    another's records, and never overrides a share you have ended.
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <EyeOff className="h-5 w-5 text-primary" />
                  5. What de-identified means here
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>Direct identifiers (name, contact details, account and record identifiers) are removed.</li>
                  <li>Data is combined into groups before use, so one person's record is not singled out.</li>
                  <li>We do not try to re-identify de-identified data and we do not permit anyone we share it with to do so.</li>
                  <li>Where a group is so small that a person could be recognised, we do not report on it.</li>
                  <li>
                    De-identification lowers risk and cannot remove it completely. That is why identifiable data is
                    kept out of analytics and research altogether.
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber" />
                  6. Limits and your choices
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>AI can be wrong. Check anything that matters with a qualified clinician.</li>
                  <li>You can withdraw AI consent at any time in Settings. Withdrawing stops AI processing from then on.</li>
                  <li>You can ask for access to or deletion of your data. See the <Link to="/privacy" className="underline">Privacy Policy</Link> for how.</li>
                  <li>We will update this policy before we change how AI or secondary use works, and tell you when it changes.</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  See also <Link to="/security" className="underline">Security at OneCare</Link> and{" "}
                  <Link to="/data-processing" className="underline">Data Processing</Link>.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-2">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  Questions
                </h2>
                <p className="text-muted-foreground">
                  Email <a href="mailto:support@onecare.you" className="underline">support@onecare.you</a>. Please
                  do not include health information in the message.
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

export default AIUsePolicy;
