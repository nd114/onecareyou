export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      alert_logs: {
        Row: {
          acknowledged_at: string | null
          alert_type: string
          clinician_user_id: string
          created_at: string
          id: string
          message: string | null
          patient_user_id: string
          rule_id: string | null
          sent_at: string
          vital_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          alert_type: string
          clinician_user_id: string
          created_at?: string
          id?: string
          message?: string | null
          patient_user_id: string
          rule_id?: string | null
          sent_at?: string
          vital_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          alert_type?: string
          clinician_user_id?: string
          created_at?: string
          id?: string
          message?: string | null
          patient_user_id?: string
          rule_id?: string | null
          sent_at?: string
          vital_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "clinician_alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_logs_vital_id_fkey"
            columns: ["vital_id"]
            isOneToOne: false
            referencedRelation: "vitals"
            referencedColumns: ["id"]
          },
        ]
      }
      care_alert_logs: {
        Row: {
          id: string
          message: string | null
          missed_count: number
          recipient_email: string
          sent_at: string
          setting_id: string
          user_id: string
        }
        Insert: {
          id?: string
          message?: string | null
          missed_count: number
          recipient_email: string
          sent_at?: string
          setting_id: string
          user_id: string
        }
        Update: {
          id?: string
          message?: string | null
          missed_count?: number
          recipient_email?: string
          sent_at?: string
          setting_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_alert_logs_setting_id_fkey"
            columns: ["setting_id"]
            isOneToOne: false
            referencedRelation: "care_alert_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      care_alert_settings: {
        Row: {
          alert_recipient_email: string
          alert_recipient_name: string
          created_at: string
          family_member_id: string | null
          id: string
          is_active: boolean | null
          last_alert_sent_at: string | null
          missed_dose_threshold: number
          notify_by_email: boolean | null
          notify_by_push: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_recipient_email: string
          alert_recipient_name: string
          created_at?: string
          family_member_id?: string | null
          id?: string
          is_active?: boolean | null
          last_alert_sent_at?: string | null
          missed_dose_threshold?: number
          notify_by_email?: boolean | null
          notify_by_push?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_recipient_email?: string
          alert_recipient_name?: string
          created_at?: string
          family_member_id?: string | null
          id?: string
          is_active?: boolean | null
          last_alert_sent_at?: string | null
          missed_dose_threshold?: number
          notify_by_email?: boolean | null
          notify_by_push?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_alert_settings_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_access: {
        Row: {
          caregiver_user_id: string
          created_at: string
          family_member_id: string
          granted_by: string
          id: string
          permissions: Json
        }
        Insert: {
          caregiver_user_id: string
          created_at?: string
          family_member_id: string
          granted_by: string
          id?: string
          permissions?: Json
        }
        Update: {
          caregiver_user_id?: string
          created_at?: string
          family_member_id?: string
          granted_by?: string
          id?: string
          permissions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_access_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      clinician_alert_rules: {
        Row: {
          alert_method: string | null
          clinician_user_id: string
          condition: string
          created_at: string
          id: string
          is_active: boolean | null
          patient_user_id: string
          share_id: string | null
          threshold_secondary: number | null
          threshold_value: number
          updated_at: string
          vital_type: string
        }
        Insert: {
          alert_method?: string | null
          clinician_user_id: string
          condition: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          patient_user_id: string
          share_id?: string | null
          threshold_secondary?: number | null
          threshold_value: number
          updated_at?: string
          vital_type: string
        }
        Update: {
          alert_method?: string | null
          clinician_user_id?: string
          condition?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          patient_user_id?: string
          share_id?: string | null
          threshold_secondary?: number | null
          threshold_value?: number
          updated_at?: string
          vital_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinician_alert_rules_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "provider_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      clinician_guidance: {
        Row: {
          acknowledged_at: string | null
          auto_resend_enabled: boolean | null
          category: string | null
          clinician_user_id: string
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          instruction: string
          last_resent_at: string | null
          patient_user_id: string
          priority: string | null
          resend_interval_hours: number | null
          share_id: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          auto_resend_enabled?: boolean | null
          category?: string | null
          clinician_user_id: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          instruction: string
          last_resent_at?: string | null
          patient_user_id: string
          priority?: string | null
          resend_interval_hours?: number | null
          share_id?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          auto_resend_enabled?: boolean | null
          category?: string | null
          clinician_user_id?: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          instruction?: string
          last_resent_at?: string | null
          patient_user_id?: string
          priority?: string | null
          resend_interval_hours?: number | null
          share_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinician_guidance_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "provider_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      clinician_profiles: {
        Row: {
          country: string | null
          created_at: string
          email_notifications_enabled: boolean | null
          id: string
          is_verified: boolean | null
          license_number: string | null
          practice_name: string | null
          push_notifications_enabled: boolean | null
          push_subscription: Json | null
          specialty: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          email_notifications_enabled?: boolean | null
          id?: string
          is_verified?: boolean | null
          license_number?: string | null
          practice_name?: string | null
          push_notifications_enabled?: boolean | null
          push_subscription?: Json | null
          specialty?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          email_notifications_enabled?: boolean | null
          id?: string
          is_verified?: boolean | null
          license_number?: string | null
          practice_name?: string | null
          push_notifications_enabled?: boolean | null
          push_subscription?: Json | null
          specialty?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      consent_logs: {
        Row: {
          action: string
          consent_type: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_value: boolean | null
          previous_value: boolean | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          consent_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: boolean | null
          previous_value?: boolean | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          consent_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: boolean | null
          previous_value?: boolean | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      emergency_numbers: {
        Row: {
          ambulance_number: string | null
          country_code: string
          country_name: string
          created_at: string
          emergency_number: string
          fire_number: string | null
          id: string
          notes: string | null
          police_number: string | null
        }
        Insert: {
          ambulance_number?: string | null
          country_code: string
          country_name: string
          created_at?: string
          emergency_number: string
          fire_number?: string | null
          id?: string
          notes?: string | null
          police_number?: string | null
        }
        Update: {
          ambulance_number?: string | null
          country_code?: string
          country_name?: string
          created_at?: string
          emergency_number?: string
          fire_number?: string | null
          id?: string
          notes?: string | null
          police_number?: string | null
        }
        Relationships: []
      }
      family_members: {
        Row: {
          allergies: Json | null
          avatar_color: string | null
          blood_type: string | null
          created_at: string
          date_of_birth: string | null
          gender: string | null
          health_conditions: Json | null
          height: number | null
          id: string
          is_active: boolean | null
          name: string
          owner_user_id: string
          relationship: string | null
          updated_at: string
        }
        Insert: {
          allergies?: Json | null
          avatar_color?: string | null
          blood_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          gender?: string | null
          health_conditions?: Json | null
          height?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          owner_user_id: string
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          allergies?: Json | null
          avatar_color?: string | null
          blood_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          gender?: string | null
          health_conditions?: Json | null
          height?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          owner_user_id?: string
          relationship?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          document_id: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_id: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_id?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          content: string
          created_at: string
          effective_date: string
          id: string
          is_current: boolean | null
          type: string
          version: string
        }
        Insert: {
          content: string
          created_at?: string
          effective_date: string
          id?: string
          is_current?: boolean | null
          type: string
          version: string
        }
        Update: {
          content?: string
          created_at?: string
          effective_date?: string
          id?: string
          is_current?: boolean | null
          type?: string
          version?: string
        }
        Relationships: []
      }
      medication_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          is_primary: boolean | null
          medication_id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean | null
          medication_id: string
          storage_path: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean | null
          medication_id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_photos_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          created_at: string
          discontinuation_reason: string | null
          discontinued_at: string | null
          dosage: string
          end_date: string | null
          family_member_id: string | null
          frequency: string
          id: string
          instructions: string | null
          is_active: boolean
          name: string
          pharmacy: string | null
          prescriber: string | null
          quantity: number | null
          refill_date: string | null
          start_date: string
          times_of_day: Json | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discontinuation_reason?: string | null
          discontinued_at?: string | null
          dosage: string
          end_date?: string | null
          family_member_id?: string | null
          frequency: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          name: string
          pharmacy?: string | null
          prescriber?: string | null
          quantity?: number | null
          refill_date?: string | null
          start_date?: string
          times_of_day?: Json | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          discontinuation_reason?: string | null
          discontinued_at?: string | null
          dosage?: string
          end_date?: string | null
          family_member_id?: string | null
          frequency?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          name?: string
          pharmacy?: string | null
          prescriber?: string | null
          quantity?: number | null
          refill_date?: string | null
          start_date?: string
          times_of_day?: Json | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          ai_consent_updated_at: string | null
          ai_processing_consent: boolean | null
          allergies: Json | null
          bio: string | null
          blood_type: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          email_notifications_enabled: boolean | null
          emergency_contact_name: string | null
          emergency_number: string | null
          gender: string | null
          health_conditions: Json | null
          height: number | null
          id: string
          location: string | null
          name: string | null
          onboarding_completed: boolean | null
          phone_number: string | null
          push_notifications_enabled: boolean | null
          push_subscription: Json | null
          subscription_tier: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string
          weekly_adherence_report_enabled: boolean | null
        }
        Insert: {
          address?: string | null
          ai_consent_updated_at?: string | null
          ai_processing_consent?: boolean | null
          allergies?: Json | null
          bio?: string | null
          blood_type?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          email_notifications_enabled?: boolean | null
          emergency_contact_name?: string | null
          emergency_number?: string | null
          gender?: string | null
          health_conditions?: Json | null
          height?: number | null
          id?: string
          location?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          push_notifications_enabled?: boolean | null
          push_subscription?: Json | null
          subscription_tier?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
          weekly_adherence_report_enabled?: boolean | null
        }
        Update: {
          address?: string | null
          ai_consent_updated_at?: string | null
          ai_processing_consent?: boolean | null
          allergies?: Json | null
          bio?: string | null
          blood_type?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          email_notifications_enabled?: boolean | null
          emergency_contact_name?: string | null
          emergency_number?: string | null
          gender?: string | null
          health_conditions?: Json | null
          height?: number | null
          id?: string
          location?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          push_notifications_enabled?: boolean | null
          push_subscription?: Json | null
          subscription_tier?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
          weekly_adherence_report_enabled?: boolean | null
        }
        Relationships: []
      }
      provider_shares: {
        Row: {
          clinician_notes: string | null
          clinician_user_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          invite_code: string
          is_active: boolean
          last_accessed_at: string | null
          permissions: Json
          provider_email: string | null
          provider_name: string
          user_id: string
        }
        Insert: {
          clinician_notes?: string | null
          clinician_user_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invite_code: string
          is_active?: boolean
          last_accessed_at?: string | null
          permissions?: Json
          provider_email?: string | null
          provider_name: string
          user_id: string
        }
        Update: {
          clinician_notes?: string | null
          clinician_user_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invite_code?: string
          is_active?: boolean
          last_accessed_at?: string | null
          permissions?: Json
          provider_email?: string | null
          provider_name?: string
          user_id?: string
        }
        Relationships: []
      }
      schedule_entries: {
        Row: {
          created_at: string
          family_member_id: string | null
          id: string
          medication_id: string
          notes: string | null
          scheduled_time: string
          skipped_reason: string | null
          status: string
          taken_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          family_member_id?: string | null
          id?: string
          medication_id: string
          notes?: string | null
          scheduled_time: string
          skipped_reason?: string | null
          status?: string
          taken_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          family_member_id?: string | null
          id?: string
          medication_id?: string
          notes?: string | null
          scheduled_time?: string
          skipped_reason?: string | null
          status?: string
          taken_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_entries_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      vitals: {
        Row: {
          created_at: string
          family_member_id: string | null
          id: string
          notes: string | null
          recorded_at: string
          secondary_value: number | null
          type: string
          unit: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          family_member_id?: string | null
          id?: string
          notes?: string | null
          recorded_at?: string
          secondary_value?: number | null
          type: string
          unit: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          family_member_id?: string | null
          id?: string
          notes?: string | null
          recorded_at?: string
          secondary_value?: number | null
          type?: string
          unit?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "vitals_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_current_user_email: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
