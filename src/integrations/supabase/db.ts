import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "./client";
import type { ExtraDatabase } from "./types-extra";

/**
 * The same client, typed against the tables the generated types have not
 * caught up with. See `types-extra.ts` for what this covers and how to
 * retire it.
 *
 * It is the identical runtime object — only the compile-time view differs —
 * so mixing `supabase` and `supabaseExtra` in one file is fine.
 */
export const supabaseExtra = supabase as unknown as SupabaseClient<ExtraDatabase>;
