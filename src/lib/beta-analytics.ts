import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Fire-and-forget analytics for the beta funnel.
 * Sends to GA/dataLayer when present and always records a first-party event row.
 */
export async function trackBetaEvent(
  eventName: string,
  metadata: Record<string, unknown> = {},
  source = 'beta-landing',
) {
  try {
    window.gtag?.('event', eventName, metadata);
    window.dataLayer?.push({ event: eventName, ...metadata });
  } catch {
    /* analytics must never break the UI */
  }

  try {
    const params = new URLSearchParams(window.location.search);
    // The database only accepts a small, well-formed payload, so normalise here.
    const clip = (v: string | null, max = 200) => (v ? v.slice(0, max) : null);
    let metadataPayload: Record<string, unknown> = {
      ...metadata,
      path: clip(window.location.pathname),
      referrer: clip(document.referrer || null),
      utm_source: clip(params.get('utm_source'), 80),
      utm_campaign: clip(params.get('utm_campaign'), 80),
    };
    if (JSON.stringify(metadataPayload).length > 1800) {
      metadataPayload = { path: clip(window.location.pathname) };
    }

    await supabase.from('beta_events').insert({
      event_name: eventName.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 80),
      source,
      metadata: metadataPayload as never,
    });
  } catch {
    /* ignore */
  }
}
