import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const CAL_API = 'https://api.cal.com/v2';
const APP_URL = 'https://onecare.you';

const BodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  clinicianRole: z.string().trim().max(80).optional(),
  practiceName: z.string().trim().max(160).optional(),
  country: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  slotStart: z.string().datetime({ offset: true }),
  timeZone: z.string().trim().min(1).max(64),
  ndaVersion: z.string().trim().min(1).max(20),
  signedName: z.string().trim().min(2).max(120),
  affirmed: z.literal(true),
  notes: z.string().trim().max(1000).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('CAL_API_KEY');
    const eventTypeId = Deno.env.get('CAL_EVENT_TYPE_ID');

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: 'Invalid submission', fields: parsed.error.flatten().fieldErrors }, 400);
    }
    const b = parsed.data;

    // Signature must match the booking name closely enough to be meaningful.
    if (b.signedName.toLowerCase().replace(/\s+/g, ' ') !== b.fullName.toLowerCase().replace(/\s+/g, ' ')) {
      return json({ error: 'The signature must match your full name exactly.' }, 400);
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      null;
    const userAgent = req.headers.get('user-agent');
    const signedAt = new Date().toISOString();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Tester record
    const { data: tester, error: testerError } = await supabase
      .from('beta_testers')
      .insert({
        full_name: b.fullName,
        email: b.email,
        clinician_role: b.clinicianRole ?? null,
        practice_name: b.practiceName ?? null,
        country: b.country ?? null,
        phone: b.phone ?? null,
        booking_status: 'pending',
      })
      .select('id')
      .single();

    if (testerError) {
      console.error('tester insert failed', testerError);
      return json({ error: 'Could not save your details' }, 500);
    }

    // 2. NDA signature — recorded BEFORE the booking is created.
    const ndaHash = [...new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${b.ndaVersion}|${b.signedName}|${b.email}|${signedAt}`),
      ),
    )]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');

    const { data: signature, error: sigError } = await supabase
      .from('beta_nda_signatures')
      .insert({
        tester_id: tester.id,
        signed_name: b.signedName,
        email: b.email,
        nda_version: b.ndaVersion,
        nda_hash: ndaHash,
        affirmed: true,
        signed_at: signedAt,
        ip_address: ip,
        user_agent: userAgent,
      })
      .select('id')
      .single();

    if (sigError) {
      console.error('signature insert failed', sigError);
      return json({ error: 'Could not record your signature' }, 500);
    }

    // 3. Mirror the booking into Cal.com when scheduling is connected. The
    //    curated beta slots are our source of truth, so a Cal.com hiccup must
    //    not invalidate an already-signed NDA — we still confirm and email.
    let bookingUid: string | null = null;
    let bookingStart = new Date(b.slotStart).toISOString();
    let bookingEnd: string | null = null;
    let meetingUrl: string | null = null;

    if (apiKey && eventTypeId) {
      try {
        const calRes = await fetch(`${CAL_API}/bookings`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'cal-api-version': '2024-08-13',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            start: bookingStart,
            eventTypeId: Number(eventTypeId),
            attendee: {
              name: b.fullName,
              email: b.email,
              timeZone: b.timeZone,
              language: 'en',
            },
            metadata: {
              ndaVersion: b.ndaVersion,
              ndaSignatureId: signature.id,
              source: 'beta-landing',
            },
            bookingFieldsResponses: {
              notes: [
                b.notes,
                `NDA v${b.ndaVersion} signed ${signedAt} by ${b.signedName}`,
                b.practiceName ? `Practice: ${b.practiceName}` : null,
                b.clinicianRole ? `Role: ${b.clinicianRole}` : null,
              ]
                .filter(Boolean)
                .join(' — '),
            },
          }),
        });

        const calBody = await calRes.text();
        if (!calRes.ok) {
          console.error(`Cal.com booking failed [${calRes.status}]: ${calBody}`);
        } else {
          const booking = JSON.parse(calBody)?.data ?? {};
          bookingUid = booking.uid ?? null;
          bookingStart = booking.start ?? bookingStart;
          bookingEnd = booking.end ?? null;
          meetingUrl = booking.meetingUrl ?? booking.location ?? null;
        }
      } catch (e) {
        console.error('Cal.com booking threw', e);
      }
    }

    await Promise.all([
      supabase
        .from('beta_testers')
        .update({
          booking_uid: bookingUid,
          booking_start: bookingStart,
          booking_end: bookingEnd,
          booking_status: 'confirmed',
        })
        .eq('id', tester.id),
      supabase.from('beta_nda_signatures').update({ booking_uid: bookingUid }).eq('id', signature.id),
      supabase.from('beta_events').insert({
        event_name: 'beta_booking_confirmed',
        source: 'beta-book',
        metadata: { booking_uid: bookingUid, calendar_synced: !!bookingUid },
      }),
    ]);

    // 4. Confirmation email from us, with a copy of what was signed.
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      const when = new Date(bookingStart).toLocaleString('en-GB', {
        timeZone: b.timeZone,
        dateStyle: 'full',
        timeStyle: 'short',
      });
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#12241c;max-width:560px">
          <h2 style="margin:0 0 16px">Your OneCare beta onboarding call is confirmed</h2>
          <p>Hi ${b.fullName.split(' ')[0]},</p>
          <p>Thanks for joining the OneCare beta programme. Your call is booked for:</p>
          <p style="font-size:18px;font-weight:bold">${when} (${b.timeZone})</p>
          ${meetingUrl ? `<p>Join link: <a href="${meetingUrl}">${meetingUrl}</a></p>` : ''}
          <p>A calendar invite is on its way, along with reminders 24 hours and 1 hour before the call.</p>
          <hr style="border:none;border-top:1px solid #e3e8e4;margin:24px 0" />
          <h3 style="margin:0 0 8px">Copy of what you signed</h3>
          <ul style="line-height:1.7">
            <li><strong>Document:</strong> OneCare Beta Programme Mutual NDA (version ${b.ndaVersion})</li>
            <li><strong>Signed name:</strong> ${b.signedName}</li>
            <li><strong>Signed at:</strong> ${signedAt} (UTC)</li>
            <li><strong>IP address:</strong> ${ip ?? 'not recorded'}</li>
            <li><strong>Reference:</strong> ${signature.id}</li>
          </ul>
          <p>Read the full agreement any time at <a href="${APP_URL}/beta/nda">${APP_URL}/beta/nda</a>.</p>
          <p style="color:#63736b;font-size:13px">Questions? Reply to this email or write to hello@onecare.you.</p>
        </div>`;

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'OneCare Beta <onboarding@resend.dev>',
          to: [b.email],
          subject: 'Your OneCare beta call is confirmed (+ your signed NDA)',
          html,
        }),
      });
      if (!emailRes.ok) console.error('confirmation email failed', await emailRes.text());
    }

    return json({
      bookingUid,
      start: bookingStart,
      end: bookingEnd,
      meetingUrl,
      signatureId: signature.id,
      signedAt,
    });
  } catch (e) {
    console.error('beta-book error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
