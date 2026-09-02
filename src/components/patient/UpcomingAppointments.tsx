import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";
import { CalendarClock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAppointments } from "@/hooks/useAppointments";

/**
 * The patient's side of scheduling.
 *
 * This is why the module earns its place: a visit booked by a clinician is
 * visible to the person being booked, without them having to ring anyone. Same
 * rows the clinician wrote, read back under the patient's own row policy.
 */
export function UpcomingAppointments() {
  const { appointments, isLoading } = useAppointments();

  const upcoming = appointments
    .filter((a) => a.start && new Date(a.start) >= new Date())
    .filter((a) => !["cancelled", "noshow", "entered-in-error"].includes(a.status))
    .slice(0, 3);

  // A patient with nothing booked should not be shown an empty box.
  if (isLoading || upcoming.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          Your next {upcoming.length === 1 ? "appointment" : "appointments"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {upcoming.map((a) => {
          const when = new Date(a.start as string);
          const relative = isToday(when)
            ? "Today"
            : isTomorrow(when)
              ? "Tomorrow"
              : `In ${formatDistanceToNowStrict(when, { unit: "day" })}`;
          return (
            <div key={a.id} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{format(when, "EEE d MMM, h:mm a")}</span>
                <Badge variant="secondary" className="text-[10px]">{relative}</Badge>
              </div>
              {a.description && <p className="text-sm mt-1">{a.description}</p>}
              {a.visitType && <p className="text-xs text-muted-foreground mt-0.5">{a.visitType}</p>}
              {a.locationText && (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {a.locationText}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
