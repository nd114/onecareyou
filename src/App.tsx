import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { FamilyProvider } from "@/contexts/FamilyContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { CookieConsentBanner } from "@/components/consent/CookieConsentBanner";
import { queryClient } from "@/lib/query-client";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Medications from "./pages/Medications";
import AddMedication from "./pages/AddMedication";
import EditMedication from "./pages/EditMedication";
import Schedule from "./pages/Schedule";
import Vitals from "./pages/Vitals";
import CareCircle from "./pages/CareCircle";
import ClinicianPortal from "./pages/ClinicianPortal";
import ClinicianSignUp from "./pages/ClinicianSignUp";
import ClinicianDashboard from "./pages/ClinicianDashboard";
import ClinicianToday from "./pages/ClinicianToday";
import ClinicianSettings from "./pages/ClinicianSettings";
import ClinicianPractice from "./pages/ClinicianPractice";
import FamilyDashboard from "./pages/FamilyDashboard";
import FamilyMemberDetail from "./pages/FamilyMemberDetail";
import Onboarding from "./pages/Onboarding";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Settings from "./pages/Settings";
import PatientGuidance from "./pages/PatientGuidance";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import DataProcessing from "./pages/DataProcessing";
import About from "./pages/About";
import Features from "./pages/Features";
import Pricing from "./pages/Pricing";
import Contact from "./pages/Contact";
import MedicalDisclaimer from "./pages/MedicalDisclaimer";
import HelpCenter from "./pages/HelpCenter";
import NotFound from "./pages/NotFound";
import AdherenceReport from "./pages/AdherenceReport";
import KnowledgeBase from "./pages/KnowledgeBase";
import KnowledgeBaseTopic from "./pages/KnowledgeBaseTopic";
import MedicationInfo from "./pages/MedicationInfo";
import SubscriptionSuccess from "./pages/SubscriptionSuccess";
import EHRComparison from "./pages/EHRComparison";
import AdminImport from "./pages/AdminImport";
import AdminChangelog from "./pages/AdminChangelog";
import ClinicianPricing from "./pages/ClinicianPricing";
import EnterpriseInquiry from "./pages/EnterpriseInquiry";
import ClinicianBAA from "./pages/ClinicianBAA";
import ClinicianSubscriptionSuccess from "./pages/ClinicianSubscriptionSuccess";
import ClinicianWhyOneCare from "./pages/ClinicianWhyOneCare";
import ClinicianPatientDetail from "./pages/ClinicianPatientDetail";
import ClinicianPatients from "./pages/ClinicianPatients";
import ClinicianGuidance from "./pages/ClinicianGuidance";
import ClinicianAlerts from "./pages/ClinicianAlerts";
import ClinicianPatientImport from "./pages/ClinicianPatientImport";
import Sitemap from "./pages/Sitemap";
import Careers from "./pages/Careers";
import JobDetail from "./pages/JobDetail";
import HealthVault from "./pages/HealthVault";
import Messages from "./pages/Messages";
import ClinicianMessages from "./pages/ClinicianMessages";
import Install from "./pages/Install";
import ForClinicians from "./pages/ForClinicians";
import { Navigate } from "react-router-dom";
import { BugReportButton } from "./components/beta/BugReportButton";
import { PatientAIChatMount } from "./components/ai/PatientAIChatMount";
import { FabStack } from "./components/beta/FabStack";
import { StandaloneLaunchRedirect } from "@/components/auth/StandaloneLaunchRedirect";
import Assist from "./pages/Assist";
import ClinicianDictations from "./pages/ClinicianDictations";
import ClinicianTemplates from "./pages/ClinicianTemplates";
import ClinicianAudit from "./pages/ClinicianAudit";
import ClinicianReports from "./pages/ClinicianReports";


const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
        <FamilyProvider>
        <BrowserRouter future={routerFutureFlags}>
          <ScrollToTop />
          <StandaloneLaunchRedirect />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/sign-up" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/clinician/sign-up" element={<ClinicianSignUp />} />
            <Route path="/about" element={<About />} />
            <Route path="/features" element={<Features />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/data-processing" element={<DataProcessing />} />
            <Route path="/disclaimer" element={<MedicalDisclaimer />} />
            <Route path="/help" element={<HelpCenter />} />
            <Route path="/sitemap" element={<Sitemap />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/careers/:jobId" element={<JobDetail />} />
            {/* Patient detail view - requires auth */}
            <Route path="/clinician/patient/:inviteCode" element={
              <ProtectedRoute>
                <ClinicianPatientDetail />
              </ProtectedRoute>
            } />
            <Route path="/clinician/today" element={
              <ProtectedRoute>
                <ClinicianToday />
              </ProtectedRoute>
            } />
            <Route path="/clinician/dashboard" element={
              <ProtectedRoute>
                <ClinicianDashboard />
              </ProtectedRoute>
            } />
            <Route path="/clinician/patients" element={
              <ProtectedRoute>
                <ClinicianPatients />
              </ProtectedRoute>
            } />
            <Route path="/clinician/guidance" element={
              <ProtectedRoute>
                <ClinicianGuidance />
              </ProtectedRoute>
            } />
            <Route path="/clinician/alerts" element={
              <ProtectedRoute>
                <ClinicianAlerts />
              </ProtectedRoute>
            } />
            <Route path="/clinician/messages" element={
              <ProtectedRoute>
                <ClinicianMessages />
              </ProtectedRoute>
            } />
            <Route path="/clinician/patients/import" element={
              <ProtectedRoute>
                <ClinicianPatientImport />
              </ProtectedRoute>
            } />
            <Route path="/clinician/settings" element={
              <ProtectedRoute>
                <ClinicianSettings />
              </ProtectedRoute>
            } />
            <Route path="/clinician/practice" element={
              <ProtectedRoute>
                <ClinicianPractice />
              </ProtectedRoute>
            } />
            <Route path="/onboarding" element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/medications" element={
              <ProtectedRoute>
                <Medications />
              </ProtectedRoute>
            } />
            <Route path="/medications/add" element={
              <ProtectedRoute>
                <AddMedication />
              </ProtectedRoute>
            } />
            <Route path="/medications/:id/edit" element={
              <ProtectedRoute>
                <EditMedication />
              </ProtectedRoute>
            } />
            <Route path="/schedule" element={
              <ProtectedRoute>
                <Schedule />
              </ProtectedRoute>
            } />
            <Route path="/vitals" element={
              <ProtectedRoute>
                <Vitals />
              </ProtectedRoute>
            } />
            <Route path="/care-circle" element={
              <ProtectedRoute>
                <CareCircle />
              </ProtectedRoute>
            } />
            <Route path="/health-vault" element={
              <ProtectedRoute>
                <HealthVault />
              </ProtectedRoute>
            } />
            <Route path="/messages" element={
              <ProtectedRoute>
                <Messages />
              </ProtectedRoute>
            } />
            <Route path="/family" element={
              <ProtectedRoute>
                <FamilyDashboard />
              </ProtectedRoute>
            } />
            <Route path="/family/:memberId" element={
              <ProtectedRoute>
                <FamilyMemberDetail />
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="/guidance" element={
              <ProtectedRoute>
                <PatientGuidance />
              </ProtectedRoute>
            } />
            <Route path="/adherence-report" element={
              <ProtectedRoute>
                <AdherenceReport />
              </ProtectedRoute>
            } />
            <Route path="/knowledge-base" element={
              <ProtectedRoute>
                <KnowledgeBase />
              </ProtectedRoute>
            } />
            <Route path="/knowledge-base/:topicSlug" element={
              <ProtectedRoute>
                <KnowledgeBaseTopic />
              </ProtectedRoute>
            } />
            <Route path="/medication-info/:drugName" element={
              <ProtectedRoute>
                <MedicationInfo />
              </ProtectedRoute>
            } />
            <Route path="/subscription-success" element={
              <ProtectedRoute>
                <SubscriptionSuccess />
              </ProtectedRoute>
            } />
            {/* Internal/unlisted pages */}
            <Route path="/ehr-comparison" element={
              <ProtectedRoute>
                <EHRComparison />
              </ProtectedRoute>
            } />
            <Route path="/admin/import" element={
              <ProtectedRoute>
                <AdminImport />
              </ProtectedRoute>
            } />
            <Route path="/admin/changelog" element={
              <ProtectedRoute>
                <AdminChangelog />
              </ProtectedRoute>
            } />
            {/* Public marketing + install routes */}
            <Route path="/for-clinicians" element={<ForClinicians />} />
            <Route path="/install" element={<Install />} />
            {/* Clinician pricing now lives at /pricing?audience=clinicians */}
            <Route path="/clinician/pricing" element={<Navigate to="/pricing?audience=clinicians" replace />} />
            <Route path="/clinician/why-onecare" element={<ClinicianWhyOneCare />} />
            <Route path="/clinician/patients/:inviteCode" element={
              <ProtectedRoute>
                <ClinicianPatientDetail />
              </ProtectedRoute>
            } />
            <Route path="/clinician/enterprise-inquiry" element={
              <ProtectedRoute>
                <EnterpriseInquiry />
              </ProtectedRoute>
            } />
            <Route path="/clinician/baa" element={
              <ProtectedRoute>
                <ClinicianBAA />
              </ProtectedRoute>
            } />
            <Route path="/clinician/subscription-success" element={
              <ProtectedRoute>
                <ClinicianSubscriptionSuccess />
              </ProtectedRoute>
            } />
            <Route path="/assist" element={
              <ProtectedRoute>
                <Assist />
              </ProtectedRoute>
            } />
            <Route path="/clinician/dictations" element={
              <ProtectedRoute>
                <ClinicianDictations />
              </ProtectedRoute>
            } />
            <Route path="/clinician/templates" element={
              <ProtectedRoute>
                <ClinicianTemplates />
              </ProtectedRoute>
            } />
            <Route path="/clinician/audit" element={
              <ProtectedRoute>
                <ClinicianAudit />
              </ProtectedRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
          <CookieConsentBanner />
          <FabStack>
            <PatientAIChatMount />
            <BugReportButton />
          </FabStack>
        </BrowserRouter>
        </FamilyProvider>
      </AuthProvider>
    </TooltipProvider>
  </ThemeProvider>
  </QueryClientProvider>
);

export default App;
