// Mock data for Marpe demo
import { Medication, ScheduleEntry, Vital, Interaction, ProviderShare, HealthProfile } from "@/types/health";

export const mockMedications: Medication[] = [
  {
    id: "1",
    name: "Metformin",
    genericName: "Metformin Hydrochloride",
    brandName: "Glucophage",
    rxcui: "860975",
    type: "prescription",
    dosage: "500mg",
    frequency: "twice_daily",
    timeOfDay: ["09:00", "21:00"],
    notes: "Take with meals",
    isActive: true,
    createdAt: "2024-01-15",
  },
  {
    id: "2",
    name: "Lisinopril",
    genericName: "Lisinopril",
    brandName: "Zestril",
    rxcui: "314076",
    type: "prescription",
    dosage: "10mg",
    frequency: "once_daily",
    timeOfDay: ["09:00"],
    notes: "Monitor blood pressure",
    isActive: true,
    createdAt: "2024-01-15",
  },
  {
    id: "3",
    name: "Vitamin D3",
    type: "vitamin",
    dosage: "2000 IU",
    frequency: "once_daily",
    timeOfDay: ["09:00"],
    isActive: true,
    createdAt: "2024-02-01",
  },
  {
    id: "4",
    name: "Omega-3 Fish Oil",
    type: "supplement",
    dosage: "1000mg",
    frequency: "twice_daily",
    timeOfDay: ["09:00", "21:00"],
    notes: "Take with food",
    isActive: true,
    createdAt: "2024-02-01",
  },
];

export const mockScheduleEntries: ScheduleEntry[] = [
  {
    id: "1",
    medicationId: "1",
    scheduledTime: "09:00",
    scheduledDate: new Date().toISOString().split("T")[0],
    status: "taken",
    takenAt: new Date().toISOString(),
  },
  {
    id: "2",
    medicationId: "2",
    scheduledTime: "09:00",
    scheduledDate: new Date().toISOString().split("T")[0],
    status: "taken",
    takenAt: new Date().toISOString(),
  },
  {
    id: "3",
    medicationId: "3",
    scheduledTime: "09:00",
    scheduledDate: new Date().toISOString().split("T")[0],
    status: "pending",
  },
  {
    id: "4",
    medicationId: "4",
    scheduledTime: "09:00",
    scheduledDate: new Date().toISOString().split("T")[0],
    status: "pending",
  },
  {
    id: "5",
    medicationId: "1",
    scheduledTime: "21:00",
    scheduledDate: new Date().toISOString().split("T")[0],
    status: "pending",
  },
  {
    id: "6",
    medicationId: "4",
    scheduledTime: "21:00",
    scheduledDate: new Date().toISOString().split("T")[0],
    status: "pending",
  },
];

export const mockVitals: Vital[] = [
  {
    id: "1",
    type: "blood_pressure",
    value: "120/80",
    valueNumeric: 120,
    valueSecondary: 80,
    unit: "mmHg",
    recordedAt: new Date().toISOString(),
  },
  { id: "2", type: "heart_rate", value: "72", valueNumeric: 72, unit: "bpm", recordedAt: new Date().toISOString() },
  { id: "3", type: "glucose", value: "95", valueNumeric: 95, unit: "mg/dL", recordedAt: new Date().toISOString() },
  { id: "4", type: "weight", value: "75", valueNumeric: 75, unit: "kg", recordedAt: new Date().toISOString() },
];

export const mockInteractions: Interaction[] = [
  {
    id: "1",
    medication1: "Metformin",
    medication2: "Lisinopril",
    severity: "low",
    description: "Lisinopril may slightly enhance the blood glucose-lowering effect of Metformin.",
    recommendation: "Monitor blood glucose levels. Usually no action needed.",
  },
];

export const mockProviderShares: ProviderShare[] = [
  {
    id: "1",
    providerName: "Dr. Sarah Chen",
    providerEmail: "dr.chen@hospital.com",
    inviteCode: "abc123xyz",
    permissions: { vitals: true, meds: true, adherence: true, profile: false },
    isActive: true,
    lastAccessedAt: "2024-01-20T10:30:00Z",
    createdAt: "2024-01-15",
  },
];

export const mockHealthProfile: HealthProfile = {
  dateOfBirth: "1985-06-15",
  bloodType: "O+",
  gender: "Male",
  height: 175,
  allergies: ["Penicillin", "Shellfish"],
  healthConditions: ["Type 2 Diabetes", "Hypertension"],
};

export const mockUserProfile = {
  name: "John Doe",
  email: "john.doe@example.com",
  phoneNumber: "+1 555-123-4567",
  emergencyContactName: "Jane Doe",
  emergencyNumber: "+1 555-987-6543",
  location: "New York, NY",
};

// Dashboard stats
export const mockDashboardStats = {
  adherenceRate: 87,
  dailyDoses: 6,
  healthMarkers: 4,
  activeProviders: 1,
};
