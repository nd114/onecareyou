import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
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
import ClinicianSettings from "./pages/ClinicianSettings";
import FamilyDashboard from "./pages/FamilyDashboard";
import FamilyMemberDetail from "./pages/FamilyMemberDetail";
import Onboarding from "./pages/Onboarding";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/sign-up" element={<SignUp />} />
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
            <Route path="/clinician/patient/:inviteCode" element={<ClinicianPortal />} />
            <Route path="/clinician/dashboard" element={
              <ProtectedRoute>
                <ClinicianDashboard />
              </ProtectedRoute>
            } />
            <Route path="/clinician/settings" element={
              <ProtectedRoute>
                <ClinicianSettings />
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
