import { useMemo, useState } from 'react';
import { Copy, Eye, KeyRound, Link2, Loader2, Lock, Plus, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Panel, PanelEmpty, PanelHeader, PanelRow, PanelRows } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDay, formatDayTime } from '@/lib/format-date';
import {
  EXPIRY_OPTIONS,
  MAX_SNAPSHOT_DOCUMENTS,
  SNAPSHOT_CATEGORIES,
  buildSnapshotUrl,
  categoryLabel,
  describeContents,
  snapshotLinkState,
  type SnapshotCategory,
} from '@/lib/snapshot-links';
import {
  useShareableDocuments,
  useSnapshotLinks,
  type CreatedSnapshotLink,
} from '@/hooks/useSnapshotLinks';

const STATE_BADGE = {
  active: { label: 'Live', variant: 'secondary' as const },
  expired: { label: 'Expired', variant: 'outline' as const },
  revoked: { label: 'Revoked', variant: 'outline' as const },
  locked: { label: 'Locked — too many wrong passcodes', variant: 'destructive' as const },
};

const EMPTY_FORM = {
  categories: [] as SnapshotCategory[],
  documentIds: [] as string[],
  expiresInHours: 24 * 7,
  withPasscode: false,
  label: '',
};

/**
 * A read-only link a patient sends to somebody who has no OneCare account.
 *
 * Separate from the clinician and hospital shares above it on purpose: this
 * creates no relationship, the viewer cannot reply or claim anything, and
 * what they see is a copy frozen when the link was made.
 */
export function SnapshotLinksCard() {
  const { links, isLoading, create, revoke } = useSnapshotLinks();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [created, setCreated] = useState<CreatedSnapshotLink | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<{ id: string; name: string } | null>(null);

  const wantsDocuments = form.categories.includes('documents');
  const { data: documents = [], isLoading: docsLoading } = useShareableDocuments(open && wantsDocuments);

  const expiresPreview = useMemo(
    () => new Date(Date.now() + form.expiresInHours * 3_600_000),
    // Recomputed when the choice changes; close enough to what the server sets.
    [form.expiresInHours],
  );

  const canCreate =
    form.categories.length > 0 && (!wantsDocuments || form.documentIds.length > 0) && !create.isPending;

  const toggleCategory = (key: SnapshotCategory, on: boolean) =>
    setForm((f) => ({
      ...f,
      categories: on ? [...f.categories, key] : f.categories.filter((c) => c !== key),
      documentIds: key === 'documents' && !on ? [] : f.documentIds,
    }));

  const toggleDocument = (id: string, on: boolean) =>
    setForm((f) => {
      if (on && f.documentIds.length >= MAX_SNAPSHOT_DOCUMENTS) {
        toast.error(`A link can include up to ${MAX_SNAPSHOT_DOCUMENTS} documents`);
        return f;
      }
      return { ...f, documentIds: on ? [...f.documentIds, id] : f.documentIds.filter((d) => d !== id) };
    });

  const close = () => {
    setOpen(false);
    // The token exists only in this state; once the dialog closes it is gone
    // for good, which is what "shown once" means.
    setCreated(null);
    setForm(EMPTY_FORM);
  };

  const handleCreate = () => {
    create.mutate(
      {
        categories: form.categories,
        documentIds: wantsDocuments ? form.documentIds : [],
        expiresInHours: form.expiresInHours,
        withPasscode: form.withPasscode,
        label: form.label,
      },
      { onSuccess: (link) => setCreated(link) },
    );
  };

  const createdUrl = created ? buildSnapshotUrl(window.location.origin, created.token) : '';

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error(`Could not copy the ${what.toLowerCase()} — select it and copy it instead`);
    }
  };

  return (
    <>
      <Panel>
        <PanelHeader
          eyebrow="Read-only links"
          description="Send a snapshot of your record to someone without a OneCare account — a relative, a carer, a doctor abroad. They can only look. The link expires, and you can revoke it at any time."
        >
          <Button size="sm" className="gradient-primary border-0" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Share a read-only link
          </Button>
        </PanelHeader>

        {isLoading ? (
          <PanelEmpty>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          </PanelEmpty>
        ) : links.length === 0 ? (
          <PanelEmpty>You have not shared any read-only links.</PanelEmpty>
        ) : (
          <PanelRows>
            {links.map((link) => {
              const state = snapshotLinkState(link);
              const badge = STATE_BADGE[state];
              const name = link.label || describeContents(link.categories, link.document_count);
              return (
                <PanelRow
                  key={link.id}
                  className="items-start"
                  glyph={
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                      <Link2 className="h-4 w-4" />
                    </span>
                  }
                  label={name}
                  detail={
                    state === 'revoked'
                      ? `Revoked ${formatDay(link.revoked_at)}`
                      : state === 'expired'
                        ? `Expired ${formatDay(link.expires_at)}`
                        : `Expires ${formatDayTime(link.expires_at)}`
                  }
                  trailing={
                    state === 'active' || state === 'locked' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-destructive hover:text-destructive sm:px-3"
                        onClick={() => setConfirmRevoke({ id: link.id, name })}
                        aria-label={`Revoke the link: ${name}`}
                      >
                        <XCircle className="h-3.5 w-3.5 sm:mr-1.5" />
                        <span className="hidden sm:inline">Revoke</span>
                      </Button>
                    ) : null
                  }
                >
                  <span className="mt-2 flex flex-wrap gap-1">
                    <Badge variant={badge.variant} className="text-[10px] sm:text-xs">{badge.label}</Badge>
                    {link.categories.map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px] sm:text-xs">
                        {c === 'documents' ? `${link.document_count} document${link.document_count === 1 ? '' : 's'}` : categoryLabel(c)}
                      </Badge>
                    ))}
                    {link.has_passcode && (
                      <Badge variant="outline" className="text-[10px] sm:text-xs">
                        <Lock className="mr-1 h-3 w-3" /> Passcode
                      </Badge>
                    )}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>Created {formatDay(link.created_at)}</span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {link.view_count === 0
                        ? 'Not opened yet'
                        : `Opened ${link.view_count} time${link.view_count === 1 ? '' : 's'}, last ${formatDayTime(link.last_viewed_at)}`}
                    </span>
                  </span>
                </PanelRow>
              );
            })}
          </PanelRows>
        )}
      </Panel>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>Your read-only link</DialogTitle>
                <DialogDescription>
                  Copy it now — for your safety we do not keep a copy and cannot show it again.
                  Anyone who has this link{created.passcode ? ' and the passcode' : ''} can see what you chose
                  until {formatDayTime(created.expiresAt)}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="snapshot-url">Link</Label>
                  <div className="flex gap-2">
                    <Input id="snapshot-url" readOnly value={createdUrl} onFocus={(e) => e.currentTarget.select()} />
                    <Button variant="outline" onClick={() => copy(createdUrl, 'Link')} aria-label="Copy link">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {created.passcode && (
                  <div className="space-y-1.5">
                    <Label htmlFor="snapshot-pin">Passcode</Label>
                    <div className="flex gap-2">
                      <Input
                        id="snapshot-pin"
                        readOnly
                        value={created.passcode}
                        className="font-mono tracking-[0.3em]"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button variant="outline" onClick={() => copy(created.passcode!, 'Passcode')} aria-label="Copy passcode">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Send the passcode a different way from the link — for example, read it out on a call.
                      After ten wrong tries the link locks.
                    </p>
                  </div>
                )}
                <Button className="w-full" onClick={close}>Done</Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Share a read-only link</DialogTitle>
                <DialogDescription>
                  The person you send it to does not need an account. They see a copy of what you choose
                  as it is right now — nothing you add later — and cannot change anything or contact you
                  through OneCare.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 pt-2">
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-semibold">What to include</legend>
                  {SNAPSHOT_CATEGORIES.map((c) => (
                    <label
                      key={c.key}
                      className="flex cursor-pointer items-start gap-3 rounded-lg bg-muted/50 p-3"
                    >
                      <Checkbox
                        checked={form.categories.includes(c.key)}
                        onCheckedChange={(v) => toggleCategory(c.key, v === true)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block text-sm font-medium">{c.label}</span>
                        <span className="block text-xs text-muted-foreground">{c.desc}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                {wantsDocuments && (
                  <fieldset className="space-y-2">
                    <legend className="mb-1 text-sm font-semibold">
                      Documents ({form.documentIds.length} chosen)
                    </legend>
                    {docsLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : documents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        There are no documents in your Vault to share.
                      </p>
                    ) : (
                      <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                        {documents.map((d) => (
                          <label key={d.id} className="flex cursor-pointer items-center gap-3 rounded p-1.5 hover:bg-muted/50">
                            <Checkbox
                              checked={form.documentIds.includes(d.id)}
                              onCheckedChange={(v) => toggleDocument(d.id, v === true)}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm">{d.title}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatDay(d.document_date ?? d.created_at)}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                )}

                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-semibold">Link stops working after</legend>
                  <RadioGroup
                    value={String(form.expiresInHours)}
                    onValueChange={(v) => setForm((f) => ({ ...f, expiresInHours: Number(v) }))}
                    className="flex flex-wrap gap-4"
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <label key={o.hours} className="flex cursor-pointer items-center gap-2 text-sm">
                        <RadioGroupItem value={String(o.hours)} />
                        {o.label}
                      </label>
                    ))}
                  </RadioGroup>
                </fieldset>

                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <KeyRound className="h-4 w-4" /> Add a passcode
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      A six-digit code you send separately, so the link alone is not enough.
                    </span>
                  </span>
                  <Switch
                    checked={form.withPasscode}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, withPasscode: v }))}
                    aria-label="Add a passcode"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="snapshot-label">A note for yourself (optional)</Label>
                  <Input
                    id="snapshot-label"
                    maxLength={80}
                    placeholder="e.g. For Mum"
                    value={form.label}
                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Only you see this.</p>
                </div>

                {form.categories.length > 0 && (
                  <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                    Anyone with this link{form.withPasscode ? ' and the passcode' : ''} will be able to see your{' '}
                    <strong>{describeContents(form.categories, form.documentIds.length)}</strong>, as they are
                    now, until <strong>{formatDayTime(expiresPreview)}</strong>, unless you revoke it sooner.
                  </p>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={close}>Cancel</Button>
                  <Button className="flex-1 gradient-primary border-0" disabled={!canCreate} onClick={handleCreate}>
                    {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create link
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRevoke !== null} onOpenChange={(o) => !o && setConfirmRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
            <AlertDialogDescription>
              “{confirmRevoke?.name}” stops working straight away, for everyone who has it. Anything they
              already saved or printed cannot be taken back. The link stays in this list, marked revoked,
              with its view history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmRevoke) revoke.mutate(confirmRevoke.id);
                setConfirmRevoke(null);
              }}
            >
              Revoke link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
