import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * Beta onboarding-call availability.
 *
 * The beta cohort is offered a small, curated set of call slots rather than a
 * rolling calendar. Keep this list in sync with src/lib/beta-config.ts.
 * 10:00 EDT (UTC-4) on each date.
 */
const FIXED_SLOTS = [
  '2026-08-08T14:00:00Z',
  '2026-08-15T14:00:00Z',
  '2026-08-22T14:00:00Z',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const timeZone = (url.searchParams.get('timeZone') || 'UTC').slice(0, 64);

    // Group each slot under its calendar day *in the viewer's timezone* so the
    // day tabs on the booking page line up with the times shown inside them.
    const dayFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const now = Date.now();
    const slots: Record<string, { start: string }[]> = {};

    for (const iso of FIXED_SLOTS) {
      const date = new Date(iso);
      if (date.getTime() <= now) continue; // never offer a slot in the past
      const day = dayFormatter.format(date); // YYYY-MM-DD
      (slots[day] ??= []).push({ start: iso });
    }

    return new Response(JSON.stringify({ slots, timeZone }), {
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
