import type { Database, Json } from "./types";

/**
 * Types for tables and functions the generated `types.ts` has not seen yet.
 *
 * `types.ts` and `client.ts` are regenerated from the live database and must
 * not be hand-edited, so anything added by a migration that has not been
 * deployed-and-regenerated has no type at all. The habit that grew around
 * that was `(supabase as any).from('new_table')`, which switches off checking
 * for the whole statement — and one of those casts was hiding a write that
 * could never have succeeded.
 *
 * This is the same information written by hand, taken from the migrations
 * rather than from memory, so those call sites get checked in the meantime.
 *
 * **Retiring this file:** once the migrations below are deployed and
 * `types.ts` is regenerated, every table here will exist in the generated
 * types. Then swap `supabaseExtra` back to `supabase` at the call sites and
 * delete this file and `db.ts`. Nothing else depends on them.
 *
 * Only what the generated types genuinely lack belongs here. Every signature
 * below was read back out of its migration — a hand-written type that is
 * wrong is worse than a cast, because it is confidently wrong. Three
 * functions were removed from this file for exactly that reason: they were
 * already generated, and the versions written from memory had the wrong
 * argument names.
 *
 * Covered migrations:
 *   20260902100000_fhir_appointments
 *   20260902120000_fhir_invoices
 *   20260902140000_signed_notes_are_final
 *   20260902150000_ai_messages_in_the_record
 *   20260902160000_fhir_care_plans
 *   20260902180000_non_clinical_staff
 *   20260903100000_contact_submissions
 */

/** Columns with a database default, or that are nullable, are optional on insert. */
type FhirAppointment = {
  Row: {
    id: string;
    practice_id: string | null;
    patient_user_id: string;
    clinician_user_id: string | null;
    department_id: string | null;
    status: string;
    start_time: string | null;
    end_time: string | null;
    description: string | null;
    visit_type: string | null;
    location_text: string | null;
    resource: Json;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    practice_id?: string | null;
    patient_user_id: string;
    clinician_user_id?: string | null;
    department_id?: string | null;
    status?: string;
    start_time?: string | null;
    end_time?: string | null;
    description?: string | null;
    visit_type?: string | null;
    location_text?: string | null;
    resource?: Json;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<FhirAppointment["Insert"]>;
  Relationships: [];
};

type FhirInvoice = {
  Row: {
    id: string;
    practice_id: string | null;
    patient_user_id: string;
    encounter_id: string | null;
    status: string;
    invoice_number: string;
    issued_at: string | null;
    due_at: string | null;
    currency: string;
    total_minor: number;
    paid_minor: number;
    platform_fee_minor: number;
    note: string | null;
    resource: Json;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    practice_id?: string | null;
    patient_user_id: string;
    encounter_id?: string | null;
    status?: string;
    invoice_number?: string;
    issued_at?: string | null;
    due_at?: string | null;
    currency?: string;
    total_minor?: number;
    paid_minor?: number;
    platform_fee_minor?: number;
    note?: string | null;
    resource?: Json;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<FhirInvoice["Insert"]>;
  Relationships: [];
};

type FhirInvoiceItem = {
  Row: {
    id: string;
    invoice_id: string;
    sequence: number;
    description: string;
    code: string | null;
    quantity: number;
    unit_price_minor: number;
    amount_minor: number;
    created_at: string;
  };
  Insert: {
    id?: string;
    invoice_id: string;
    sequence?: number;
    description: string;
    code?: string | null;
    quantity?: number;
    unit_price_minor?: number;
    amount_minor?: number;
    created_at?: string;
  };
  Update: Partial<FhirInvoiceItem["Insert"]>;
  // Declared so `select("*, items:fhir_invoice_items(*)")` resolves to the
  // child rows instead of a SelectQueryError.
  Relationships: [
    {
      foreignKeyName: "fhir_invoice_items_invoice_id_fkey";
      columns: ["invoice_id"];
      isOneToOne: false;
      referencedRelation: "fhir_invoices";
      referencedColumns: ["id"];
    },
  ];
};

type FhirCarePlan = {
  Row: {
    id: string;
    patient_user_id: string;
    practice_id: string | null;
    title: string;
    description: string | null;
    status: string;
    intent: string;
    period_start: string | null;
    period_end: string | null;
    resource: Json;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    patient_user_id: string;
    practice_id?: string | null;
    title: string;
    description?: string | null;
    status?: string;
    intent?: string;
    period_start?: string | null;
    period_end?: string | null;
    resource?: Json;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<FhirCarePlan["Insert"]>;
  Relationships: [];
};

type FhirCareGoal = {
  Row: {
    id: string;
    care_plan_id: string;
    description: string;
    measure_type: string | null;
    target_comparator: string | null;
    target_value: number | null;
    target_unit: string | null;
    due_date: string | null;
    achievement_status: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    care_plan_id: string;
    description: string;
    measure_type?: string | null;
    target_comparator?: string | null;
    target_value?: number | null;
    target_unit?: string | null;
    due_date?: string | null;
    achievement_status?: string;
    sort_order?: number;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<FhirCareGoal["Insert"]>;
  Relationships: [
    {
      foreignKeyName: "fhir_care_goals_care_plan_id_fkey";
      columns: ["care_plan_id"];
      isOneToOne: false;
      referencedRelation: "fhir_care_plans";
      referencedColumns: ["id"];
    },
  ];
};

type EncounterAddendum = {
  Row: {
    id: string;
    encounter_id: string;
    author_user_id: string;
    body: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    encounter_id: string;
    author_user_id: string;
    body: string;
    created_at?: string;
  };
  Update: Partial<EncounterAddendum["Insert"]>;
  Relationships: [];
};

type ContactSubmission = {
  Row: {
    id: string;
    submitted_by: string | null;
    contact_name: string;
    contact_email: string;
    inquiry_type: string;
    subject: string;
    message: string;
    status: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    submitted_by?: string | null;
    contact_name: string;
    contact_email: string;
    inquiry_type?: string;
    subject: string;
    message: string;
    status?: string;
    notes?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<ContactSubmission["Insert"]>;
  Relationships: [];
};

/**
 * `practices` already exists in the generated types; it is only missing the
 * column 20260902130000_tenant_currency adds. Derived from the generated shape
 * rather than restated, so it stays correct as that shape changes, and becomes
 * a no-op intersection once the column is generated.
 */
type GeneratedPractices = Database["public"]["Tables"]["practices"];
type PracticesWithCurrency = {
  Row: GeneratedPractices["Row"] & { default_currency: string };
  Insert: GeneratedPractices["Insert"] & { default_currency?: string };
  Update: GeneratedPractices["Update"] & { default_currency?: string };
  Relationships: GeneratedPractices["Relationships"];
};

export type ExtraDatabase = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: {
      fhir_appointments: FhirAppointment;
      fhir_invoices: FhirInvoice;
      fhir_invoice_items: FhirInvoiceItem;
      fhir_care_plans: FhirCarePlan;
      fhir_care_goals: FhirCareGoal;
      encounter_addenda: EncounterAddendum;
      contact_submissions: ContactSubmission;
      practices: PracticesWithCurrency;
    };
    Views: Record<never, never>;
    Functions: {
      /**
       * Assistant messages filed against a patient's record.
       * Signature checked against 20260902150000_ai_messages_in_the_record.
       */
      ai_messages_about_patient: {
        Args: { _patient_user_id: string };
        Returns: {
          id: string;
          conversation_id: string;
          role: string;
          content: string;
          created_at: string;
        }[];
      };
      /**
       * Addenda on visit summaries the caller is allowed to see. Takes no
       * arguments — it scopes itself from auth.uid().
       * Signature checked against 20260902140000_signed_notes_are_final.
       */
      my_visit_summary_addenda: {
        Args: Record<never, never>;
        Returns: {
          id: string;
          encounter_id: string;
          body: string;
          created_at: string;
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

/**
 * Row shapes for the mappers, so a projection built in `src/lib/fhir` is
 * checked against the columns it is meant to fill instead of being typed as
 * a bag of unknowns.
 */
export type FhirAppointmentInsert = FhirAppointment["Insert"];
export type FhirAppointmentUpdate = FhirAppointment["Update"];
export type FhirInvoiceInsert = FhirInvoice["Insert"];
export type FhirInvoiceItemInsert = FhirInvoiceItem["Insert"];
export type FhirCarePlanInsert = FhirCarePlan["Insert"];
export type FhirCareGoalInsert = FhirCareGoal["Insert"];
export type EncounterAddendumInsert = EncounterAddendum["Insert"];
