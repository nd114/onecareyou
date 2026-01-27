import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Demo account credentials
const DEMO_PASSWORD = "Demo123!";

// Clinician definitions
const clinicians = [
  {
    email: "demo-clinician-1@onecare.you",
    first_name: "Sarah",
    last_name: "Mitchell",
    title: "Dr.",
    specialty: "Internal Medicine",
    practice_name: "Mitchell Medical Group",
    license_number: "MD-123456",
    country: "US",
  },
  {
    email: "demo-clinician-2@onecare.you",
    first_name: "Michael",
    last_name: "Chen",
    title: "Dr.",
    specialty: "Cardiology",
    practice_name: "Heart Health Associates",
    license_number: "MD-789012",
    country: "US",
  },
  {
    email: "demo-clinician-3@onecare.you",
    first_name: "Emily",
    last_name: "Williams",
    title: "Dr.",
    specialty: "Endocrinology",
    practice_name: "Diabetes & Hormone Center",
    license_number: "MD-345678",
    country: "US",
  },
];

// Patient definitions
const patients = [
  {
    email: "demo-patient-1@onecare.you",
    name: "James Thompson",
    date_of_birth: "1967-03-15",
    gender: "male",
    blood_type: "A+",
    height: 178,
    health_conditions: ["Type 2 Diabetes", "Hypertension"],
    allergies: ["Penicillin"],
    country_code: "US",
    medications: [
      { name: "Metformin", dosage: "500mg", frequency: "twice_daily", type: "prescription", times: ["08:00", "20:00"] },
      { name: "Lisinopril", dosage: "10mg", frequency: "once_daily", type: "prescription", times: ["08:00"] },
      { name: "Vitamin D", dosage: "1000 IU", frequency: "once_daily", type: "supplement", times: ["08:00"] },
    ],
    vitals_config: { glucose: true, bp: true, weight: true, heart_rate: true },
    clinician_emails: ["demo-clinician-1@onecare.you", "demo-clinician-3@onecare.you"],
  },
  {
    email: "demo-patient-2@onecare.you",
    name: "Maria Garcia",
    date_of_birth: "1980-07-22",
    gender: "female",
    blood_type: "O+",
    height: 165,
    health_conditions: ["High Cholesterol"],
    allergies: [],
    country_code: "US",
    medications: [
      { name: "Atorvastatin", dosage: "20mg", frequency: "once_daily", type: "prescription", times: ["21:00"] },
      { name: "Aspirin", dosage: "81mg", frequency: "once_daily", type: "otc", times: ["08:00"] },
    ],
    vitals_config: { bp: true, weight: true, heart_rate: true },
    clinician_emails: ["demo-clinician-1@onecare.you", "demo-clinician-2@onecare.you"],
  },
  {
    email: "demo-patient-3@onecare.you",
    name: "Robert Johnson",
    date_of_birth: "1963-11-08",
    gender: "male",
    blood_type: "B+",
    height: 182,
    health_conditions: ["Mild Chronic Kidney Disease (Stage 2)"],
    allergies: ["Sulfa drugs"],
    country_code: "US",
    medications: [
      { name: "Losartan", dosage: "50mg", frequency: "once_daily", type: "prescription", times: ["09:00"] },
      { name: "Omega-3 Fish Oil", dosage: "1000mg", frequency: "twice_daily", type: "supplement", times: ["08:00", "20:00"] },
    ],
    vitals_config: { bp: true, weight: true, heart_rate: true },
    clinician_emails: ["demo-clinician-1@onecare.you"],
  },
  {
    email: "demo-patient-4@onecare.you",
    name: "Lisa Anderson",
    date_of_birth: "1973-05-30",
    gender: "female",
    blood_type: "AB+",
    height: 160,
    health_conditions: ["Hypothyroidism", "Hypertension"],
    allergies: ["Iodine contrast"],
    country_code: "US",
    medications: [
      { name: "Levothyroxine", dosage: "50mcg", frequency: "once_daily", type: "prescription", times: ["06:30"] },
      { name: "Amlodipine", dosage: "5mg", frequency: "once_daily", type: "prescription", times: ["09:00"] },
    ],
    vitals_config: { bp: true, weight: true, heart_rate: true },
    clinician_emails: ["demo-clinician-3@onecare.you"],
  },
  {
    email: "demo-patient-5@onecare.you",
    name: "David Wilson",
    date_of_birth: "1977-09-12",
    gender: "male",
    blood_type: "O-",
    height: 175,
    health_conditions: ["Mild Persistent Asthma"],
    allergies: ["Dust mites", "Pollen"],
    country_code: "US",
    medications: [
      { name: "Albuterol Inhaler", dosage: "90mcg/puff", frequency: "as_needed", type: "prescription", times: [] },
      { name: "Montelukast", dosage: "10mg", frequency: "once_daily", type: "prescription", times: ["21:00"] },
    ],
    vitals_config: { bp: true, weight: true, heart_rate: true },
    clinician_emails: ["demo-clinician-1@onecare.you"],
  },
];

// Helper to generate random number in range
function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper to generate random float with decimals
function randomFloat(min: number, max: number, decimals: number = 1): number {
  const value = Math.random() * (max - min) + min;
  return parseFloat(value.toFixed(decimals));
}

// Generate vitals for a patient over 90 days
function generateVitals(userId: string, config: Record<string, boolean>): any[] {
  const vitals: any[] = [];
  const now = new Date();
  
  for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(randomInRange(7, 10), randomInRange(0, 59), 0, 0);
    
    // Weight - weekly
    if (config.weight && daysAgo % 7 === 0) {
      vitals.push({
        user_id: userId,
        type: "weight",
        value: randomFloat(70, 85, 1),
        unit: "kg",
        recorded_at: date.toISOString(),
        source: "manual",
      });
    }
    
    // Blood Pressure - every 2-3 days
    if (config.bp && daysAgo % randomInRange(2, 3) === 0) {
      const systolic = randomInRange(115, 145);
      const diastolic = randomInRange(70, 90);
      vitals.push({
        user_id: userId,
        type: "blood_pressure",
        value: systolic,
        secondary_value: diastolic,
        unit: "mmHg",
        recorded_at: date.toISOString(),
        source: "manual",
      });
    }
    
    // Heart Rate - every 2-3 days
    if (config.heart_rate && daysAgo % randomInRange(2, 3) === 0) {
      vitals.push({
        user_id: userId,
        type: "heart_rate",
        value: randomInRange(62, 82),
        unit: "bpm",
        recorded_at: date.toISOString(),
        source: "manual",
      });
    }
    
    // Blood Glucose - daily for diabetic patients
    if (config.glucose) {
      // Fasting glucose in the morning
      vitals.push({
        user_id: userId,
        type: "blood_glucose",
        value: randomInRange(95, 140),
        unit: "mg/dL",
        recorded_at: date.toISOString(),
        source: "manual",
        notes: "Fasting",
      });
      
      // Post-meal glucose occasionally
      if (daysAgo % 3 === 0) {
        const afternoonDate = new Date(date);
        afternoonDate.setHours(14, randomInRange(0, 59));
        vitals.push({
          user_id: userId,
          type: "blood_glucose",
          value: randomInRange(120, 180),
          unit: "mg/dL",
          recorded_at: afternoonDate.toISOString(),
          source: "manual",
          notes: "After lunch",
        });
      }
    }
    
    // Temperature - weekly
    if (daysAgo % 7 === 0) {
      vitals.push({
        user_id: userId,
        type: "temperature",
        value: randomFloat(36.3, 36.9, 1),
        unit: "°C",
        recorded_at: date.toISOString(),
        source: "manual",
      });
    }
  }
  
  return vitals;
}

// Generate schedule entries for medications over 90 days
function generateScheduleEntries(
  userId: string, 
  medicationId: string, 
  times: string[], 
  frequency: string
): any[] {
  const entries: any[] = [];
  const now = new Date();
  
  if (frequency === "as_needed" || times.length === 0) {
    // For as-needed meds, generate occasional usage
    for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
      if (Math.random() > 0.7) { // 30% chance of use on any day
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);
        date.setHours(randomInRange(8, 20), randomInRange(0, 59), 0, 0);
        
        entries.push({
          user_id: userId,
          medication_id: medicationId,
          scheduled_time: date.toISOString(),
          status: "taken",
          taken_at: date.toISOString(),
        });
      }
    }
    return entries;
  }
  
  for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
    for (const time of times) {
      const [hours, minutes] = time.split(":").map(Number);
      const scheduledDate = new Date(now);
      scheduledDate.setDate(scheduledDate.getDate() - daysAgo);
      scheduledDate.setHours(hours, minutes, 0, 0);
      
      // 85-95% adherence rate
      const adherenceRoll = Math.random();
      let status: string;
      let takenAt: string | null = null;
      let skippedReason: string | null = null;
      
      if (adherenceRoll < 0.88) {
        status = "taken";
        // Taken within 0-30 minutes of scheduled time
        const takenDate = new Date(scheduledDate);
        takenDate.setMinutes(takenDate.getMinutes() + randomInRange(0, 30));
        takenAt = takenDate.toISOString();
      } else if (adherenceRoll < 0.94) {
        status = "skipped";
        skippedReason = ["Forgot", "Felt unwell", "Ran out of medication"][randomInRange(0, 2)];
      } else {
        status = "missed";
      }
      
      entries.push({
        user_id: userId,
        medication_id: medicationId,
        scheduled_time: scheduledDate.toISOString(),
        status,
        taken_at: takenAt,
        skipped_reason: skippedReason,
      });
    }
  }
  
  return entries;
}

// Generate random invite code
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const results = {
      clinicians: [] as any[],
      patients: [] as any[],
      medications: 0,
      vitals: 0,
      schedule_entries: 0,
      provider_shares: 0,
    };

    // Map to store user IDs by email
    const userIdMap: Record<string, string> = {};

    // 1. Create clinician users
    console.log("Creating clinician users...");
    for (const clinician of clinicians) {
      // Check if user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === clinician.email);
      
      let userId: string;
      
      if (existingUser) {
        userId = existingUser.id;
        console.log(`Clinician ${clinician.email} already exists, updating...`);
      } else {
        // Create auth user
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: clinician.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: {
            name: `${clinician.title} ${clinician.first_name} ${clinician.last_name}`,
            is_clinician: true,
          },
        });

        if (authError) {
          console.error(`Error creating clinician ${clinician.email}:`, authError);
          continue;
        }
        userId = authUser.user.id;
      }

      userIdMap[clinician.email] = userId;

      // Create/update clinician profile
      const { error: profileError } = await supabaseAdmin
        .from("clinician_profiles")
        .upsert({
          user_id: userId,
          first_name: clinician.first_name,
          last_name: clinician.last_name,
          title: clinician.title,
          specialty: clinician.specialty,
          practice_name: clinician.practice_name,
          license_number: clinician.license_number,
          country: clinician.country,
          subscription_tier: "enterprise",
          subscription_status: "active",
          patient_limit: 1000,
          is_verified: true,
          onboarding_completed: true,
          email_notifications_enabled: true,
          push_notifications_enabled: false,
          notify_on_guidance_acknowledged: true,
          notify_on_guidance_completed: true,
          notify_on_guidance_expired: true,
        }, { onConflict: "user_id" });

      if (profileError) {
        console.error(`Error creating clinician profile for ${clinician.email}:`, profileError);
      } else {
        results.clinicians.push({
          email: clinician.email,
          name: `${clinician.title} ${clinician.first_name} ${clinician.last_name}`,
        });
      }
    }

    // 2. Create patient users
    console.log("Creating patient users...");
    for (const patient of patients) {
      // Check if user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === patient.email);
      
      let userId: string;
      
      if (existingUser) {
        userId = existingUser.id;
        console.log(`Patient ${patient.email} already exists, updating...`);
      } else {
        // Create auth user
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: patient.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: {
            name: patient.name,
          },
        });

        if (authError) {
          console.error(`Error creating patient ${patient.email}:`, authError);
          continue;
        }
        userId = authUser.user.id;
      }

      userIdMap[patient.email] = userId;

      // Update patient profile (auto-created by trigger)
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          user_id: userId,
          email: patient.email,
          name: patient.name,
          date_of_birth: patient.date_of_birth,
          gender: patient.gender,
          blood_type: patient.blood_type,
          height: patient.height,
          health_conditions: patient.health_conditions,
          allergies: patient.allergies,
          country_code: patient.country_code,
          subscription_tier: "premium",
          onboarding_completed: true,
          email_notifications_enabled: true,
          push_notifications_enabled: false,
          weekly_adherence_report_enabled: true,
          ai_processing_consent: true,
        }, { onConflict: "user_id" });

      if (profileError) {
        console.error(`Error updating patient profile for ${patient.email}:`, profileError);
      } else {
        results.patients.push({
          email: patient.email,
          name: patient.name,
        });
      }

      // 3. Create medications for this patient
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);

      for (const med of patient.medications) {
        const { data: medData, error: medError } = await supabaseAdmin
          .from("medications")
          .insert({
            user_id: userId,
            name: med.name,
            dosage: med.dosage,
            frequency: med.frequency,
            type: med.type,
            times_of_day: med.times,
            start_date: startDate.toISOString().split("T")[0],
            is_active: true,
            instructions: med.frequency === "as_needed" ? "Use as needed for symptom relief" : null,
          })
          .select()
          .single();

        if (medError) {
          console.error(`Error creating medication ${med.name}:`, medError);
          continue;
        }
        results.medications++;

        // 4. Generate schedule entries for this medication
        const scheduleEntries = generateScheduleEntries(userId, medData.id, med.times, med.frequency);
        
        if (scheduleEntries.length > 0) {
          // Insert in batches
          const batchSize = 100;
          for (let i = 0; i < scheduleEntries.length; i += batchSize) {
            const batch = scheduleEntries.slice(i, i + batchSize);
            const { error: scheduleError } = await supabaseAdmin
              .from("schedule_entries")
              .insert(batch);
            
            if (scheduleError) {
              console.error(`Error inserting schedule entries:`, scheduleError);
            } else {
              results.schedule_entries += batch.length;
            }
          }
        }
      }

      // 5. Generate vitals for this patient
      const vitals = generateVitals(userId, patient.vitals_config as Record<string, boolean>);
      
      // Insert in batches
      const batchSize = 100;
      for (let i = 0; i < vitals.length; i += batchSize) {
        const batch = vitals.slice(i, i + batchSize);
        const { error: vitalsError } = await supabaseAdmin
          .from("vitals")
          .insert(batch);
        
        if (vitalsError) {
          console.error(`Error inserting vitals:`, vitalsError);
        } else {
          results.vitals += batch.length;
        }
      }

      // 6. Create provider shares (patient-clinician relationships)
      for (const clinicianEmail of patient.clinician_emails) {
        const clinicianUserId = userIdMap[clinicianEmail];
        if (!clinicianUserId) continue;

        const clinicianData = clinicians.find(c => c.email === clinicianEmail);
        const providerName = clinicianData 
          ? `${clinicianData.title} ${clinicianData.first_name} ${clinicianData.last_name}`
          : "Unknown Provider";

        // Check if share already exists
        const { data: existingShare } = await supabaseAdmin
          .from("provider_shares")
          .select("id")
          .eq("user_id", userId)
          .eq("clinician_user_id", clinicianUserId)
          .maybeSingle();

        if (existingShare) {
          console.log(`Provider share already exists for ${patient.email} -> ${clinicianEmail}`);
          results.provider_shares++;
          continue;
        }

        const { error: shareError } = await supabaseAdmin
          .from("provider_shares")
          .insert({
            user_id: userId,
            clinician_user_id: clinicianUserId,
            provider_name: providerName,
            provider_email: clinicianEmail,
            invite_code: generateInviteCode(),
            is_active: true,
            permissions: {
              view_medications: true,
              view_vitals: true,
              view_adherence: true,
              view_profile: true,
              send_guidance: true,
              set_alerts: true,
            },
            last_accessed_at: new Date().toISOString(),
          });

        if (shareError) {
          console.error(`Error creating provider share:`, shareError);
        } else {
          results.provider_shares++;
        }
      }
    }

    console.log("Demo data seeding complete!", results);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Demo data seeded successfully",
        password: DEMO_PASSWORD,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error seeding demo data:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
