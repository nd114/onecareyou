import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const GetSharedPatientDataSchema = z.object({
  inviteCode: z.string()
    .min(1, 'Invite code is required')
    .max(100, 'Invite code too long')
    .regex(/^[a-zA-Z0-9\-_]+$/, 'Invalid invite code format'),
});

interface SharePermissions {
  vitals: boolean;
  meds: boolean;
  adherence: boolean;
  profile: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse and validate input
    const rawBody = await req.json();
    const parseResult = GetSharedPatientDataSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error('Validation error:', parseResult.error.flatten());
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parseResult.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { inviteCode } = parseResult.data;

    console.log('Looking up share with invite code');

    // Create Supabase client with service role for bypassing RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find the share by invite code
    const { data: share, error: shareError } = await supabaseAdmin
      .from('provider_shares')
      .select('*')
      .eq('invite_code', inviteCode)
      .eq('is_active', true)
      .maybeSingle();

    if (shareError) {
      console.error('Error fetching share:', shareError);
      return new Response(
        JSON.stringify({ error: 'Error looking up share' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!share) {
      console.log('Share not found or inactive');
      return new Response(
        JSON.stringify({ error: 'Invalid or expired share link' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if share has expired
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      console.log('Share has expired');
      return new Response(
        JSON.stringify({ error: 'This share link has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const permissions = share.permissions as SharePermissions;
    const userId = share.user_id;
    const result: Record<string, unknown> = {
      providerName: share.provider_name,
      permissions,
      sharedAt: share.created_at,
    };

    // Fetch patient profile if permitted
    if (permissions.profile) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('name, date_of_birth, gender, blood_type, height, allergies, health_conditions, emergency_contact_name, emergency_number')
        .eq('user_id', userId)
        .maybeSingle();
      
      result.profile = profile;
    } else {
      // Always get patient name for display
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('name')
        .eq('user_id', userId)
        .maybeSingle();
      
      result.patientName = profile?.name || 'Patient';
    }

    // Fetch vitals if permitted
    if (permissions.vitals) {
      const { data: vitals } = await supabaseAdmin
        .from('vitals')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(50);
      
      result.vitals = vitals || [];
    }

    // Fetch medications if permitted
    if (permissions.meds) {
      const { data: medications } = await supabaseAdmin
        .from('medications')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('name');
      
      result.medications = medications || [];
    }

    // Fetch schedule/adherence if permitted
    if (permissions.adherence) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: scheduleEntries } = await supabaseAdmin
        .from('schedule_entries')
        .select('*, medications(name, dosage)')
        .eq('user_id', userId)
        .gte('scheduled_time', thirtyDaysAgo.toISOString())
        .order('scheduled_time', { ascending: false });
      
      result.scheduleEntries = scheduleEntries || [];
      
      // Calculate adherence rate
      if (scheduleEntries && scheduleEntries.length > 0) {
        const taken = scheduleEntries.filter(e => e.status === 'taken').length;
        result.adherenceRate = Math.round((taken / scheduleEntries.length) * 100);
      }
    }

    // Update last accessed timestamp
    await supabaseAdmin
      .from('provider_shares')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', share.id);

    console.log('Successfully retrieved shared patient data');

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-shared-patient-data:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
