// Provisions a fully populated demo hospital tenant so every practice role can
// be signed into and tested for real: owner, admin, department lead, provider,
// nurse, front desk, billing, read-only and non-clinical staff, plus two staff
// accounts that have NOT joined yet so the join-request flow can be walked.
//
// Idempotent: re-running updates the same accounts and memberships.
// Internal/admin callers only — it mints auth users with a known password.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRoleOrAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PASSWORD = "Demo123!";
const HOSPITAL_NAME = "OneCare Demo Hospital";
const HOSPITAL_SLUG = "demo-hospital";
const DEPARTMENT = "Internal Medicine";

type Role =
  | "owner" | "admin" | "sub_admin" | "provider" | "clinician"
  | "nurse" | "front_desk" | "billing" | "read_only" | "staff";

interface Staff {
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  specialty: string;
  role: Role;
  /** member of the hospital already, or waiting to request access */
  join: "member" | "allowlisted" | "unknown";
  inDepartment?: boolean;
  isLead?: boolean;
}

const STAFF: Staff[] = [
  { email: "demo-clinician-6@onecare.you", first_name: "Ada", last_name: "Owusu", title: "Dr.", specialty: "Internal Medicine", role: "owner", join: "member", inDepartment: true },
  { email: "demo-clinician-7@onecare.you", first_name: "Ben", last_name: "Tetteh", title: "Dr.", specialty: "Administration", role: "admin", join: "member" },
  { email: "demo-clinician-8@onecare.you", first_name: "Chidi", last_name: "Okafor", title: "Dr.", specialty: "Cardiology", role: "provider", join: "member", inDepartment: true },
  { email: "demo-clinician-9@onecare.you", first_name: "Dana", last_name: "Mensah", title: "Dr.", specialty: "Internal Medicine", role: "sub_admin", join: "member", inDepartment: true, isLead: true },
  { email: "demo-nurse-1@onecare.you", first_name: "Efua", last_name: "Sarpong", title: "Nurse", specialty: "Nursing", role: "nurse", join: "member", inDepartment: true },
  { email: "demo-frontdesk-1@onecare.you", first_name: "Femi", last_name: "Adeyemi", title: "Mr.", specialty: "Reception", role: "front_desk", join: "member" },
  { email: "demo-billing-1@onecare.you", first_name: "Grace", last_name: "Boateng", title: "Ms.", specialty: "Billing", role: "billing", join: "member" },
  { email: "demo-readonly-1@onecare.you", first_name: "Henry", last_name: "Kojo", title: "Mr.", specialty: "Audit", role: "read_only", join: "member" },
  { email: "demo-staff-1@onecare.you", first_name: "Ify", last_name: "Nwosu", title: "Ms.", specialty: "Operations", role: "staff", join: "member" },
  // Not members yet — for walking the join request at /staff
  { email: "demo-clinician-10@onecare.you", first_name: "Joan", last_name: "Mba", title: "Dr.", specialty: "Paediatrics", role: "clinician", join: "allowlisted" },
  { email: "demo-clinician-11@onecare.you", first_name: "Kofi", last_name: "Asante", title: "Dr.", specialty: "Neurology", role: "clinician", join: "unknown" },
];

/** Members whose seat carries management flags. */
const FLAGS: Record<string, Record<string, boolean>> = {
  owner: { can_invite_patients: true, can_invite_members: true, can_manage_billing: true, can_view_all_patients: true, can_manage_settings: true },
  admin: { can_invite_patients: true, can_invite_members: true, can_manage_billing: true, can_view_all_patients: true, can_manage_settings: true },
  sub_admin: { can_invite_patients: true, can_invite_members: false, can_manage_billing: false, can_view_all_patients: true, can_manage_settings: false },
  provider: { can_invite_patients: true, can_invite_members: false, can_manage_billing: false, can_view_all_patients: false, can_manage_settings: false },
  clinician: { can_invite_patients: true, can_invite_members: false, can_manage_billing: false, can_view_all_patients: false, can_manage_settings: false },
  nurse: { can_invite_patients: false, can_invite_members: false, can_manage_billing: false, can_view_all_patients: false, can_manage_settings: false },
  front_desk: { can_invite_patients: true, can_invite_members: false, can_manage_billing: false, can_view_all_patients: false, can_manage_settings: false },
  billing: { can_invite_patients: false, can_invite_members: false, can_manage_billing: true, can_view_all_patients: false, can_manage_settings: false },
  read_only: { can_invite_patients: false, can_invite_members: false, can_manage_billing: false, can_view_all_patients: false, can_manage_settings: false },
  staff: { can_invite_patients: false, can_invite_members: false, can_manage_billing: false, can_view_all_patients: false, can_manage_settings: false },
};

const HOSPITAL_PATIENTS = [
  { email: "demo-patient-1@onecare.you", assignTo: "demo-clinician-8@onecare.you" },
  { email: "demo-patient-2@onecare.you", assignTo: "demo-clinician-9@onecare.you" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const caller = await requireServiceRoleOrAdmin(req, corsHeaders);
  if (caller instanceof Response) return caller;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const notes: string[] = [];

  try {
    // Every existing auth user, once — listUsers is paged.
    const byEmail = new Map<string, string>();
    for (let page = 1; page <= 20; page += 1) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const users = data?.users ?? [];
      for (const u of users) if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
      if (users.length < 200) break;
    }

    const ensureUser = async (email: string, name: string, isClinician: boolean) => {
      const existing = byEmail.get(email.toLowerCase());
      if (existing) {
        await admin.auth.admin.updateUserById(existing, { password: PASSWORD, email_confirm: true });
        return existing;
      }
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name, is_clinician: isClinician },
      });
      if (error || !data.user) throw new Error(`${email}: ${error?.message}`);
      byEmail.set(email.toLowerCase(), data.user.id);
      return data.user.id;
    };

    // 1. Staff accounts + clinician profiles
    const staffIds: Record<string, string> = {};
    for (const s of STAFF) {
      const id = await ensureUser(s.email, `${s.title} ${s.first_name} ${s.last_name}`, true);
      staffIds[s.email] = id;
      const { error } = await admin.from("clinician_profiles").upsert({
        user_id: id,
        first_name: s.first_name,
        last_name: s.last_name,
        title: s.title,
        specialty: s.specialty,
        practice_name: HOSPITAL_NAME,
        license_number: `DEMO-${s.role.toUpperCase()}-${id.slice(0, 6)}`,
        country: "GH",
        is_verified: true,
        onboarding_completed: true,
        subscription_tier: "enterprise",
        subscription_status: "active",
        patient_limit: 1000,
      }, { onConflict: "user_id" });
      if (error) notes.push(`profile ${s.email}: ${error.message}`);
    }

    // 2. The hospital itself. The owner creates it, and the add_practice_owner
    //    trigger gives them their seat.
    const ownerId = staffIds["demo-clinician-6@onecare.you"];
    const { data: existingPractice } = await admin
      .from("practices").select("id").eq("slug", HOSPITAL_SLUG).maybeSingle();

    const practiceFields = {
      name: HOSPITAL_NAME,
      slug: HOSPITAL_SLUG,
      tenant_type: "hospital",
      created_by: ownerId,
      country: "GH",
      city: "Accra",
      address: "12 Independence Avenue",
      phone: "+233302000000",
      email: "hospital@onecare.you",
      subscription_tier: "enterprise",
      subscription_status: "active",
      patient_limit: 5000,
      member_limit: 250,
      storage_limit_gb: 250,
      is_active: true,
      // Isolation is the point of this tenant: a clinician sees a patient only
      // once the hospital assigns them.
      assignment_first_access: true,
      allowed_email_domains: [] as string[],
      default_currency: "GHS",
    };

    let practiceId: string;
    if (existingPractice?.id) {
      practiceId = existingPractice.id;
      const { error } = await admin.from("practices").update(practiceFields).eq("id", practiceId);
      if (error) notes.push(`practice update: ${error.message}`);
    } else {
      const { data, error } = await admin.from("practices").insert(practiceFields).select("id").single();
      if (error || !data) throw new Error(`practice: ${error?.message}`);
      practiceId = data.id;
    }

    // 3. Department
    const { data: dept } = await admin
      .from("practice_departments")
      .upsert({ practice_id: practiceId, name: DEPARTMENT, description: "Demo department", created_by: ownerId },
        { onConflict: "practice_id,name", ignoreDuplicates: false })
      .select("id").maybeSingle();
    let departmentId = dept?.id as string | undefined;
    if (!departmentId) {
      const { data: found } = await admin.from("practice_departments")
        .select("id").eq("practice_id", practiceId).eq("name", DEPARTMENT).maybeSingle();
      departmentId = found?.id;
    }

    // 4. Seats
    for (const s of STAFF) {
      const id = staffIds[s.email];
      if (s.join !== "member") continue;
      const { error } = await admin.from("practice_members").upsert({
        practice_id: practiceId,
        user_id: id,
        role: s.role,
        status: "active",
        accepted_at: new Date().toISOString(),
        invited_by: ownerId,
        ...FLAGS[s.role],
      }, { onConflict: "practice_id,user_id" });
      if (error) notes.push(`member ${s.email}: ${error.message}`);

      if (s.inDepartment && departmentId) {
        const { error: dErr } = await admin.from("practice_department_members").upsert({
          department_id: departmentId,
          practice_id: practiceId,
          user_id: id,
          is_lead: !!s.isLead,
        }, { onConflict: "department_id,user_id" });
        if (dErr) notes.push(`department ${s.email}: ${dErr.message}`);
      }
    }

    // Independent demo clinician 1 joins as a plain clinician, with no
    // assignments — the control case for role isolation.
    const solo = byEmail.get("demo-clinician-1@onecare.you");
    if (solo) {
      await admin.from("practice_members").upsert({
        practice_id: practiceId, user_id: solo, role: "clinician", status: "active",
        accepted_at: new Date().toISOString(), invited_by: ownerId, ...FLAGS.clinician,
      }, { onConflict: "practice_id,user_id" });
    }

    // 5. Allowlist entry so one account joins straight through, and none for the
    //    other so it lands in pending approval.
    const allowlisted = STAFF.find((s) => s.join === "allowlisted");
    if (allowlisted) {
      const { error } = await admin.from("practice_clinician_allowlist").upsert({
        practice_id: practiceId,
        email: allowlisted.email,
        full_name: `${allowlisted.first_name} ${allowlisted.last_name}`,
        intended_role: "clinician",
        department_id: departmentId ?? null,
        note: "Demo: expected staff member",
        added_by: ownerId,
      }, { onConflict: "practice_id,email" });
      if (error) notes.push(`allowlist: ${error.message}`);
    }

    // 6. Patients connected to the hospital, with assignments
    const patients: Array<{ email: string; assigned_to: string }> = [];
    for (const p of HOSPITAL_PATIENTS) {
      const pid = byEmail.get(p.email);
      if (!pid) { notes.push(`patient missing: ${p.email} (run seed-demo-data first)`); continue; }

      const { error: shareErr } = await admin.from("practice_shares").upsert({
        practice_id: practiceId,
        user_id: pid,
        share_all: true,
        is_active: true,
        revoked_at: null,
        practice_suspended_at: null,
        permissions: {
          vitals: true, medications: true, documents: true,
          conditions: true, allergies: true, adherence: true,
        },
      }, { onConflict: "practice_id,user_id" });
      if (shareErr) notes.push(`share ${p.email}: ${shareErr.message}`);

      const clinicianId = staffIds[p.assignTo];
      const { data: existingAssign } = await admin
        .from("practice_patient_assignments")
        .select("id")
        .eq("practice_id", practiceId)
        .eq("patient_user_id", pid)
        .eq("clinician_user_id", clinicianId)
        .is("effective_to", null)
        .maybeSingle();
      if (!existingAssign) {
        const { error } = await admin.from("practice_patient_assignments").insert({
          practice_id: practiceId,
          patient_user_id: pid,
          clinician_user_id: clinicianId,
          assignment_role: "primary",
          department_id: departmentId ?? null,
          assigned_by: ownerId,
          notes: "Demo assignment",
        });
        if (error) notes.push(`assignment ${p.email}: ${error.message}`);
      }
      patients.push({ email: p.email, assigned_to: p.assignTo });
    }

    return new Response(JSON.stringify({
      ok: true,
      hospital: { id: practiceId, name: HOSPITAL_NAME, code: HOSPITAL_SLUG, department: DEPARTMENT },
      password: PASSWORD,
      staff: STAFF.map((s) => ({ email: s.email, role: s.role, join: s.join, name: `${s.title} ${s.first_name} ${s.last_name}` })),
      patients,
      notes,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[seed-demo-hospital]", e);
    return new Response(JSON.stringify({ error: String(e), notes }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
