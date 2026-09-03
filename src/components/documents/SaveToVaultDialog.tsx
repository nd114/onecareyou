import { useState } from "react";
import { Loader2, FolderPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_CATEGORIES,
  useHealthDocuments,
  type DocumentCategory,
} from "@/hooks/useHealthDocuments";

/**
 * Keeping something in the patient's own records.
 *
 * The point of the Vault is that the patient holds their own copy. A lab result
 * sent in a message lives in the messaging store under the conversation's
 * policies; if the conversation is archived or the share ends, it goes with it.
 * Saving makes a real copy in the patient's own storage, which nobody else's
 * decision can take away.
 *
 * Tags are theirs, in their words. The AI adds its own separately (`ai_tags`),
 * so a patient's "mum's cardiologist" is never overwritten by a machine's
 * "cardiology referral".
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Produces the file to save. Deferred so nothing is fetched until they commit. */
  getFile: () => Promise<File>;
  defaultTitle: string;
  defaultCategory?: DocumentCategory;
  defaultTags?: string[];
  /** Where it came from, for the audit trail and for "how did this get here?". */
  sourceContext?: string;
}

export function SaveToVaultDialog({
  open,
  onOpenChange,
  getFile,
  defaultTitle,
  defaultCategory = "other",
  defaultTags = [],
  sourceContext = "direct",
}: Props) {
  const { uploadDocument } = useHealthDocuments();
  const [title, setTitle] = useState(defaultTitle);
  const [category, setCategory] = useState<DocumentCategory>(defaultCategory);
  const [tags, setTags] = useState<string[]>(defaultTags);
  const [tagDraft, setTagDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    // Case-insensitive, because "Diabetes" and "diabetes" are one tag and
    // showing both is how a tag list stops being useful.
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t]);
    setTagDraft("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const file = await getFile();
      await uploadDocument.mutateAsync({
        file,
        title: title.trim() || defaultTitle,
        category,
        tags,
        sourceContext,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save that to your records");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-primary" /> Save to your records
          </DialogTitle>
          <DialogDescription>
            This keeps your own copy in your Health Vault. It stays there even if the
            conversation or the share it came from ends.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tags (optional)</Label>
            <div className="flex gap-2">
              <Input
                value={tagDraft}
                placeholder="e.g. kidney, Dr Nair"
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTag(); }
                }}
              />
              <Button type="button" variant="outline" onClick={addTag} disabled={!tagDraft.trim()}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 text-xs">
                    {t}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      aria-label={`Remove tag ${t}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Your words, for finding it later. Anything the assistant suggests is kept
              separately and never replaces these.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
