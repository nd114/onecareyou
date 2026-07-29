import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const CAL_API = 'https://api.cal.com/v2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('CAL_API_KEY');
    const eventTypeId = Deno.env.get('CAL_EVENT_TYPE_ID');
    if (!apiKey || !eventTypeId) {
      return new Response(JSON.stringify({ error: 'Scheduling is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const timeZone = (url.searchParams.get('timeZone') || 'UTC').slice(0, 64);
    const days = Math.min(Math.max(Number(url.searchParams.get('days') || 14), 1), 30);

    const start = new Date();
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      eventTypeId,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      timeZone,
    });

    const res = await fetch(`${CAL_API}/slots?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'cal-api-version': '2024-09-04',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Cal.com slots failed [${res.status}]: ${body}`);
      return new Response(
        JSON.stringify({ error: 'Could not load available times', status: res.status, details: body }),
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const json = await res.json();
    return new Response(JSON.stringify({ slots: json.data ?? {}, timeZone }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('beta-slots error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
