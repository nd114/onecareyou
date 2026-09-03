import { useState } from "react";
import { Upload, Loader2, FolderUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DOCUMENT_CATEGORIES } from "@/hooks/useHealthDocuments";

interface Props {
  patientUserId: string;
  patientName: string;
}

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Hand the patient a document.
 *
 * A clinician who wrote a referral letter or a lab request had no way to give
 * it to the patient through the platform at all — health_documents accepted
 * inserts only from the account that owned the row, so the letter left by
 * email, which is the thing the Vault exists to replace.
 *
 * It lands in the patient's Vault and is theirs from that moment: they can read
 * it, file it, share it onward or delete it. The clinician can add and nothing
 * else — see the policies in 20260820100000.
 */
export function SendToVaultDialog({ patientUserId, patientName }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("referral");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setTitle("");
    setCategory("referral");
    setNotes("");
  };

  const handleSend = async () => {
    if (!file || !user) return;
    if (file.size > MAX_BYTES) {
      toast.error("That file is over 20 MB. Compress it or send a smaller version.");
      return;
    }
    setBusy(true);
    try {
      // The patient's own folder, because the file belongs to their Vault and
      // their storage policies key on the first path segment.
      const ext = file.name.split(".").pop();
      const path = `${patientUserId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("health-documents")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { error } = await supabase.from("health_documents").insert({
        user_id: patientUserId,
        uploaded_by_user_id: user.id,
        source_context: "clinician_upload",
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        title: title.trim() || file.name,
        category,
        notes: notes.trim() || null,
        document_date: new Date().toISOString().slice(0, 10),
        tags: [],
      });
      if (error) {
        // The row failed, so the object behind it is an orphan. Clear it rather
        // than leaving a file nobody has a record of.
        await supabase.storage.from("health-documents").remove([path]);
        throw error;
      }

      toast.success(`Sent to ${patientName}'s Vault`);
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Could not send the document");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <FolderUp className="h-3.5 w-3.5" />
          Send to Vault
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Send a document to {patientName}</DialogTitle>
          <DialogDescription>
            It goes into their Health Vault, labelled as coming from you. They can read it, file
            it and share it onward. You cannot edit or remove it afterwards, and you will only
            see it here again if they share their documents back with you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="vault-file">File</Label>
            <Input
              id="vault-file"
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
            <p className="text-xs text-muted-foreground">Up to 20 MB.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vault-title">Title</Label>
            <Input
              id="vault-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Referral — ophthalmology"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vault-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="vault-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* care_record is written by the managed-record flow and shown
                    as a permanent record; it is not something to upload here. */}
                {DOCUMENT_CATEGORIES.filter((c) => c.value !== 'care_record').map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vault-notes">A note for the patient (optional)</Label>
            <Textarea
              id="vault-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Take this to the eye clinic when you book."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={!file || busy} className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
