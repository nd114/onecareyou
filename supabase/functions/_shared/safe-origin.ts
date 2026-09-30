/**
 * Return destinations (Stripe success/cancel/portal URLs) must point at our own
 * site. The request Origin header is caller-controlled, so it is only used when
 * it matches a known OneCare origin; otherwise the canonical site is used.
 */
const DEFAULT_ORIGIN = "https://onecare.you";

const ALLOWED = [
  /^https:\/\/(www\.|lmc\.)?onecare\.you$/,
  /^https:\/\/[a-z0-9-]+\.onecare\.you$/,
  /^https:\/\/onecareyou1011\.lovable\.app$/,
  /^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

export function safeOrigin(req: Request): string {
  const origin = (req.headers.get("origin") ?? "").trim().toLowerCase();
  return ALLOWED.some((re) => re.test(origin)) ? origin : DEFAULT_ORIGIN;
}
