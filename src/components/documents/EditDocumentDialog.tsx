import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DOCUMENT_CATEGORIES, useHealthDocuments,
  type DocumentCategory, type HealthDocument,
} from '@/hooks/useHealthDocuments';
import { useDocumentFolders } from '@/hooks/useDocumentFolders';

/**
 * Everything a document says about itself, in one place.
 *
 * Name, type, the date on the document (not the day it was uploaded), folder,
 * the patient's own tags and their notes. Anything the assistant suggested is
 * shown separately elsewhere and is never edited or overwritten here.
 */
export function EditDocumentDialog({
  document: doc,
  open,
  onOpenChange,
}: {
  document: HealthDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { updateDocument } = useHealthDocuments();
  const { folderNames } = useDocumentFolders();

  const [title, setTitle] = useState(doc.title ?? doc.file_name);
  const [category, setCategory] = useState<DocumentCategory>(doc.category);
  const [documentDate, setDocumentDate] = useState(doc.document_date ?? '');
  const [folder, setFolder] = useState<string>(doc.folder ?? '__none__');
  const [notes, setNotes] = useState(doc.notes ?? '');
  const [tags, setTags] = useState<string[]>(doc.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');

  // Reopening on a different document must not show the last one's details.
  useEffect(() => {
    if (!open) return;
    setTitle(doc.title ?? doc.file_name);
    setCategory(doc.category);
    setDocumentDate(doc.document_date ?? '');
    setFolder(doc.folder ?? '__none__');
    setNotes(doc.notes ?? '');
    setTags(doc.tags ?? []);
    setTagDraft('');
  }, [open, doc]);

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t]);
    setTagDraft('');
  };

  const save = async () => {
    await updateDocument.mutateAsync({
      id: doc.id,
      title: title.trim() || doc.file_name,
      category,
      document_date: documentDate || undefined,
      notes,
      tags,
      folder: folder === '__none__' ? null : folder,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>
            The file itself does not change — only what it is called and how it is filed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="edit-title" className="text-xs">Name</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
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

          <div className="space-y-1">
            <Label htmlFor="edit-date" className="text-xs">Date on the document</Label>
            <Input
              id="edit-date"
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Folder</Label>
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unfiled</SelectItem>
                {folderNames.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Your tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagDraft}
                placeholder="e.g. kidney, Dr Nair"
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
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
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-notes" className="text-xs">Notes</Label>
            <Textarea
              id="edit-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything you want to remember about this"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={updateDocument.isPending}>
            {updateDocument.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
