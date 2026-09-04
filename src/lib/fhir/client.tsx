import { MedplumClient } from "@medplum/core";
import { MedplumProvider } from "@medplum/react-hooks";
import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { createFhirFetch } from "@/lib/fhir/repository";

/**
 * Medplum's own client, pointed at our database.
 *
 * `MedplumClient` takes a custom `fetch`, and `createFhirFetch` is a `fetch`
 * that serves FHIR out of Supabase through Medplum's router. So their hooks —
 * `useResource`, `useSearchResources`, `useMedplum` — work against our tables
 * with no Medplum server anywhere. Everything still goes through the
 * signed-in user's JWT, so RLS decides what comes back, exactly as it does for
 * every other read in the app.
 *
 * ## `@medplum/react-hooks`, not `@medplum/react`
 *
 * Checked rather than assumed: `@medplum/react-hooks` peer-depends on `react`
 * and `@medplum/core` and nothing else. `@medplum/react` pulls in four Mantine
 * packages plus `jsqr` and `signature_pad` — a second design system beside the
 * one this product deliberately built. The data layer is worth having; the
 * components are not.
 *
 * ## Where the line is
 *
 * These hooks keep their own cache, and the rest of the app is on react-query.
 * Two caches that cannot invalidate each other is a real cost, so the rule is
 * narrow and worth stating: **Medplum's hooks are for resources the FHIR
 * repository actually serves** — Appointment today. Anything read straight
 * from a Supabase table stays on react-query. A resource read through both
 * would be a resource that can show two different answers on the same screen.
 */

let cached: MedplumClient | undefined;

/**
 * One client for the app.
 *
 * Its cache is keyed by URL, so a second instance would mean a second cache
 * and a stale read after a write made through the first.
 */
export function getFhirClient(): MedplumClient {
  if (!cached) {
    cached = new MedplumClient({
      baseUrl: "https://local/",
      fetch: createFhirFetch(supabase) as never,
    });
  }
  return cached;
}

/** Only for tests, which need a client per case rather than a shared one. */
export function resetFhirClient(): void {
  cached = undefined;
}

export function FhirProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const medplum = useMemo(() => getFhirClient(), []);
  return (
    <MedplumProvider medplum={medplum} navigate={(path) => navigate(path)}>
      {children}
    </MedplumProvider>
  );
}
