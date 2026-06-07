// Phase 2.4 — Internal practice notes UI (per patient, clinician-only).
import { useState } from "react";
import { Pin, PinOff, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useInternalNotes } from "@/hooks/useInternalNotes";
import { formatDistanceToNow } from "date-fns";

interface Props {
  patientUserId: string;
}

export function InternalNotesTab({ patientUserId }: Props) {
  const { data: notes = [], isLoading, create, togglePin, remove } = useInternalNotes(patientUserId);
  const [body, setBody] = useState("");

  const onAdd = () => {
    if (!body.trim()) return;
    create.mutate(body.trim(), { onSuccess: () => setBody("") });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Internal notes</CardTitle>
        <CardDescription>
          Private to your practice team — not shared with the patient.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add an internal note (visible only to clinicians with access)…"
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
          <div className="text-sm text-muted-foreground">No internal notes yet.</div>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm whitespace-pre-wrap flex-1">{n.body}</p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => togglePin.mutate({ id: n.id, pinned: !n.pinned })}
                      title={n.pinned ? "Unpin" : "Pin"}
                    >
                      {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove.mutate(n.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  {n.pinned && " · pinned"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
