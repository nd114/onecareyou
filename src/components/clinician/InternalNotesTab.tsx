import { useEffect, useState } from "react";
import { Check, Pencil, Pin, PinOff, Trash2, Loader2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useInternalNotes, type NoteVisibility } from "@/hooks/useInternalNotes";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface Props {
  patientUserId: string;
  /** 'team' — anyone with access reads it. 'private' — only the author. */
  visibility?: NoteVisibility;
}

const COPY = {
  team: {
    title: "Team notes",
    description: "Anyone caring for this patient can read these. The patient cannot.",
    placeholder: "Add a note for the care team…",
    empty: "No team notes yet.",
  },
  private: {
    title: "My notes",
    description: "Only you can read these — not the patient, and not colleagues.",
    placeholder: "Add a note only you will see…",
    empty: "No notes of your own yet.",
  },
} as const;

/**
 * One notes surface, used for both kinds.
 *
 * The patient record had two of these with nothing in their names to say who
 * each was for — "Notes" and "Internal" — and the private one was a single
 * block of text you rewrote wholesale, so a fortnight of observations had no
 * dates and no way to change one line. Both are entries now, and the titles say
 * who can read them, which is the only difference that matters.
 */
export function InternalNotesTab({ patientUserId, visibility = "team" }: Props) {
  const { data: notes = [], isLoading, create, update, togglePin, remove } =
    useInternalNotes(patientUserId, visibility);
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [meId, setMeId] = useState<string | null>(null);
  const copy = COPY[visibility];

  // Who is reading, so a colleague's note is not offered an edit button it
  // would fail on at the row policy anyway.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  const onAdd = () => {
    if (!body.trim()) return;
    create.mutate(body.trim(), { onSuccess: () => setBody("") });
  };

  const onSaveEdit = (id: string) => {
    if (!draft.trim()) return;
    update.mutate({ id, body: draft.trim() }, { onSuccess: () => setEditingId(null) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={copy.placeholder}
            rows={3}
          />
          <div className="flex justify-end">
            <Button onClick={onAdd} disabled={!body.trim() || create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add note
            </Button>
          </div>
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="text-sm text-muted-foreground">{copy.empty}</div>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => {
              const mine = n.author_user_id === meId;
              return (
              <li key={n.id} className="rounded-md border bg-muted/30 p-3">
                {editingId === n.id ? (
                  <div className="space-y-2">
                    <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5 mr-1" />
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => onSaveEdit(n.id)} disabled={!draft.trim()}>
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm whitespace-pre-wrap flex-1">{n.body}</p>
                    <div className="flex items-center gap-1">
                      {/* Amending an entry, which neither surface had — correcting
                          a typo used to mean deleting the note and its date. Only
                          on your own: a colleague's note is theirs to correct. */}
                      {mine && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setEditingId(n.id); setDraft(n.body); }}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => togglePin.mutate({ id: n.id, pinned: !n.pinned })}
                        title={n.pinned ? "Unpin" : "Pin"}
                      >
                        {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </Button>
                      {mine && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove.mutate(n.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-1 text-xs text-muted-foreground">
                  {/* An observation you cannot attribute is one you cannot
                      weigh, so a shared note leads with who wrote it. */}
                  {visibility === "team" && (
                    <>{mine ? "You" : n.author_name ?? "A colleague"} · </>
                  )}
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  {n.updated_at && n.updated_at !== n.created_at && " · edited"}
                  {n.pinned && " · pinned"}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
