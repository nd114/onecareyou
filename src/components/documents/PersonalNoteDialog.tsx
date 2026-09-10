import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RichTextEditor } from '@/components/notes/RichTextEditor';
import { usePersonalNotes, type PersonalNote } from '@/hooks/usePersonalNotes';
import { useDocumentFolders } from '@/hooks/useDocumentFolders';
import { todayDateOnly } from '@/lib/date-only';

/** Writing or editing a note of your own. */
export function PersonalNoteDialog({
  open,
  onOpenChange,
  note,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note?: PersonalNote | null;
}) {
  const { saveNote } = usePersonalNotes();
  const { folderNames } = useDocumentFolders();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [noteDate, setNoteDate] = useState(todayDateOnly());
  const [folder, setFolder] = useState('__none__');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? '');
    setBody(note?.body_html ?? '');
    setNoteDate(note?.note_date ?? todayDateOnly());
    setFolder(note?.folder ?? '__none__');
    setTags(note?.tags ?? []);
    setTagDraft('');
  }, [open, note]);

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t]);
    setTagDraft('');
  };

  const save = async () => {
    await saveNote.mutateAsync({
      id: note?.id,
      title: title.trim() || 'Personal note',
      bodyHtml: body,
      noteDate,
      folder: folder === '__none__' ? null : folder,
      tags,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{note ? 'Edit your note' : 'New personal note'}</DialogTitle>
          <DialogDescription>
            This is yours. It is labelled "Personal note" and is never included when you share
            your whole Vault.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="note-title" className="text-xs">Title</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Questions for my next appointment"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="note-date" className="text-xs">Date</Label>
              <Input
                id="note-date"
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
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
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Note</Label>
            <RichTextEditor value={body} onChange={setBody} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tags (optional)</Label>
            <div className="flex gap-2">
              <Input
                value={tagDraft}
                placeholder="e.g. sleep, questions"
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
                    <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saveNote.isPending || !title.trim()}>
            {saveNote.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
