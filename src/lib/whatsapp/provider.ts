/**
 * Provider-agnostic WhatsApp interface.
 *
 * No real transport is wired up yet — see docs/whatsapp-integration-plan.md
 * for the Twilio vs 360dialog decision pending until beta feedback.
 * This interface lets us drop a real provider in without touching call sites.
 */

export interface WhatsAppOutboundMessage {
  to: string; // E.164 phone number
  body: string;
}

export interface WhatsAppTemplateMessage {
  to: string;
  templateName: string;
  language: string; // e.g. "en", "es", "pt_BR"
  variables: string[];
}

export interface WhatsAppInbound {
  from: string;
  body: string;
  externalId: string;
  receivedAt: Date;
}

export interface WhatsAppProvider {
  readonly name: string;
  sendMessage(msg: WhatsAppOutboundMessage): Promise<{ externalId: string } | { error: string }>;
  sendTemplate(msg: WhatsAppTemplateMessage): Promise<{ externalId: string } | { error: string }>;
  parseInboundWebhook(payload: unknown): WhatsAppInbound[];
}
