import { useState } from 'react';
import { Archive, ArchiveRestore, Calendar, Folder, NotebookPen, Pencil, Tag, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { NoteBody } from '@/components/notes/RichTextEditor';
import { PersonalNoteDialog } from '@/components/documents/PersonalNoteDialog';
import { usePersonalNotes, type PersonalNote } from '@/hooks/usePersonalNotes';
import { formatDateOnly } from '@/lib/date-only';

/** A note the patient wrote, always labelled as theirs. */
export function PersonalNoteCard({ note }: { note: PersonalNote }) {
  const { archiveNote, deleteNote } = usePersonalNotes();
  const [editing, setEditing] = useState(false);
  const isArchived = Boolean(note.archived_at);

  return (
    <>
      <Card className="group hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
              <NotebookPen className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium text-sm truncate">{note.title}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-xs">Personal note</Badge>
                    {note.folder && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-1">
                        <Folder className="h-2.5 w-2.5" />
                        {note.folder}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDateOnly(note.note_date, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={isArchived ? 'Restore' : 'Archive'}
                    onClick={() => archiveNote.mutate({ id: note.id, archived: !isArchived })}
                  >
                    {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                        <AlertDialogDescription>
                          "{note.title}" is yours, so it can be removed for good. This cannot be undone —
                          archive it instead if you only want it out of the way.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteNote.mutate(note.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {note.body_html && (
                <div className="mt-2 max-h-40 overflow-hidden text-muted-foreground">
                  <NoteBody html={note.body_html} />
                </div>
              )}

              {note.tags.length > 0 && (
                <div className="mt-2 flex items-center gap-1 flex-wrap">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  {note.tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px] h-5">{t}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <PersonalNoteDialog open={editing} onOpenChange={setEditing} note={note} />
    </>
  );
}
