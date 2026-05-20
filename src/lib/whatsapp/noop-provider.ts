import type {
  WhatsAppProvider,
  WhatsAppOutboundMessage,
  WhatsAppTemplateMessage,
  WhatsAppInbound,
} from './provider';

/**
 * No-op WhatsApp provider used until a real transport is wired up.
 * Logs the call shape so we can sanity-check downstream code in dev.
 */
export const noopWhatsAppProvider: WhatsAppProvider = {
  name: 'noop',

  async sendMessage(msg: WhatsAppOutboundMessage) {
    console.info('[whatsapp:noop] sendMessage', msg);
    return { externalId: `noop_${Date.now()}` };
  },

  async sendTemplate(msg: WhatsAppTemplateMessage) {
    console.info('[whatsapp:noop] sendTemplate', msg);
    return { externalId: `noop_tpl_${Date.now()}` };
  },

  parseInboundWebhook(_payload: unknown): WhatsAppInbound[] {
    return [];
  },
};
