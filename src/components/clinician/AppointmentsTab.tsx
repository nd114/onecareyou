import { useState } from "react";
import { format, isPast } from "date-fns";
import { CalendarPlus, Loader2, CalendarClock, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAppointments } from "@/hooks/useAppointments";
import type { AppointmentStatus } from "@/lib/fhir/appointment";
import { cn } from "@/lib/utils";

interface Props {
  patientUserId: string;
  patientName: string;
  practiceId?: string | null;
}

const VISIT_TYPES = ["Follow-up", "New patient", "Annual review", "Acute", "Procedure", "Telehealth"];

/** FHIR statuses, in the words a clinic uses for them. */
const STATUS_LABEL: Partial<Record<AppointmentStatus, string>> = {
  proposed: "Proposed",
  booked: "Booked",
  arrived: "Arrived",
  fulfilled: "Completed",
  cancelled: "Cancelled",
  noshow: "Did not attend",
  waitlist: "Waiting list",
};

const STATUS_STYLE: Partial<Record<AppointmentStatus, string>> = {
  booked: "bg-primary/10 text-primary border-primary/20",
  arrived: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  fulfilled: "bg-status-success/10 text-status-success border-status-success/20",
  cancelled: "bg-muted text-muted-foreground",
  noshow: "bg-severity-high/10 text-severity-high border-severity-high/20",
};

/**
 * Scheduling for one patient.
 *
 * Every row here is a FHIR Appointment, stored in our own Postgres behind the
 * same row policies as the rest of the record. The full FHIR check runs in the
 * tests and server-side, not in the browser — see src/lib/fhir/validate.ts —
 * and the database refuses anything FHIR would reject. Cancelling sets a status
 * rather than deleting: a missed appointment is part of the history, and the
 * table grants no DELETE.
 */
export function AppointmentsTab({ patientUserId, patientName, practiceId }: Props) {
  const { appointments, isLoading, schedule, setStatus } = useAppointments(patientUserId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    date: "",
    time: "",
    minutes: "30",
    visitType: "Follow-up",
    description: "",
    location: "",
  });

  const canSave = draft.date && draft.time;

  const handleSchedule = async () => {
    const start = new Date(`${draft.date}T${draft.time}`);
    const end = new Date(start.getTime() + Number(draft.minutes) * 60_000);
    await schedule.mutateAsync({
      patientUserId,
      practiceId: practiceId ?? null,
      status: "booked",
      start: start.toISOString(),
      end: end.toISOString(),
      visitType: draft.visitType,
      description: draft.description || null,
      locationText: draft.location || null,
    });
    setOpen(false);
    setDraft({ date: "", time: "", minutes: "30", visitType: "Follow-up", description: "", location: "" });
  };

  const upcoming = appointments.filter((a) => !a.start || !isPast(new Date(a.start)));
  const past = appointments.filter((a) => a.start && isPast(new Date(a.start)));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Appointments</CardTitle>
          <CardDescription>
            {patientName} sees these in their own app, so a change here is a change they see.
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1 flex-shrink-0">
              <CalendarPlus className="h-4 w-4" /> Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle>Schedule a visit</DialogTitle>
              <DialogDescription>For {patientName}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="appt-date">Date</Label>
                  <Input id="appt-date" type="date" value={draft.date}
                    onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appt-time">Time</Label>
                  <Input id="appt-time" type="time" value={draft.time}
                    onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="appt-mins">Length</Label>
                  <Select value={draft.minutes} onValueChange={(v) => setDraft({ ...draft, minutes: v })}>
                    <SelectTrigger id="appt-mins"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["15", "20", "30", "45", "60"].map((m) => (
                        <SelectItem key={m} value={m}>{m} minutes</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appt-type">Type</Label>
                  <Select value={draft.visitType} onValueChange={(v) => setDraft({ ...draft, visitType: v })}>
                    <SelectTrigger id="appt-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VISIT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="appt-loc">Where (optional)</Label>
                <Input id="appt-loc" value={draft.location} placeholder="Clinic B, second floor"
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appt-desc">What it is for (optional)</Label>
                <Input id="appt-desc" value={draft.description} placeholder="Six-month diabetes review"
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSchedule} disabled={!canSave || schedule.isPending}>
                {schedule.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : appointments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nothing scheduled. A visit booked here appears in {patientName}'s app straight away.
          </p>
        ) : (
          <>
            <Section title="Upcoming" rows={upcoming} onStatus={setStatus.mutate} empty="Nothing upcoming." />
            {past.length > 0 && (
              <Section title="Past" rows={past} onStatus={setStatus.mutate} empty="" muted />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title, rows, onStatus, empty, muted = false,
}: {
  title: string;
  rows: ReturnType<typeof useAppointments>["appointments"];
  onStatus: (v: { id: string; status: AppointmentStatus }) => void;
  empty: string;
  muted?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null
      ) : (
        rows.map((a) => (
          <div key={a.id} className={cn("rounded-lg border p-3", muted && "opacity-70")}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {a.start ? format(new Date(a.start), "EEE d MMM, h:mm a") : "Not yet scheduled"}
                  </span>
                  <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLE[a.status])}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </Badge>
                  {a.visitType && (
                    <span className="text-xs text-muted-foreground">{a.visitType}</span>
                  )}
                </div>
                {a.description && <p className="text-sm mt-1">{a.description}</p>}
                {a.locationText && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {a.locationText}
                  </p>
                )}
              </div>
              {/* Cancelling is a status change: the table grants no DELETE,
                  because a missed appointment is part of the record. */}
              {["booked", "arrived", "proposed"].includes(a.status) && (
                <div className="flex gap-1 flex-shrink-0">
                  {a.status === "booked" && (
                    <Button variant="ghost" size="sm" className="text-xs"
                      onClick={() => onStatus({ id: a.id, status: "arrived" })}>
                      Arrived
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-xs"
                    onClick={() => onStatus({ id: a.id, status: "fulfilled" })}>
                    Completed
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground"
                    onClick={() => onStatus({ id: a.id, status: "cancelled" })}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
