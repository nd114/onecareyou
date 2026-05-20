// Scheduled function: re-seed the demo patient + clinician accounts daily
// so beta testers always see recent activity (last 7-30 days), not data
// from three months ago. Delegates to the existing seed-demo-data function.
//
// Triggered by pg_cron daily at 03:00 UTC.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/seed-demo-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ source: 'reset-demo-accounts', refresh: true }),
    });
    const text = await res.text();
    console.log('[reset-demo-accounts] seed result', res.status, text.slice(0, 500));
    return new Response(JSON.stringify({ ok: res.ok, status: res.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    console.error('[reset-demo-accounts] error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
