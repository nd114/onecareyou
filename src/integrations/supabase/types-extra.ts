import type { Database } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "./client";

/**
 * Columns the generated `types.ts` has not seen yet.
 *
 * `types.ts` and `client.ts` are regenerated from the live database and must
 * not be hand-edited, so a column added by a migration that has not been
 * deployed-and-regenerated has no type at all. The habit that grew around that
 * was `(supabase as any)`, which switches off checking for the whole
 * statement — and one of those casts was hiding a write that could never have
 * succeeded.
 *
 * This file existed once before for the FHIR tables and was deleted the moment
 * those migrations were deployed, which is exactly how it is meant to work.
 *
 * **Retiring it again:** once 20260904100000_vault_documents_archive is
 * deployed and `types.ts` is regenerated, `archived_at` and `archived_reason`
 * will exist in the generated types. Then swap `supabaseExtra` back to
 * `supabase` at the call sites and delete this file. Nothing else depends on
 * it.
 *
 * Covered migrations:
 *   20260904100000_vault_documents_archive
 *   20260905100000_one_institution_access_table
 */

type GeneratedDocuments = Database["public"]["Tables"]["health_documents"];
type GeneratedShares = Database["public"]["Tables"]["practice_shares"];

/**
 * Derived from the generated shape rather than restated, so it stays correct
 * as that shape changes and becomes a no-op intersection once the columns are
 * generated.
 */
type DocumentsWithArchive = {
  Row: GeneratedDocuments["Row"] & {
    archived_at: string | null;
    archived_reason: string | null;
  };
  Insert: GeneratedDocuments["Insert"] & {
    archived_at?: string | null;
    archived_reason?: string | null;
  };
  Update: GeneratedDocuments["Update"] & {
    archived_at?: string | null;
    archived_reason?: string | null;
  };
  Relationships: GeneratedDocuments["Relationships"];
};

/**
 * The practice's own suspension switch, moved here when
 * practice_patient_access was retired. Distinct from `is_active`, which is
 * the patient's decision — a practice must never be able to write that one.
 */
type SharesWithSuspension = {
  Row: GeneratedShares["Row"] & {
    practice_suspended_at: string | null;
    practice_suspended_by: string | null;
  };
  Insert: GeneratedShares["Insert"] & {
    practice_suspended_at?: string | null;
    practice_suspended_by?: string | null;
  };
  Update: GeneratedShares["Update"] & {
    practice_suspended_at?: string | null;
    practice_suspended_by?: string | null;
  };
  Relationships: GeneratedShares["Relationships"];
};

export type ExtraDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Omit<Database["public"]["Tables"], "health_documents"> & {
      health_documents: DocumentsWithArchive;
      practice_shares: SharesWithSuspension;
    };
  };
};

/**
 * The same client, typed against those columns. It is the identical runtime
 * object — only the compile-time view differs — so mixing `supabase` and
 * `supabaseExtra` in one file is fine.
 */
export const supabaseExtra = supabase as unknown as SupabaseClient<ExtraDatabase>;
