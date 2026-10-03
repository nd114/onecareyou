import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { FamilyProvider } from "@/contexts/FamilyContext";
import { ScribeRecorderProvider } from "@/contexts/ScribeRecorderContext";
import { ScribeRecordingPill } from "@/components/clinician/ScribeRecordingPill";
import { VoiceMemoSheetProvider } from "@/components/clinician/VoiceMemoSheet";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ClinicianRoute } from "@/components/auth/ClinicianRoute";
import { RequireCapability } from "@/components/clinician/RequireCapability";
import { PatientRoute } from "@/components/auth/PatientRoute";
import { PracticeAdminRoute } from "@/components/auth/PracticeAdminRoute";
const PracticeAdmin = lazy(() => import("./pages/PracticeAdmin"));
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { RouteTitle } from "@/components/layout/RouteTitle";
import { CookieConsentBanner } from "@/components/consent/CookieConsentBanner";
import { queryClient } from "@/lib/query-client";
import Landing from "./pages/Landing";
const BetaLanding = lazy(() => import("./pages/BetaLanding"));
const BetaBooking = lazy(() => import("./pages/BetaBooking"));
const BetaNDA = lazy(() => import("./pages/BetaNDA"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Medications = lazy(() => import("./pages/Medications"));
const AddMedication = lazy(() => import("./pages/AddMedication"));
const EditMedication = lazy(() => import("./pages/EditMedication"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Vitals = lazy(() => import("./pages/Vitals"));
const CareCircle = lazy(() => import("./pages/CareCircle"));
const ClinicianPortal = lazy(() => import("./pages/ClinicianPortal"));
const ClinicianSignUp = lazy(() => import("./pages/ClinicianSignUp"));
const ClinicianToday = lazy(() => import("./pages/ClinicianToday"));
const ClinicianSettings = lazy(() => import("./pages/ClinicianSettings"));
const ClinicianPractice = lazy(() => import("./pages/ClinicianPractice"));
const ClinicianPracticeSection = lazy(() => import("./pages/ClinicianPracticeSection"));
const FamilyDashboard = lazy(() => import("./pages/FamilyDashboard"));
const FamilyMemberDetail = lazy(() => import("./pages/FamilyMemberDetail"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const KingsChatComplete = lazy(() => import("./pages/KingsChatComplete"));
const Settings = lazy(() => import("./pages/Settings"));
const PatientGuidance = lazy(() => import("./pages/PatientGuidance"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const DataProcessing = lazy(() => import("./pages/DataProcessing"));
const About = lazy(() => import("./pages/About"));
const Features = lazy(() => import("./pages/Features"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Contact = lazy(() => import("./pages/Contact"));
const MedicalDisclaimer = lazy(() => import("./pages/MedicalDisclaimer"));

const Docs = lazy(() => import("./pages/Docs"));
import NotFound from "./pages/NotFound";
const AdherenceReport = lazy(() => import("./pages/AdherenceReport"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const KnowledgeBaseTopic = lazy(() => import("./pages/KnowledgeBaseTopic"));
const MedicationInfo = lazy(() => import("./pages/MedicationInfo"));
const SubscriptionSuccess = lazy(() => import("./pages/SubscriptionSuccess"));
const EHRComparison = lazy(() => import("./pages/EHRComparison"));
const AdminImport = lazy(() => import("./pages/AdminImport"));
const AdminBugReports = lazy(() => import("./pages/AdminBugReports"));
const AdminChangelog = lazy(() => import("./pages/AdminChangelog"));
const AdminDocs = lazy(() => import("./pages/AdminDocs"));

const AdminCareers = lazy(() => import("./pages/AdminCareers"));
const AdminConsole = lazy(() => import("./pages/AdminConsole"));
const AdminAccountsPage = lazy(() => import("./pages/AdminConsole").then((m) => ({ default: m.AdminAccountsPage })));
const AdminRevenuePage = lazy(() => import("./pages/AdminConsole").then((m) => ({ default: m.AdminRevenuePage })));
const AdminReliabilityPage = lazy(() => import("./pages/AdminConsole").then((m) => ({ default: m.AdminReliabilityPage })));
const AdminTrustPage = lazy(() => import("./pages/AdminConsole").then((m) => ({ default: m.AdminTrustPage })));
const AdminWorkshopPage = lazy(() => import("./pages/AdminConsole").then((m) => ({ default: m.AdminWorkshopPage })));

import { AdminRoute } from "./components/auth/AdminRoute";
const ClinicianPricing = lazy(() => import("./pages/ClinicianPricing"));
const EnterpriseInquiry = lazy(() => import("./pages/EnterpriseInquiry"));
const ClinicianBAA = lazy(() => import("./pages/ClinicianBAA"));
const ClinicianSubscriptionSuccess = lazy(() => import("./pages/ClinicianSubscriptionSuccess"));
const ClinicianWhyOneCare = lazy(() => import("./pages/ClinicianWhyOneCare"));
const ClinicianPatientDetail = lazy(() => import("./pages/ClinicianPatientDetail"));
const ClinicianPatients = lazy(() => import("./pages/ClinicianPatients"));
const ClinicianGuidance = lazy(() => import("./pages/ClinicianGuidance"));
const ClinicianAlerts = lazy(() => import("./pages/ClinicianAlerts"));
const ClinicianSchedule = lazy(() => import("./pages/ClinicianSchedule"));
const ClinicianScribe = lazy(() => import("./pages/ClinicianScribe"));
const ClinicianVoiceMemos = lazy(() => import("./pages/ClinicianVoiceMemos"));
const ClinicianInvoices = lazy(() => import("./pages/ClinicianInvoices"));
const ClinicianPatientImport = lazy(() => import("./pages/ClinicianPatientImport"));
const ClinicianManagedRecord = lazy(() => import("./pages/ClinicianManagedRecord"));

const Sitemap = lazy(() => import("./pages/Sitemap"));
const Careers = lazy(() => import("./pages/Careers"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const HealthVault = lazy(() => import("./pages/HealthVault"));
const Recordings = lazy(() => import("./pages/Recordings"));
const Messages = lazy(() => import("./pages/Messages"));
const ClinicianMessages = lazy(() => import("./pages/ClinicianMessages"));
const Install = lazy(() => import("./pages/Install"));
const ForClinicians = lazy(() => import("./pages/ForClinicians"));
import { Navigate } from "react-router-dom";
import { BugReportButton } from "./components/beta/BugReportButton";
import { PatientAIChatMount } from "./components/ai/PatientAIChatMount";
import { ClinicianAIChatMount } from "./components/clinician/ClinicianAIChatMount";
import { FabStack } from "./components/beta/FabStack";
import { MobileBottomNav } from "./components/layout/MobileBottomNav";
import { StandaloneLaunchRedirect } from "@/components/auth/StandaloneLaunchRedirect";
const AIHub = lazy(() => import("./pages/AIHub"));
const ClinicianDictations = lazy(() => import("./pages/ClinicianDictations"));
const ClinicianTemplates = lazy(() => import("./pages/ClinicianTemplates"));
const ClinicianAudit = lazy(() => import("./pages/ClinicianAudit"));
const ClinicianReports = lazy(() => import("./pages/ClinicianReports"));
const ClinicianCompliance = lazy(() => import("./pages/ClinicianCompliance"));
const AdminTenantDetail = lazy(() => import("./pages/AdminTenantDetail"));
import TenantHome from "@/components/tenant/TenantHome";
import LegacyInstitutionRedirect from "@/components/tenant/LegacyInstitutionRedirect";
import { FAMILY_HEALTH_ENABLED } from '@/lib/feature-flags';
const Billing = lazy(() => import("./pages/Billing"));
const SnapshotViewer = lazy(() => import("./pages/SnapshotViewer"));

/**
 * The read-only snapshot viewer is for somebody with no account, so none of
 * the app's floating chrome belongs on it — no assistant, no bug button, no
 * navigation into a OneCare they have no part in. That holds even when the
 * browser happens to be signed in to OneCare.
 */
const AppChrome = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  return pathname === "/s" ? null : <>{children}</>;
};





const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
        <FamilyProvider>
        <ScribeRecorderProvider>
          <VoiceMemoSheetProvider>
        <BrowserRouter future={routerFutureFlags}>
          <ScrollToTop />
          <RouteTitle />
          <StandaloneLaunchRedirect />
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-muted-foreground" role="status" aria-label="Loading">Loading…</div>}>
          <Routes>
            <Route path="/" element={<TenantHome />} />
            {/* Staff registration at the hospital's own address. */}
            <Route path="/staff" element={<TenantHome audience="staff" />} />
            {/* Deprecated: forwards to <slug>.onecare.you */}
            <Route path="/i/:slug" element={<LegacyInstitutionRedirect />} />


            <Route path="/beta" element={<BetaLanding />} />
            <Route path="/beta/book" element={<BetaBooking />} />
            <Route path="/beta/nda" element={<BetaNDA />} />
            {/* Branded sign-in on a tenant host; the generic page elsewhere. */}
            <Route path="/sign-in" element={<TenantHome mode="sign-in" />} />
            <Route
              path="/clinician/sign-in"
              element={<TenantHome audience="staff" mode="sign-in" />}
            />

            <Route path="/sign-up" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* Where KingsChat's callback returns the approving browser. */}
            <Route path="/auth/kingschat/complete" element={<KingsChatComplete />} />
            <Route path="/clinician/sign-up" element={<ClinicianSignUp />} />
            <Route path="/about" element={<About />} />
            <Route path="/features" element={<Features />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/data-processing" element={<DataProcessing />} />
            <Route path="/disclaimer" element={<MedicalDisclaimer />} />
            <Route path="/help" element={<Navigate to="/docs" replace />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/docs/:slug" element={<Docs />} />
            {/* The guide became the documentation site; old links still land. */}
            <Route path="/guide" element={<Navigate to="/docs" replace />} />
            <Route path="/sitemap" element={<Sitemap />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/careers/:jobId" element={<JobDetail />} />
            {/* Read-only snapshot link. The token is in the fragment (/s#token),
                never the path, so it does not reach any server log. */}
            <Route path="/s" element={<SnapshotViewer />} />
            {/* Patient detail view - requires auth */}
            <Route path="/clinician/patient/:inviteCode" element={
              <ClinicianRoute>
                <ClinicianPatientDetail />
              </ClinicianRoute>
            } />
            <Route path="/clinician/today" element={
              <ClinicianRoute>
                <ClinicianToday />
              </ClinicianRoute>
            } />
            {/* Overview merged into Today — keep the old link working */}
            <Route path="/clinician/dashboard" element={<Navigate to="/clinician/today" replace />} />

            <Route path="/clinician/patients" element={
              <ClinicianRoute>
                <ClinicianPatients />
              </ClinicianRoute>
            } />
            {/* Practice roles: the database already refuses these reads to a
                receptionist or a biller. Turning them away at the door is
                clearer than handing them an empty screen. */}
            <Route path="/clinician/guidance" element={
              <ClinicianRoute>
                <RequireCapability capability="send_guidance">
                  <ClinicianGuidance />
                </RequireCapability>
              </ClinicianRoute>
            } />
            <Route path="/clinician/alerts" element={
              <ClinicianRoute>
                <RequireCapability capability="view_phi">
                  <ClinicianAlerts />
                </RequireCapability>
              </ClinicianRoute>
            } />
            {/* The practice diary and the practice ledger. The per-patient
                tabs answer "what about this person"; these answer "what about
                today" and "who owes us what", which no screen could. */}
            {/* The scribe's own front door: pick the patient, then record. */}
            <Route path="/clinician/scribe" element={
              <ClinicianRoute>
                <RequireCapability capability="edit_clinical">
                  <ClinicianScribe />
                </RequireCapability>
              </ClinicianRoute>
            } />
            {/* The clinician's own dictated notes: capture is the record control, this is the inbox. */}
            <Route path="/clinician/voice-memos" element={
              <ClinicianRoute>
                <RequireCapability capability="edit_clinical">
                  <ClinicianVoiceMemos />
                </RequireCapability>
              </ClinicianRoute>
            } />
            <Route path="/clinician/schedule" element={
              <ClinicianRoute>
                <ClinicianSchedule />
              </ClinicianRoute>
            } />
            <Route path="/clinician/invoices" element={
              <ClinicianRoute>
                <RequireCapability capability="manage_billing">
                  <ClinicianInvoices />
                </RequireCapability>
              </ClinicianRoute>
            } />
            <Route path="/clinician/messages" element={
              <ClinicianRoute>
                <RequireCapability capability="message_patients">
                  <ClinicianMessages />
                </RequireCapability>
              </ClinicianRoute>
            } />
            <Route path="/clinician/patients/import" element={
              <ClinicianRoute>
                <RequireCapability capability="invite_patients">
                  <ClinicianPatientImport />
                </RequireCapability>
              </ClinicianRoute>
            } />
            <Route path="/clinician/records/:recordId" element={
              <ClinicianRoute>
                <ClinicianManagedRecord />
              </ClinicianRoute>
            } />

            <Route path="/clinician/settings" element={
              <ClinicianRoute>
                <ClinicianSettings />
              </ClinicianRoute>
            } />
            <Route path="/practice" element={
              <PracticeAdminRoute>
                <PracticeAdmin />
              </PracticeAdminRoute>
            } />
            <Route path="/clinician/practice" element={
              <ClinicianRoute>
                <ClinicianPractice />
              </ClinicianRoute>
            } />
            {/* People, patient access, practice details, plan and usage — see
                src/lib/practice-sections.ts for the grouping and for why a
                section is only offered when something in it will render. */}
            <Route path="/clinician/practice/:sectionId" element={
              <ClinicianRoute>
                <ClinicianPracticeSection />
              </ClinicianRoute>
            } />

            <Route path="/onboarding" element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <PatientRoute>
                <Dashboard />
              </PatientRoute>
            } />
            <Route path="/medications" element={
              <PatientRoute>
                <Medications />
              </PatientRoute>
            } />
            <Route path="/medications/add" element={
              <PatientRoute>
                <AddMedication />
              </PatientRoute>
            } />
            <Route path="/medications/:id/edit" element={
              <PatientRoute>
                <EditMedication />
              </PatientRoute>
            } />
            <Route path="/schedule" element={
              <PatientRoute>
                <Schedule />
              </PatientRoute>
            } />
            <Route path="/vitals" element={
              <PatientRoute>
                <Vitals />
              </PatientRoute>
            } />
            <Route path="/billing" element={
              <PatientRoute>
                <Billing />
              </PatientRoute>
            } />
            <Route path="/care-circle" element={
              <PatientRoute>
                <CareCircle />
              </PatientRoute>
            } />
            <Route path="/health-vault" element={
              <PatientRoute>
                <HealthVault />
              </PatientRoute>
            } />
            <Route path="/recordings" element={
              <PatientRoute>
                <Recordings />
              </PatientRoute>
            } />
            <Route path="/messages" element={
              <PatientRoute>
                <Messages />
              </PatientRoute>
            } />
            {/* Family health management is hidden — see FAMILY_HEALTH_ENABLED
                in src/lib/feature-flags.ts for why and how to restore it. The
                routes still redirect so an old bookmark lands somewhere sane. */}
            <Route path="/family" element={
              FAMILY_HEALTH_ENABLED ? (
                <PatientRoute>
                  <FamilyDashboard />
                </PatientRoute>
              ) : (
                <Navigate to="/care-circle" replace />
              )
            } />
            <Route path="/family/:memberId" element={
              FAMILY_HEALTH_ENABLED ? (
                <PatientRoute>
                  <FamilyMemberDetail />
                </PatientRoute>
              ) : (
                <Navigate to="/care-circle" replace />
              )
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="/guidance" element={
              <PatientRoute>
                <PatientGuidance />
              </PatientRoute>
            } />
            <Route path="/adherence-report" element={
              <PatientRoute>
                <AdherenceReport />
              </PatientRoute>
            } />
            <Route path="/knowledge-base" element={
              <PatientRoute>
                <KnowledgeBase />
              </PatientRoute>
            } />
            <Route path="/knowledge-base/:topicSlug" element={
              <PatientRoute>
                <KnowledgeBaseTopic />
              </PatientRoute>
            } />
            <Route path="/medication-info/:drugName" element={
              <PatientRoute>
                <MedicationInfo />
              </PatientRoute>
            } />
            <Route path="/subscription-success" element={
              <PatientRoute>
                <SubscriptionSuccess />
              </PatientRoute>
            } />
            {/* Internal/unlisted pages */}
            <Route path="/ehr-comparison" element={
              <ProtectedRoute>
                <EHRComparison />
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <AdminRoute>
                <AdminConsole />
              </AdminRoute>
            } />
            <Route path="/admin/accounts" element={
              <AdminRoute>
                <AdminAccountsPage />
              </AdminRoute>
            } />
            <Route path="/admin/revenue" element={
              <AdminRoute>
                <AdminRevenuePage />
              </AdminRoute>
            } />
            <Route path="/admin/reliability" element={
              <AdminRoute>
                <AdminReliabilityPage />
              </AdminRoute>
            } />
            <Route path="/admin/trust" element={
              <AdminRoute>
                <AdminTrustPage />
              </AdminRoute>
            } />
            <Route path="/admin/workshop" element={
              <AdminRoute>
                <AdminWorkshopPage />
              </AdminRoute>
            } />
            <Route path="/admin/tenants/:id" element={
              <AdminRoute>
                <AdminTenantDetail />
              </AdminRoute>
            } />

            <Route path="/admin/import" element={
              <AdminRoute>
                <AdminImport />
              </AdminRoute>
            } />
            <Route path="/admin/bugs" element={
              <AdminRoute>
                <AdminBugReports />
              </AdminRoute>
            } />
            <Route path="/admin/careers" element={
              <AdminRoute>
                <AdminCareers />
              </AdminRoute>
            } />
            <Route path="/admin/docs" element={
              <AdminRoute>
                <AdminDocs />
              </AdminRoute>
            } />

            <Route path="/admin/changelog" element={
              <AdminRoute>
                <AdminChangelog />
              </AdminRoute>
            } />
            {/* Public marketing + install routes */}
            <Route path="/for-clinicians" element={<ForClinicians />} />
            <Route path="/install" element={<Install />} />
            {/* Clinician pricing now lives at /pricing?audience=clinicians */}
            <Route path="/clinician/pricing" element={<Navigate to="/pricing?audience=clinicians" replace />} />
            <Route path="/clinician/why-onecare" element={<ClinicianWhyOneCare />} />
            <Route path="/clinician/patients/:inviteCode" element={
              <ClinicianRoute>
                <ClinicianPatientDetail />
              </ClinicianRoute>
            } />
            <Route path="/clinician/enterprise-inquiry" element={
              <ClinicianRoute>
                <EnterpriseInquiry />
              </ClinicianRoute>
            } />
            <Route path="/clinician/baa" element={
              <ClinicianRoute>
                <ClinicianBAA />
              </ClinicianRoute>
            } />
            <Route path="/clinician/subscription-success" element={
              <ClinicianRoute>
                <ClinicianSubscriptionSuccess />
              </ClinicianRoute>
            } />
            <Route path="/ai" element={
              <PatientRoute>
                <AIHub />
              </PatientRoute>
            } />
            <Route path="/ai/:conversationId" element={
              <PatientRoute>
                <AIHub />
              </PatientRoute>
            } />

            {/* /assist was a full-page copy of the assistant that already floats
                on every patient screen. Kept as a redirect so old links, the PWA
                shortcut and anything bookmarked still land somewhere useful. */}
            <Route path="/assist" element={<Navigate to="/ai" replace />} />
            <Route path="/clinician/dictations" element={
              <ClinicianRoute>
                <ClinicianDictations />
              </ClinicianRoute>
            } />
            <Route path="/clinician/templates" element={
              <ClinicianRoute>
                <RequireCapability capability="edit_clinical">
                  <ClinicianTemplates />
                </RequireCapability>
              </ClinicianRoute>
            } />
            <Route path="/clinician/audit" element={
              <ClinicianRoute>
                <ClinicianAudit />
              </ClinicianRoute>
            } />
            <Route path="/clinician/reports" element={
              <ClinicianRoute>
                <ClinicianReports />
              </ClinicianRoute>
            } />
            <Route path="/clinician/compliance" element={
              <ClinicianRoute>
                <ClinicianCompliance />
              </ClinicianRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          <CookieConsentBanner />
          <AppChrome>
            <FabStack>
              <PatientAIChatMount />
              <ClinicianAIChatMount />
              <BugReportButton />
            </FabStack>
            <MobileBottomNav />
            <ScribeRecordingPill />
          </AppChrome>
        </BrowserRouter>
          </VoiceMemoSheetProvider>
        </ScribeRecorderProvider>
        </FamilyProvider>
      </AuthProvider>
    </TooltipProvider>
  </ThemeProvider>
  </QueryClientProvider>
);

export default App;
