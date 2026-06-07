// Phase 2.5 — Create a referral for a patient.
import { useState, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReferrals } from "@/hooks/useReferrals";

interface Props {
  patientUserId: string;
  trigger: ReactNode;
}

export function ReferralDialog({ patientUserId, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [reason, setReason] = useState("");
  const [urgency, setUrgency] = useState<"routine" | "urgent" | "stat">("routine");
  const [notes, setNotes] = useState("");
  const { create } = useReferrals(patientUserId);

  const reset = () => {
    setToName(""); setToEmail(""); setSpecialty(""); setReason(""); setUrgency("routine"); setNotes("");
  };

  const submit = () => {
    if (!reason.trim()) return;
    create.mutate(
      { patientUserId, toName, toEmail, specialty, reason, urgency, notes },
      { onSuccess: () => { reset(); setOpen(false); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New referral</DialogTitle>
          <DialogDescription>
            Refer this patient to another clinician. They'll receive an email if outside OneCare.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ref-name">Recipient name</Label>
              <Input id="ref-name" value={toName} onChange={(e) => setToName(e.target.value)} placeholder="Dr. Jane Smith" />
            </div>
            <div>
              <Label htmlFor="ref-email">Recipient email</Label>
              <Input id="ref-email" type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="jane@clinic.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ref-specialty">Specialty</Label>
              <Input id="ref-specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Cardiology" />
            </div>
            <div>
              <Label>Urgency</Label>
              <Select value={urgency} onValueChange={(v: any) => setUrgency(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="stat">STAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="ref-reason">Reason *</Label>
            <Input id="ref-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Suspected AFib, needs echo" />
          </div>
          <div>
            <Label htmlFor="ref-notes">Additional notes</Label>
            <Textarea id="ref-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!reason.trim() || create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send referral
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
