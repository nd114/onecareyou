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
      access_audit_logs: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          share_id: string | null
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          share_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          share_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_audit_logs_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "provider_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          message_count: number
          metadata: Json
          source: string
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          message_count?: number
          metadata?: Json
          source?: string
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          message_count?: number
          metadata?: Json
          source?: string
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          audio_path: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          image_path: string | null
          input_modality: string
          metadata: Json
          role: string
          user_id: string
        }
        Insert: {
          audio_path?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          image_path?: string | null
          input_modality?: string
          metadata?: Json
          role: string
          user_id: string
        }
        Update: {
          audio_path?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          image_path?: string | null
          input_modality?: string
          metadata?: Json
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
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
      baa_agreements: {
        Row: {
          agreement_version: string
          clinician_user_id: string
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          id: string
          ip_address: string | null
          practice_address: string | null
          practice_name: string
          practice_npi: string | null
          signed_at: string
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          agreement_version?: string
          clinician_user_id: string
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          practice_address?: string | null
          practice_name: string
          practice_npi?: string | null
          signed_at?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          agreement_version?: string
          clinician_user_id?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          practice_address?: string | null
          practice_name?: string
          practice_npi?: string | null
          signed_at?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      beta_bug_reports: {
        Row: {
          browser_info: Json | null
          category: string
          created_at: string
          description: string
          id: string
          page_url: string
          status: string
          user_id: string | null
        }
        Insert: {
          browser_info?: Json | null
          category?: string
          created_at?: string
          description: string
          id?: string
          page_url: string
          status?: string
          user_id?: string | null
        }
        Update: {
          browser_info?: Json | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          page_url?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
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
      clinician_dictations: {
        Row: {
          audio_path: string
          bulk_approved: boolean
          clinician_user_id: string
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          id: string
          metadata: Json
          patient_label: string | null
          patient_user_id: string | null
          status: string
          summary: string | null
          summary_approved_at: string | null
          summary_approved_by: string | null
          transcript: string | null
          transcript_approved_at: string | null
          transcript_approved_by: string | null
          updated_at: string
        }
        Insert: {
          audio_path: string
          bulk_approved?: boolean
          clinician_user_id: string
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          patient_label?: string | null
          patient_user_id?: string | null
          status?: string
          summary?: string | null
          summary_approved_at?: string | null
          summary_approved_by?: string | null
          transcript?: string | null
          transcript_approved_at?: string | null
          transcript_approved_by?: string | null
          updated_at?: string
        }
        Update: {
          audio_path?: string
          bulk_approved?: boolean
          clinician_user_id?: string
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          patient_label?: string | null
          patient_user_id?: string | null
          status?: string
          summary?: string | null
          summary_approved_at?: string | null
          summary_approved_by?: string | null
          transcript?: string | null
          transcript_approved_at?: string | null
          transcript_approved_by?: string | null
          updated_at?: string
        }
        Relationships: []
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
      clinician_guidance_notifications: {
        Row: {
          clinician_user_id: string
          created_at: string
          guidance_id: string
          id: string
          is_read: boolean
          notification_type: string
          patient_user_id: string
        }
        Insert: {
          clinician_user_id: string
          created_at?: string
          guidance_id: string
          id?: string
          is_read?: boolean
          notification_type: string
          patient_user_id: string
        }
        Update: {
          clinician_user_id?: string
          created_at?: string
          guidance_id?: string
          id?: string
          is_read?: boolean
          notification_type?: string
          patient_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinician_guidance_notifications_guidance_id_fkey"
            columns: ["guidance_id"]
            isOneToOne: false
            referencedRelation: "clinician_guidance"
            referencedColumns: ["id"]
          },
        ]
      }
      clinician_patient_records: {
        Row: {
          allergies: Json | null
          blood_type: string | null
          clinician_data_consent_given_at: string | null
          clinician_user_id: string
          created_at: string
          data_sharing_model: string
          date_of_birth: string | null
          gender: string | null
          health_conditions: Json | null
          id: string
          import_source: string
          invitation_status: string
          linked_user_id: string | null
          medications: Json | null
          notes: string | null
          patient_data_consent_given_at: string | null
          patient_email: string | null
          patient_name: string
          patient_phone: string | null
          practice_id: string | null
          provider_share_id: string | null
          tags: Json | null
          updated_at: string
          vitals_history: Json | null
        }
        Insert: {
          allergies?: Json | null
          blood_type?: string | null
          clinician_data_consent_given_at?: string | null
          clinician_user_id: string
          created_at?: string
          data_sharing_model?: string
          date_of_birth?: string | null
          gender?: string | null
          health_conditions?: Json | null
          id?: string
          import_source?: string
          invitation_status?: string
          linked_user_id?: string | null
          medications?: Json | null
          notes?: string | null
          patient_data_consent_given_at?: string | null
          patient_email?: string | null
          patient_name: string
          patient_phone?: string | null
          practice_id?: string | null
          provider_share_id?: string | null
          tags?: Json | null
          updated_at?: string
          vitals_history?: Json | null
        }
        Update: {
          allergies?: Json | null
          blood_type?: string | null
          clinician_data_consent_given_at?: string | null
          clinician_user_id?: string
          created_at?: string
          data_sharing_model?: string
          date_of_birth?: string | null
          gender?: string | null
          health_conditions?: Json | null
          id?: string
          import_source?: string
          invitation_status?: string
          linked_user_id?: string | null
          medications?: Json | null
          notes?: string | null
          patient_data_consent_given_at?: string | null
          patient_email?: string | null
          patient_name?: string
          patient_phone?: string | null
          practice_id?: string | null
          provider_share_id?: string | null
          tags?: Json | null
          updated_at?: string
          vitals_history?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "clinician_patient_records_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinician_patient_records_provider_share_id_fkey"
            columns: ["provider_share_id"]
            isOneToOne: false
            referencedRelation: "provider_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      clinician_profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          email_notifications_enabled: boolean | null
          first_name: string | null
          id: string
          is_verified: boolean | null
          last_name: string | null
          license_number: string | null
          notify_on_guidance_acknowledged: boolean | null
          notify_on_guidance_completed: boolean | null
          notify_on_guidance_expired: boolean | null
          onboarding_completed: boolean | null
          onboarding_dismissed_at: string | null
          onboarding_steps_completed: Json | null
          patient_limit: number | null
          practice_name: string | null
          push_notifications_enabled: boolean | null
          push_subscription: Json | null
          specialty: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_ends_at: string | null
          subscription_status: string | null
          subscription_tier: string | null
          team_id: string | null
          title: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          email_notifications_enabled?: boolean | null
          first_name?: string | null
          id?: string
          is_verified?: boolean | null
          last_name?: string | null
          license_number?: string | null
          notify_on_guidance_acknowledged?: boolean | null
          notify_on_guidance_completed?: boolean | null
          notify_on_guidance_expired?: boolean | null
          onboarding_completed?: boolean | null
          onboarding_dismissed_at?: string | null
          onboarding_steps_completed?: Json | null
          patient_limit?: number | null
          practice_name?: string | null
          push_notifications_enabled?: boolean | null
          push_subscription?: Json | null
          specialty?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_ends_at?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          team_id?: string | null
          title?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          email_notifications_enabled?: boolean | null
          first_name?: string | null
          id?: string
          is_verified?: boolean | null
          last_name?: string | null
          license_number?: string | null
          notify_on_guidance_acknowledged?: boolean | null
          notify_on_guidance_completed?: boolean | null
          notify_on_guidance_expired?: boolean | null
          onboarding_completed?: boolean | null
          onboarding_dismissed_at?: string | null
          onboarding_steps_completed?: Json | null
          patient_limit?: number | null
          practice_name?: string | null
          push_notifications_enabled?: boolean | null
          push_subscription?: Json | null
          specialty?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_ends_at?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          team_id?: string | null
          title?: string | null
          trial_ends_at?: string | null
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
      data_sharing_agreements: {
        Row: {
          agreed_at: string
          agreed_by: string
          clinician_record_id: string | null
          clinician_user_id: string
          created_at: string
          id: string
          is_active: boolean
          patient_user_id: string | null
          permissions: Json
          revoked_at: string | null
          revoked_by: string | null
          sharing_model: string
          terms_version: string
        }
        Insert: {
          agreed_at?: string
          agreed_by?: string
          clinician_record_id?: string | null
          clinician_user_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          patient_user_id?: string | null
          permissions?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          sharing_model?: string
          terms_version?: string
        }
        Update: {
          agreed_at?: string
          agreed_by?: string
          clinician_record_id?: string | null
          clinician_user_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          patient_user_id?: string | null
          permissions?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          sharing_model?: string
          terms_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sharing_agreements_clinician_record_id_fkey"
            columns: ["clinician_record_id"]
            isOneToOne: false
            referencedRelation: "clinician_patient_records"
            referencedColumns: ["id"]
          },
        ]
      }
      document_shares: {
        Row: {
          document_id: string
          id: string
          is_active: boolean
          provider_share_id: string
          revoked_at: string | null
          shared_at: string
          user_id: string
        }
        Insert: {
          document_id: string
          id?: string
          is_active?: boolean
          provider_share_id: string
          revoked_at?: string | null
          shared_at?: string
          user_id: string
        }
        Update: {
          document_id?: string
          id?: string
          is_active?: boolean
          provider_share_id?: string
          revoked_at?: string | null
          shared_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_shares_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "health_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_shares_provider_share_id_fkey"
            columns: ["provider_share_id"]
            isOneToOne: false
            referencedRelation: "provider_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      ehr_connections: {
        Row: {
          clinician_user_id: string
          created_at: string
          credentials_encrypted: string | null
          error_message: string | null
          fhir_base_url: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          patient_id_mapping: Json | null
          provider_name: string
          provider_type: string
          sync_status: string | null
          updated_at: string
        }
        Insert: {
          clinician_user_id: string
          created_at?: string
          credentials_encrypted?: string | null
          error_message?: string | null
          fhir_base_url?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          patient_id_mapping?: Json | null
          provider_name: string
          provider_type: string
          sync_status?: string | null
          updated_at?: string
        }
        Update: {
          clinician_user_id?: string
          created_at?: string
          credentials_encrypted?: string | null
          error_message?: string | null
          fhir_base_url?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          patient_id_mapping?: Json | null
          provider_name?: string
          provider_type?: string
          sync_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ehr_export_queue: {
        Row: {
          attempts: number | null
          connection_id: string
          created_at: string
          error_message: string | null
          exported_at: string | null
          fhir_resource_id: string | null
          id: string
          last_attempt_at: string | null
          patient_fhir_id: string
          status: string
          vital_id: string
        }
        Insert: {
          attempts?: number | null
          connection_id: string
          created_at?: string
          error_message?: string | null
          exported_at?: string | null
          fhir_resource_id?: string | null
          id?: string
          last_attempt_at?: string | null
          patient_fhir_id: string
          status?: string
          vital_id: string
        }
        Update: {
          attempts?: number | null
          connection_id?: string
          created_at?: string
          error_message?: string | null
          exported_at?: string | null
          fhir_resource_id?: string | null
          id?: string
          last_attempt_at?: string | null
          patient_fhir_id?: string
          status?: string
          vital_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ehr_export_queue_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ehr_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ehr_export_queue_vital_id_fkey"
            columns: ["vital_id"]
            isOneToOne: false
            referencedRelation: "vitals"
            referencedColumns: ["id"]
          },
        ]
      }
      ehr_sync_logs: {
        Row: {
          connection_id: string
          created_at: string
          error_details: Json | null
          id: string
          record_count: number | null
          resource_type: string
          status: string
          sync_type: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          error_details?: Json | null
          id?: string
          record_count?: number | null
          resource_type: string
          status: string
          sync_type: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          error_details?: Json | null
          id?: string
          record_count?: number | null
          resource_type?: string
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ehr_sync_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ehr_connections"
            referencedColumns: ["id"]
          },
        ]
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
      enterprise_inquiries: {
        Row: {
          clinician_user_id: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          country: string | null
          created_at: string
          ehr_system: string | null
          id: string
          notes: string | null
          practice_name: string
          practice_size: string | null
          requirements: string | null
          specialty: string | null
          status: string
          updated_at: string
        }
        Insert: {
          clinician_user_id?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          ehr_system?: string | null
          id?: string
          notes?: string | null
          practice_name: string
          practice_size?: string | null
          requirements?: string | null
          specialty?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          clinician_user_id?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          ehr_system?: string | null
          id?: string
          notes?: string | null
          practice_name?: string
          practice_size?: string | null
          requirements?: string | null
          specialty?: string | null
          status?: string
          updated_at?: string
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
      health_documents: {
        Row: {
          ai_category: string | null
          ai_summary: string | null
          ai_tags: Json | null
          category: string
          created_at: string
          document_date: string | null
          family_member_id: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          patient_friendly_explanation: string | null
          source_context: string
          tags: Json | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_category?: string | null
          ai_summary?: string | null
          ai_tags?: Json | null
          category?: string
          created_at?: string
          document_date?: string | null
          family_member_id?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          patient_friendly_explanation?: string | null
          source_context?: string
          tags?: Json | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_category?: string | null
          ai_summary?: string | null
          ai_tags?: Json | null
          category?: string
          created_at?: string
          document_date?: string | null
          family_member_id?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          patient_friendly_explanation?: string | null
          source_context?: string
          tags?: Json | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_documents_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      hipaa_audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          patient_user_id: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          patient_user_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          patient_user_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      international_drug_mappings: {
        Row: {
          brand_name: string
          brand_name_normalized: string
          country_code: string | null
          created_at: string
          generic_name: string
          id: string
          rxcui: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          brand_name: string
          brand_name_normalized: string
          country_code?: string | null
          created_at?: string
          generic_name: string
          id?: string
          rxcui?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          brand_name?: string
          brand_name_normalized?: string
          country_code?: string | null
          created_at?: string
          generic_name?: string
          id?: string
          rxcui?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          cover_letter: string | null
          created_at: string
          email: string
          full_name: string
          how_heard: string | null
          id: string
          job_id: string
          job_title: string
          linkedin_url: string | null
          phone: string | null
          portfolio_url: string | null
          resume_path: string | null
          status: string
          updated_at: string
          years_experience: string | null
        }
        Insert: {
          cover_letter?: string | null
          created_at?: string
          email: string
          full_name: string
          how_heard?: string | null
          id?: string
          job_id: string
          job_title: string
          linkedin_url?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_path?: string | null
          status?: string
          updated_at?: string
          years_experience?: string | null
        }
        Update: {
          cover_letter?: string | null
          created_at?: string
          email?: string
          full_name?: string
          how_heard?: string | null
          id?: string
          job_id?: string
          job_title?: string
          linkedin_url?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_path?: string | null
          status?: string
          updated_at?: string
          years_experience?: string | null
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
      messages: {
        Row: {
          attachment_path: string | null
          body: string
          clinician_user_id: string
          created_at: string
          external_message_id: string | null
          id: string
          patient_user_id: string
          read_at: string | null
          sender_user_id: string
          transport: string
        }
        Insert: {
          attachment_path?: string | null
          body: string
          clinician_user_id: string
          created_at?: string
          external_message_id?: string | null
          id?: string
          patient_user_id: string
          read_at?: string | null
          sender_user_id: string
          transport?: string
        }
        Update: {
          attachment_path?: string | null
          body?: string
          clinician_user_id?: string
          created_at?: string
          external_message_id?: string | null
          id?: string
          patient_user_id?: string
          read_at?: string | null
          sender_user_id?: string
          transport?: string
        }
        Relationships: []
      }
      patient_invitations: {
        Row: {
          accepted_at: string | null
          clinician_user_id: string
          created_at: string
          declined_at: string | null
          expires_at: string | null
          id: string
          invite_code: string
          patient_email: string
          patient_name: string | null
          provider_share_id: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          clinician_user_id: string
          created_at?: string
          declined_at?: string | null
          expires_at?: string | null
          id?: string
          invite_code: string
          patient_email: string
          patient_name?: string | null
          provider_share_id?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          clinician_user_id?: string
          created_at?: string
          declined_at?: string | null
          expires_at?: string | null
          id?: string
          invite_code?: string
          patient_email?: string
          patient_name?: string | null
          provider_share_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_invitations_provider_share_id_fkey"
            columns: ["provider_share_id"]
            isOneToOne: false
            referencedRelation: "provider_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          declined_at: string | null
          email: string
          expires_at: string | null
          id: string
          invite_code: string
          invited_by: string
          name: string | null
          practice_id: string
          role: Database["public"]["Enums"]["practice_role"]
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          declined_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invite_code?: string
          invited_by: string
          name?: string | null
          practice_id: string
          role?: Database["public"]["Enums"]["practice_role"]
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          declined_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invite_code?: string
          invited_by?: string
          name?: string | null
          practice_id?: string
          role?: Database["public"]["Enums"]["practice_role"]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_invitations_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_members: {
        Row: {
          accepted_at: string | null
          can_invite_members: boolean | null
          can_invite_patients: boolean | null
          can_manage_billing: boolean | null
          can_manage_settings: boolean | null
          can_view_all_patients: boolean | null
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          practice_id: string
          role: Database["public"]["Enums"]["practice_role"]
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          can_invite_members?: boolean | null
          can_invite_patients?: boolean | null
          can_manage_billing?: boolean | null
          can_manage_settings?: boolean | null
          can_view_all_patients?: boolean | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          practice_id: string
          role?: Database["public"]["Enums"]["practice_role"]
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          can_invite_members?: boolean | null
          can_invite_patients?: boolean | null
          can_manage_billing?: boolean | null
          can_manage_settings?: boolean | null
          can_view_all_patients?: boolean | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          practice_id?: string
          role?: Database["public"]["Enums"]["practice_role"]
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_members_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_patient_access: {
        Row: {
          added_at: string
          id: string
          is_active: boolean | null
          patient_user_id: string
          permissions: Json
          practice_id: string
          primary_clinician_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          is_active?: boolean | null
          patient_user_id: string
          permissions?: Json
          practice_id: string
          primary_clinician_id: string
        }
        Update: {
          added_at?: string
          id?: string
          is_active?: boolean | null
          patient_user_id?: string
          permissions?: Json
          practice_id?: string
          primary_clinician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_patient_access_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      practices: {
        Row: {
          address: string | null
          brand_accent_color: string | null
          brand_logo_url: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string
          email: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          member_limit: number | null
          name: string
          npi: string | null
          patient_limit: number | null
          phone: string | null
          primary_color: string | null
          state: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_ends_at: string | null
          subscription_status: string | null
          subscription_tier: string | null
          tax_id: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          brand_accent_color?: string | null
          brand_logo_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          member_limit?: number | null
          name: string
          npi?: string | null
          patient_limit?: number | null
          phone?: string | null
          primary_color?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_ends_at?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          tax_id?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          brand_accent_color?: string | null
          brand_logo_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          member_limit?: number | null
          name?: string
          npi?: string | null
          patient_limit?: number | null
          phone?: string | null
          primary_color?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_ends_at?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          tax_id?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          ai_consent_updated_at: string | null
          ai_processing_consent: boolean | null
          allergies: Json | null
          avatar_shared_with_clinicians: boolean | null
          avatar_url: string | null
          bio: string | null
          blood_type: string | null
          country_code: string | null
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
          onboarding_last_step: number
          onboarding_skipped: boolean
          phone_number: string | null
          push_notifications_enabled: boolean | null
          push_subscription: Json | null
          qhin_consent_at: string | null
          qhin_disclosure_version: string | null
          subscription_tier: string | null
          timezone: string | null
          unit_preferences: Json | null
          updated_at: string | null
          user_id: string
          weekly_adherence_report_enabled: boolean | null
        }
        Insert: {
          address?: string | null
          ai_consent_updated_at?: string | null
          ai_processing_consent?: boolean | null
          allergies?: Json | null
          avatar_shared_with_clinicians?: boolean | null
          avatar_url?: string | null
          bio?: string | null
          blood_type?: string | null
          country_code?: string | null
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
          onboarding_last_step?: number
          onboarding_skipped?: boolean
          phone_number?: string | null
          push_notifications_enabled?: boolean | null
          push_subscription?: Json | null
          qhin_consent_at?: string | null
          qhin_disclosure_version?: string | null
          subscription_tier?: string | null
          timezone?: string | null
          unit_preferences?: Json | null
          updated_at?: string | null
          user_id: string
          weekly_adherence_report_enabled?: boolean | null
        }
        Update: {
          address?: string | null
          ai_consent_updated_at?: string | null
          ai_processing_consent?: boolean | null
          allergies?: Json | null
          avatar_shared_with_clinicians?: boolean | null
          avatar_url?: string | null
          bio?: string | null
          blood_type?: string | null
          country_code?: string | null
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
          onboarding_last_step?: number
          onboarding_skipped?: boolean
          phone_number?: string | null
          push_notifications_enabled?: boolean | null
          push_subscription?: Json | null
          qhin_consent_at?: string | null
          qhin_disclosure_version?: string | null
          subscription_tier?: string | null
          timezone?: string | null
          unit_preferences?: Json | null
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
      qhin_imports: {
        Row: {
          completed_at: string | null
          consent_reference: string | null
          created_at: string
          disclosure_version: string | null
          error: string | null
          id: string
          match_count: number | null
          particle_query_id: string | null
          record_count: number | null
          requested_by: string
          scope: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          consent_reference?: string | null
          created_at?: string
          disclosure_version?: string | null
          error?: string | null
          id?: string
          match_count?: number | null
          particle_query_id?: string | null
          record_count?: number | null
          requested_by: string
          scope?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          consent_reference?: string | null
          created_at?: string
          disclosure_version?: string | null
          error?: string | null
          id?: string
          match_count?: number | null
          particle_query_id?: string | null
          record_count?: number | null
          requested_by?: string
          scope?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      qhin_record_provenance: {
        Row: {
          confidence: number | null
          fhir_resource_type: string | null
          id: string
          import_id: string
          ingested_at: string
          last_updated_at_source: string | null
          raw_fhir: Json | null
          source_organization: string | null
          source_resource_id: string | null
          source_system_oid: string | null
          target_id: string
          target_table: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          fhir_resource_type?: string | null
          id?: string
          import_id: string
          ingested_at?: string
          last_updated_at_source?: string | null
          raw_fhir?: Json | null
          source_organization?: string | null
          source_resource_id?: string | null
          source_system_oid?: string | null
          target_id: string
          target_table: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          fhir_resource_type?: string | null
          id?: string
          import_id?: string
          ingested_at?: string
          last_updated_at_source?: string | null
          raw_fhir?: Json | null
          source_organization?: string | null
          source_resource_id?: string | null
          source_system_oid?: string | null
          target_id?: string
          target_table?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qhin_record_provenance_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "qhin_imports"
            referencedColumns: ["id"]
          },
        ]
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
          ehr_connection_id: string | null
          external_id: string | null
          family_member_id: string | null
          id: string
          notes: string | null
          recorded_at: string
          secondary_value: number | null
          source: string | null
          type: string
          unit: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          ehr_connection_id?: string | null
          external_id?: string | null
          family_member_id?: string | null
          id?: string
          notes?: string | null
          recorded_at?: string
          secondary_value?: number | null
          source?: string | null
          type: string
          unit: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          ehr_connection_id?: string | null
          external_id?: string | null
          family_member_id?: string | null
          id?: string
          notes?: string | null
          recorded_at?: string
          secondary_value?: number | null
          source?: string | null
          type?: string
          unit?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "vitals_ehr_connection_id_fkey"
            columns: ["ehr_connection_id"]
            isOneToOne: false
            referencedRelation: "ehr_connections"
            referencedColumns: ["id"]
          },
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
      clinician_profiles_public: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          practice_name: string | null
          specialty: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          practice_name?: string | null
          specialty?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          practice_name?: string | null
          specialty?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      patient_basic_info: {
        Row: {
          email: string | null
          name: string | null
          user_id: string | null
        }
        Insert: {
          email?: string | null
          name?: string | null
          user_id?: string | null
        }
        Update: {
          email?: string | null
          name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_manage_practice: { Args: { practice_uuid: string }; Returns: boolean }
      clinician_has_patient_access: {
        Args: { patient_user_id: string }
        Returns: boolean
      }
      clinician_has_patient_permission: {
        Args: { patient_user_id: string; permission_key: string }
        Returns: boolean
      }
      get_clinician_basic_info: {
        Args: { clinician_ids: string[] }
        Returns: {
          avatar_url: string
          first_name: string
          last_name: string
          practice_name: string
          title: string
          user_id: string
        }[]
      }
      get_current_user_email: { Args: never; Returns: string }
      has_practice_role: {
        Args: {
          practice_uuid: string
          required_role: Database["public"]["Enums"]["practice_role"]
        }
        Returns: boolean
      }
      is_practice_member: { Args: { practice_uuid: string }; Returns: boolean }
      practice_has_patient_access: {
        Args: { patient_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      practice_role: "owner" | "admin" | "provider" | "staff"
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
    Enums: {
      practice_role: ["owner", "admin", "provider", "staff"],
    },
  },
} as const
