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
    await supabase.from('beta_events').insert({
      event_name: eventName.slice(0, 80),
      source,
      metadata: {
        ...metadata,
        path: window.location.pathname,
        referrer: document.referrer || null,
        utm_source: new URLSearchParams(window.location.search).get('utm_source'),
        utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
      },
    });
  } catch {
    /* ignore */
  }
}
