# WhatsApp Integration Plan

> Status: **scaffolded, no transport yet.** Provider-agnostic interface lives at
> `src/lib/whatsapp/`. Inbound webhook stub at `supabase/functions/whatsapp-webhook/`.
> Decision pending until beta feedback from Nigeria + LATAM testers.

## Why WhatsApp

- In Nigeria, LATAM, and much of SE Asia, WhatsApp is the de-facto patient–clinician channel.
- Patients already trust it. Asking them to "open the app" is friction. Meeting them on WhatsApp removes that friction while we own the data layer underneath.
- Messages are dramatically cheaper than SMS (NGN: ~₦5–10 per WhatsApp vs ₦15–40 SMS).

## Three integration tiers

| Tier | What it does | Effort | When |
|------|--------------|--------|------|
| 1. Outbound notifications | OneCare sends adherence nudges, lab results, guidance via approved templates. | Low | First post-beta milestone |
| 2. Inbound capture | Patients message a clinician's WhatsApp Business number → lands in OneCare Messages inbox; attachments route to Health Vault. | Medium | After clinician pilot |
| 3. Two-way structured | "Did you take your 8am Metformin? Reply YES/NO" auto-logs adherence. | Medium-high | After tier 2 proven |

## Provider comparison (decision deferred)

### Twilio WhatsApp Business API
- **Pros**: easiest setup, single account works globally, good docs, Meta-approved BSP, sandbox available immediately for dev.
- **Cons**: pricier per message at scale (~$0.005–0.08 depending on country); Twilio adds a per-message fee on top of Meta's conversation fee.
- **Best for**: shipping fast, low-to-mid volume, MVP validation.

### 360dialog (direct Meta BSP)
- **Pros**: cheapest per message at scale (charges Meta's wholesale rate + flat monthly fee per number); strong in EMEA + LATAM; direct Meta partner.
- **Cons**: per-practice setup is heavier; less mature SDK; minimum monthly commitment.
- **Best for**: post-pilot, when we have predictable volume and per-practice numbers.

### Recommendation
Start with **Twilio sandbox** during the pilot for outbound only. Migrate to 360dialog once volume justifies the flat fee — break-even is roughly 1,500 conversations/month per number.

## Architecture (already in place)

```
src/lib/whatsapp/
├── provider.ts          # WhatsAppProvider interface
├── noop-provider.ts     # default; logs only
└── index.ts             # getWhatsAppProvider() — branch here on env

supabase/functions/whatsapp-webhook/
└── index.ts             # POST handler stub; ACKs and logs

DB:
public.messages.transport            TEXT default 'in-app'  -- {'in-app','whatsapp'}
public.messages.external_message_id  TEXT                   -- BSP message id (indexed)
```

When a provider is picked, only three files change:
1. New `src/lib/whatsapp/twilio-provider.ts` (or `360-provider.ts`) implementing `WhatsAppProvider`.
2. `getWhatsAppProvider()` returns the new one when `WHATSAPP_PROVIDER` env is set.
3. `whatsapp-webhook` parses payload via the provider's `parseInboundWebhook` and inserts into `messages` with `transport='whatsapp'` and `external_message_id`.

## Open questions for beta testers

- Do clinicians want their own WhatsApp Business number or share a OneCare-managed pool?
- For inbound, do we proxy through OneCare's number (cheaper, less trust) or each clinician's number (trust, more setup)?
- Which countries should we whitelist first based on Meta's regional pricing?

## Compliance notes

- WhatsApp Business API is **not** HIPAA-compliant out of the box. For US clinicians, we must:
  - Sign a BAA with Twilio (available on their Health plan).
  - Avoid PHI in free-form messages; use template messages with placeholders only.
  - Document this in the BAA appendix.
- For Nigeria / LATAM the bar is lower; standard Meta + BSP terms suffice.
