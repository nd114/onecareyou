import { useMemo, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAppointments } from "@/hooks/useAppointments";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const VISIT_TYPES = ["Follow-up", "New patient", "Annual review", "Acute", "Procedure", "Telehealth"];

export interface BookablePatient {
  userId: string;
  name: string;
  practiceId?: string | null;
}

interface Props {
  patients: BookablePatient[];
}

/**
 * Booking from the diary rather than from inside one patient.
 *
 * The row it writes is the same FHIR appointment the patient's own tab writes,
 * so nothing about access or history changes — the only new thing is being able
 * to start from "my week" instead of having to open the person first. Telling
 * the patient goes through the secure thread they already read, so it reaches
 * them by whichever channel their notification settings say.
 */
export function BookAppointmentDialog({ patients }: Props) {
  const { user } = useAuth();
  const { schedule } = useAppointments();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    patientUserId: "",
    date: "",
    time: "",
    minutes: "30",
    visitType: "Follow-up",
    note: "",
    location: "",
    tellPatient: true,
  });

  const sorted = useMemo(
    () => [...patients].sort((a, b) => a.name.localeCompare(b.name)),
    [patients],
  );
  const chosen = sorted.find((p) => p.userId === draft.patientUserId);
  const canSave = !!draft.patientUserId && !!draft.date && !!draft.time && !saving;

  const reset = () =>
    setDraft({
      patientUserId: "",
      date: "",
      time: "",
      minutes: "30",
      visitType: "Follow-up",
      note: "",
      location: "",
      tellPatient: true,
    });

  const handleBook = async () => {
    if (!chosen) return;
    setSaving(true);
    try {
      const start = new Date(`${draft.date}T${draft.time}`);
      const end = new Date(start.getTime() + Number(draft.minutes) * 60_000);
      await schedule.mutateAsync({
        patientUserId: chosen.userId,
        practiceId: chosen.practiceId ?? null,
        status: "booked",
        start: start.toISOString(),
        end: end.toISOString(),
        visitType: draft.visitType,
        description: draft.note || null,
        locationText: draft.location || null,
      });

      if (draft.tellPatient && user) {
        const when = start.toLocaleString(undefined, {
          weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
        });
        const body =
          `Your ${draft.visitType.toLowerCase()} appointment is booked for ${when}.` +
          (draft.location ? ` Where: ${draft.location}.` : "") +
          (draft.note ? ` ${draft.note}` : "");
        const { error } = await supabase.from("messages").insert({
          patient_user_id: chosen.userId,
          clinician_user_id: user.id,
          sender_user_id: user.id,
          body,
        });
        if (error) toast.error("Appointment booked, but the patient could not be notified");
      }

      setOpen(false);
      reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 flex-shrink-0">
          <CalendarPlus className="h-4 w-4" /> Book appointment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Book an appointment</DialogTitle>
          <DialogDescription>
            Pick one of your patients and a time. They see it in their own app straight away.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="book-patient">Patient</Label>
            <Select
              value={draft.patientUserId}
              onValueChange={(v) => setDraft({ ...draft, patientUserId: v })}
            >
              <SelectTrigger id="book-patient">
                <SelectValue placeholder="Choose a patient" />
              </SelectTrigger>
              <SelectContent>
                {sorted.length === 0 ? (
                  <SelectItem value="none" disabled>No patients yet</SelectItem>
                ) : (
                  sorted.map((p) => (
                    <SelectItem key={p.userId} value={p.userId}>{p.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="book-date">Date</Label>
              <Input id="book-date" type="date" value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-time">Time</Label>
              <Input id="book-time" type="time" value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="book-mins">Length</Label>
              <Select value={draft.minutes} onValueChange={(v) => setDraft({ ...draft, minutes: v })}>
                <SelectTrigger id="book-mins"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["15", "20", "30", "45", "60"].map((m) => (
                    <SelectItem key={m} value={m}>{m} minutes</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-type">Type</Label>
              <Select value={draft.visitType} onValueChange={(v) => setDraft({ ...draft, visitType: v })}>
                <SelectTrigger id="book-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VISIT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="book-location">Where (optional)</Label>
            <Input id="book-location" value={draft.location} placeholder="Clinic room 2, or a video link"
              onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="book-note">Note for the patient (optional)</Label>
            <Textarea id="book-note" rows={2} value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={draft.tellPatient}
              onCheckedChange={(c) => setDraft({ ...draft, tellPatient: c === true })}
              className="mt-0.5"
            />
            <span>
              Let the patient know
              <span className="block text-xs text-muted-foreground">
                Sends them a message, which reaches them the way they asked to be reached.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleBook} disabled={!canSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
