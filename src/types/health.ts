// Marpe Type Definitions

export type MedicationType = "prescription" | "otc" | "vitamin" | "supplement" | "herbal";

export type ScheduleStatus = "pending" | "taken" | "skipped" | "missed";

export type VitalType =
  | "weight"
  | "blood_pressure"
  | "heart_rate"
  | "oxygen_saturation"
  | "temperature"
  | "glucose"
  | "hba1c"
  | "urea"
  | "creatinine"
  | "gfr"
  | "cholesterol_total"
  | "ldl"
  | "hdl"
  | "alt"
  | "ast"
  | "hemoglobin"
  | "wbc"
  | "potassium"
  | "sodium";

export type InteractionSeverity = "high" | "moderate" | "low";

export interface Medication {
  id: string;
  name: string;
  genericName?: string;
  brandName?: string;
  rxcui?: string;
  type: MedicationType;
  dosage: string;
  frequency: string;
  timeOfDay: string[];
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export interface ScheduleEntry {
  id: string;
  medicationId: string;
  medication?: Medication;
  scheduledTime: string;
  scheduledDate: string;
  status: ScheduleStatus;
  takenAt?: string;
  notes?: string;
}

export interface Vital {
  id: string;
  type: VitalType;
  value: string;
  valueNumeric: number;
  valueSecondary?: number;
  unit: string;
  recordedAt: string;
  notes?: string;
}

export interface HealthProfile {
  dateOfBirth?: string;
  bloodType?: string;
  gender?: string;
  height?: number;
  allergies: string[];
  healthConditions: string[];
}

export interface UserProfile {
  name: string;
  email: string;
  phoneNumber?: string;
  emergencyNumber?: string;
  emergencyContactName?: string;
  location?: string;
  address?: string;
  bio?: string;
}

export interface Interaction {
  id: string;
  medication1: string;
  medication2: string;
  severity: InteractionSeverity;
  description: string;
  recommendation: string;
}

export interface ProviderShare {
  id: string;
  providerName: string;
  providerEmail?: string;
  inviteCode: string;
  permissions: {
    vitals: boolean;
    meds: boolean;
    adherence: boolean;
    profile: boolean;
  };
  isActive: boolean;
  lastAccessedAt?: string;
  createdAt: string;
}

// Vital configuration with normal ranges
// Users can select preferred units in Settings for vitals that support multiple units
export type GlucoseUnit = "mg/dL" | "mmol/L";
export type WeightUnit = "kg" | "lbs";
export type TemperatureUnit = "°C" | "°F";

export interface UnitPreferences {
  glucose: GlucoseUnit;
  weight: WeightUnit;
  temperature: TemperatureUnit;
}

export const DEFAULT_UNIT_PREFERENCES: UnitPreferences = {
  glucose: "mg/dL",
  weight: "kg",
  temperature: "°C",
};

// Conversion functions
export const convertGlucose = (value: number, from: GlucoseUnit, to: GlucoseUnit): number => {
  if (from === to) return value;
  if (from === "mg/dL" && to === "mmol/L") return Math.round((value / 18.0182) * 10) / 10;
  if (from === "mmol/L" && to === "mg/dL") return Math.round(value * 18.0182);
  return value;
};

export const convertWeight = (value: number, from: WeightUnit, to: WeightUnit): number => {
  if (from === to) return value;
  if (from === "kg" && to === "lbs") return Math.round(value * 2.20462 * 10) / 10;
  if (from === "lbs" && to === "kg") return Math.round((value / 2.20462) * 10) / 10;
  return value;
};

export const convertTemperature = (value: number, from: TemperatureUnit, to: TemperatureUnit): number => {
  if (from === to) return value;
  if (from === "°C" && to === "°F") return Math.round(((value * 9) / 5 + 32) * 10) / 10;
  if (from === "°F" && to === "°C") return Math.round((((value - 32) * 5) / 9) * 10) / 10;
  return value;
};

export const VITAL_CONFIG: Record<
  VitalType,
  {
    label: string;
    unit: string;
    category: string;
    normalMin: number;
    normalMax: number;
    secondaryLabel?: string;
    alternativeUnits?: string[];
  }
> = {
  weight: {
    label: "Weight",
    unit: "kg",
    category: "Daily Vitals",
    normalMin: 0,
    normalMax: 999,
    alternativeUnits: ["lbs"],
  },
  blood_pressure: {
    label: "Blood Pressure",
    unit: "mmHg",
    category: "Daily Vitals",
    normalMin: 90,
    normalMax: 120,
    secondaryLabel: "Diastolic",
  },
  heart_rate: { label: "Heart Rate", unit: "bpm", category: "Daily Vitals", normalMin: 60, normalMax: 100 },
  oxygen_saturation: { label: "SpO₂", unit: "%", category: "Daily Vitals", normalMin: 95, normalMax: 100 },
  temperature: {
    label: "Temperature",
    unit: "°C",
    category: "Daily Vitals",
    normalMin: 36.1,
    normalMax: 37.2,
    alternativeUnits: ["°F"],
  },
  glucose: {
    label: "Blood Glucose",
    unit: "mg/dL",
    category: "Sugar",
    normalMin: 70,
    normalMax: 100,
    alternativeUnits: ["mmol/L"],
  },
  hba1c: { label: "HbA1c", unit: "%", category: "Sugar", normalMin: 4, normalMax: 5.6 },
  urea: { label: "Urea", unit: "mg/dL", category: "Kidneys", normalMin: 7, normalMax: 20 },
  creatinine: { label: "Creatinine", unit: "mg/dL", category: "Kidneys", normalMin: 0.6, normalMax: 1.3 },
  gfr: { label: "GFR", unit: "mL/min", category: "Kidneys", normalMin: 90, normalMax: 150 },
  cholesterol_total: { label: "Total Cholesterol", unit: "mg/dL", category: "Heart", normalMin: 125, normalMax: 200 },
  ldl: { label: "LDL", unit: "mg/dL", category: "Heart", normalMin: 0, normalMax: 100 },
  hdl: { label: "HDL", unit: "mg/dL", category: "Heart", normalMin: 40, normalMax: 60 },
  alt: { label: "ALT", unit: "U/L", category: "Liver", normalMin: 7, normalMax: 55 },
  ast: { label: "AST", unit: "U/L", category: "Liver", normalMin: 8, normalMax: 48 },
  hemoglobin: { label: "Hemoglobin", unit: "g/dL", category: "Blood", normalMin: 13.5, normalMax: 17.5 },
  wbc: { label: "WBC", unit: "x10³/µL", category: "Blood", normalMin: 4.5, normalMax: 11 },
  potassium: { label: "Potassium", unit: "mmol/L", category: "Minerals", normalMin: 3.6, normalMax: 5.2 },
  sodium: { label: "Sodium", unit: "mmol/L", category: "Minerals", normalMin: 135, normalMax: 145 },
};

export const MEDICATION_FREQUENCIES = [
  { value: "once_daily", label: "Once daily", timesPerDay: 1, defaultTimes: ["09:00"] },
  { value: "twice_daily", label: "Twice daily", timesPerDay: 2, defaultTimes: ["09:00", "21:00"] },
  { value: "three_times_daily", label: "Three times daily", timesPerDay: 3, defaultTimes: ["09:00", "15:00", "21:00"] },
  {
    value: "four_times_daily",
    label: "Four times daily",
    timesPerDay: 4,
    defaultTimes: ["09:00", "13:00", "17:00", "21:00"],
  },
  {
    value: "every_4_hours",
    label: "Every 4 hours",
    timesPerDay: 6,
    defaultTimes: ["06:00", "10:00", "14:00", "18:00", "22:00", "02:00"],
  },
  {
    value: "every_6_hours",
    label: "Every 6 hours",
    timesPerDay: 4,
    defaultTimes: ["06:00", "12:00", "18:00", "00:00"],
  },
  { value: "every_8_hours", label: "Every 8 hours", timesPerDay: 3, defaultTimes: ["08:00", "16:00", "00:00"] },
  { value: "every_12_hours", label: "Every 12 hours", timesPerDay: 2, defaultTimes: ["09:00", "21:00"] },
  { value: "every_other_day", label: "Every other day", timesPerDay: 1, defaultTimes: ["09:00"] },
  { value: "weekly", label: "Weekly", timesPerDay: 1, defaultTimes: ["09:00"] },
  { value: "as_needed", label: "As needed", timesPerDay: 0, defaultTimes: [] },
];

export const COMMON_ALLERGIES = [
  "Penicillin",
  "Sulfa drugs",
  "Aspirin",
  "Ibuprofen",
  "Latex",
  "Peanuts",
  "Shellfish",
  "Eggs",
];

export const COMMON_CONDITIONS = [
  "Hypertension",
  "Type 2 Diabetes",
  "High Cholesterol",
  "Arthritis",
  "Asthma",
  "Heart Disease",
  "Kidney Disease",
  "Liver Disease",
  "Thyroid Disorder",
];

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export const MEDICATION_TYPE_COLORS: Record<MedicationType, string> = {
  prescription: "bg-ocean text-primary-foreground",
  otc: "bg-emerald text-primary-foreground",
  vitamin: "bg-amber text-primary-foreground",
  supplement: "bg-indigo text-primary-foreground",
  herbal: "bg-status-success text-primary-foreground",
};
