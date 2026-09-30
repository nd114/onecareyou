/**
 * Outbound FHIR requests go only to public HTTPS servers.
 *
 * A FHIR base URL is supplied by a clinician, so without this the function
 * would fetch whatever address it was handed: internal services, the cloud
 * metadata endpoint, localhost. We require HTTPS, refuse IP literals and
 * internal names, resolve the host and refuse any private/reserved address,
 * and never follow redirects (a redirect could point back inside).
 *
 * Operators who genuinely need a private EHR can list exact hostnames in the
 * EHR_ALLOWED_PRIVATE_HOSTS secret (comma-separated).
 */

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateV6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") ||
      v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff")) return true;
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

function allowedPrivateHosts(): Set<string> {
  return new Set(
    (Deno.env.get("EHR_ALLOWED_PRIVATE_HOSTS") ?? "")
      .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),
  );
}

/** Validates a FHIR base URL. Returns the normalised base (no trailing slash) or throws. */
export async function assertSafeFhirBaseUrl(raw: unknown): Promise<string> {
  let url: URL;
  try {
    url = new URL(String(raw ?? ""));
  } catch {
    throw new Error("Invalid FHIR server address");
  }
  if (url.protocol !== "https:") throw new Error("FHIR server must use https");
  if (url.username || url.password) throw new Error("FHIR server address must not contain credentials");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (allowedPrivateHosts().has(host)) return url.toString().replace(/\/+$/, "");

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    throw new Error("FHIR server must be addressed by hostname");
  }
  if (host === "localhost" || !host.includes(".") ||
      /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(host)) {
    throw new Error("FHIR server address is not public");
  }

  const addrs: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try { addrs.push(...(await Deno.resolveDns(host, type))); } catch { /* no records of this type */ }
  }
  if (addrs.length === 0) throw new Error("FHIR server address could not be resolved");
  for (const a of addrs) {
    if (a.includes(":") ? isPrivateV6(a) : isPrivateV4(a)) {
      throw new Error("FHIR server address is not public");
    }
  }
  return url.toString().replace(/\/+$/, "");
}

/** fetch() against a validated FHIR base; never follows redirects. */
export async function safeFhirFetch(base: string, path: string, init: RequestInit = {}): Promise<Response> {
  const safeBase = await assertSafeFhirBaseUrl(base);
  return fetch(`${safeBase}${path}`, { ...init, redirect: "manual" });
}
