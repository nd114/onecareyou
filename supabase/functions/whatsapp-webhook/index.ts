// WhatsApp inbound webhook stub.
// No real transport configured yet — this endpoint logs incoming payloads
// and ACKs them. When we pick Twilio or 360dialog we'll parse here and write
// into the messages table with transport='whatsapp'.
//
// verify_jwt is set to false in supabase/config.toml because WhatsApp BSPs
// call this endpoint without our auth.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // BSPs often use GET for verification challenges (e.g. Meta hub.challenge).
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('hub.challenge');
    if (challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('ok', { status: 200 });
  }

  try {
    const body = await req.text();
    console.log('[whatsapp-webhook] inbound payload bytes:', body.length);
    // TODO: when a provider is selected, parse + insert into public.messages
    // with transport='whatsapp' and external_message_id set.
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    console.error('[whatsapp-webhook] error', e);
    return new Response(JSON.stringify({ error: 'bad_request' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
