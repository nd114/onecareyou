import { Loader2 } from "lucide-react";
import { CapabilityDenied } from "@/components/clinician/CapabilityDenied";
import { useClinicianCapabilities, type PracticeCapability } from "@/hooks/useClinicianCapabilities";

/**
 * One place that decides whether a member of a practice may open a screen.
 *
 * The database already refuses the underlying reads and writes, so this is not
 * the security boundary — it is honesty. A receptionist who opens Invoices and
 * sees an empty list concludes the product is broken; a receptionist who is
 * never shown the tab concludes, correctly, that it is not their job.
 *
 * Somebody who types the address anyway gets told so in a sentence. Silently
 * dropping them back on Today looked like the click had failed.
 *
 * A clinician with no practice is the owner of their own workspace and holds
 * every capability, so this never blocks a solo clinician.
 */
export function RequireCapability({
  capability,
  anyOf,
  children,
}: {
  capability?: PracticeCapability;
  /** Either of these is enough — some screens serve two different jobs. */
  anyOf?: PracticeCapability[];
  children: React.ReactNode;
}) {
  const { can, loading } = useClinicianCapabilities();

  // Deciding before the answer is known would bounce people out of screens
  // they are entitled to, on every page load.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const wanted = anyOf ?? (capability ? [capability] : []);
  const allowed = wanted.length === 0 || wanted.some((c) => can(c));

  if (!allowed) return <CapabilityDenied />;

  return <>{children}</>;
}
