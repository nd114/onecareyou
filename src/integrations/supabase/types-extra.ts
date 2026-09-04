import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "./client";
import type { Database } from "./types";

/**
 * Functions the generated `types.ts` has not seen yet.
 *
 * `types.ts` is regenerated from the live database, so anything a migration
 * adds has no type until that migration is deployed. This file has been
 * created and deleted twice already, which is the design working rather than
 * churn: it exists for exactly as long as the gap does.
 *
 * **Retiring it:** once 20260906110000 is deployed and `types.ts` is
 * regenerated, `my_pending_clinician_records` will be in the generated types.
 * Swap `supabaseExtra` back to `supabase` at the call site and delete this
 * file.
 *
 * Covered migrations:
 *   20260906110000_pending_records_need_confirmed_email
 */

/** Only what identifies a record. No clinical content, deliberately. */
export interface PendingClinicianRecordRow {
  id: string;
  clinician_user_id: string;
  practice_id: string | null;
  patient_name: string;
  masked_email: string | null;
  masked_phone: string | null;
  data_sharing_model: string;
  created_at: string;
}

type ExtraDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      my_pending_clinician_records: {
        Args: Record<never, never>;
        Returns: PendingClinicianRecordRow[];
      };
    };
  };
};

export const supabaseExtra = supabase as unknown as SupabaseClient<ExtraDatabase>;
