// Shared caller-authentication helpers for edge functions.
//
// Most functions in this project deploy with verify_jwt = false, so the caller
// MUST be validated in code. These helpers give three levels of protection:
//
//   requireServiceRole  -> internal/cron only (rejects every public caller)
//   requireUser         -> any signed-in user
//   requireServiceRoleOrUser -> cron OR a signed-in user (never anonymous)
//   requireServiceRoleOrAdmin -> cron OR a user with the `admin` role
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export interface CallerUser {
  id: string;
  email: string | null;
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function bearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/** True when the request presents the project service-role key (internal/cron caller). */
export function isServiceRoleCall(req: Request): boolean {
  const token = bearer(req);
  return !!token && !!SERVICE_ROLE_KEY && token === SERVICE_ROLE_KEY;
}

/** Resolves the signed-in user from the request JWT, or null when absent/invalid. */
export async function getCallerUser(req: Request): Promise<CallerUser | null> {
  const token = bearer(req);
  if (!token || token === ANON_KEY || token === SERVICE_ROLE_KEY) return null;

  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Internal-only endpoints (pg_cron / server-to-server). Returns a 401 Response when rejected. */
export function requireServiceRole(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  if (!isServiceRoleCall(req)) {
    return json({ error: "Unauthorized" }, 401, corsHeaders);
  }
  return null;
}

/** Signed-in users only. Returns the user, or a 401 Response when rejected. */
export async function requireUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<CallerUser | Response> {
  const user = await getCallerUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401, corsHeaders);
  return user;
}

/** Cron OR any signed-in user. Anonymous callers are rejected. */
export async function requireServiceRoleOrUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ user: CallerUser | null } | Response> {
  if (isServiceRoleCall(req)) return { user: null };
  const user = await getCallerUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401, corsHeaders);
  return { user };
}

/** Cron OR a user holding the `admin` role in public.user_roles. */
export async function requireServiceRoleOrAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ user: CallerUser | null } | Response> {
  if (isServiceRoleCall(req)) return { user: null };

  const user = await getCallerUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (error || !data) {
    return json({ error: "Forbidden: admin only" }, 403, corsHeaders);
  }
  return { user };
}
