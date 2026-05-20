import type { WhatsAppProvider } from './provider';
import { noopWhatsAppProvider } from './noop-provider';

/**
 * Returns the active WhatsApp provider. Today there's only the no-op
 * implementation; once a transport is chosen (see
 * docs/whatsapp-integration-plan.md) we'll branch here on env or config.
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  return noopWhatsAppProvider;
}

export type { WhatsAppProvider, WhatsAppOutboundMessage, WhatsAppTemplateMessage, WhatsAppInbound } from './provider';
