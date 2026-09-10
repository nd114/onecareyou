import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { ClinicianHeader } from "@/components/clinician/ClinicianHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * What somebody sees when they open a screen their role does not include.
 *
 * Previously every one of these silently redirected to Today, which reads as a
 * click that failed rather than an answer. Saying it plainly is kinder, and it
 * stops people re-trying the same link.
 */
export function CapabilityDenied({
  what = "This screen",
}: {
  /** What they tried to open, in words, e.g. "Compliance". */
  what?: string;
}) {
  return (
    <div className="min-h-screen bg-muted/30">
      <ClinicianHeader />
      <main className="container max-w-xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Not part of your role
            </CardTitle>
            <CardDescription>
              {what} belongs to another role at your hospital, so it is not open to you. Nothing has
              gone wrong — ask whoever runs the hospital if you need it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link to="/clinician/today">Back to Today</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
