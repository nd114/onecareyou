import { useState } from "react";
import { format } from "date-fns";
import { FilePlus2, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useEncounterAddenda } from "@/hooks/useEncounterAddenda";

/**
 * The addenda on a signed note, and the way to add one.
 *
 * Shown only once a note is signed, because before that the note itself is the
 * place to make a change. After signing, the database refuses edits — so this is
 * not a stylistic preference the UI is expressing, it is the only route there
 * is, and saying so plainly is more useful than a disabled field with no
 * explanation.
 */
export function EncounterAddenda({
  encounterId,
  signedAt,
}: {
  encounterId: string;
  signedAt: string | null;
}) {
  const { user } = useAuth();
  const { addenda, isLoading, add } = useEncounterAddenda(encounterId);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  if (!signedAt) return null;

  const submit = async () => {
    await add.mutateAsync(draft);
    setDraft("");
    setOpen(false);
  };

  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Lock className="h-3 w-3" />
        Signed {format(new Date(signedAt), "d MMM yyyy")} — the note itself can no longer be
        changed. Corrections go below, attributed and dated.
      </p>

      {isLoading ? null : addenda.length > 0 ? (
        <div className="space-y-2">
          {addenda.map((a) => (
            <div key={a.id} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm whitespace-pre-wrap">{a.body}</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                Addendum · {format(new Date(a.created_at), "d MMM yyyy, h:mm a")}
                {a.author_user_id === user?.id ? " · you" : ""}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            autoFocus
            placeholder="What needs correcting or adding, and why."
          />
          <p className="text-xs text-muted-foreground">
            This is permanent. An addendum cannot be edited or removed once saved — a later
            one corrects it.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={!draft.trim() || add.isPending}>
              {add.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Save addendum
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setOpen(false); setDraft(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
          <FilePlus2 className="h-3.5 w-3.5" /> Add addendum
        </Button>
      )}
    </div>
  );
}
