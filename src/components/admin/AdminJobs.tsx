import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  emptyJobPosting,
  useAllJobs,
  useJobMutations,
  type JobPosting,
  type JobPostingInput,
} from "@/hooks/useJobPostings";

const ICONS = ["TrendingUp", "Megaphone", "Stethoscope", "Users"] as const;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const toLines = (items: string[]) => items.join("\n");
const fromLines = (value: string) =>
  value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function AdminJobs() {
  const { data: jobs, isLoading } = useAllJobs();
  const { createJob, updateJob, deleteJob } = useJobMutations();

  const [editing, setEditing] = useState<JobPosting | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<JobPostingInput>(emptyJobPosting);
  const [deleteTarget, setDeleteTarget] = useState<JobPosting | null>(null);

  const startCreate = () => {
    setEditing(null);
    setForm({ ...emptyJobPosting, sort_order: jobs?.length ?? 0 });
    setOpen(true);
  };

  const startEdit = (job: JobPosting) => {
    setEditing(job);
    const { id, created_at, updated_at, ...rest } = job;
    setForm({ ...rest, nice_to_have: rest.nice_to_have ?? [] });
    setOpen(true);
  };

  const set = <K extends keyof JobPostingInput>(key: K, value: JobPostingInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    const payload: JobPostingInput = { ...form, slug: form.slug || slugify(form.title) };

    if (!payload.title.trim() || !payload.slug) {
      toast.error("Title is required");
      return;
    }

    try {
      if (editing) {
        await updateJob.mutateAsync({ id: editing.id, ...payload });
        toast.success("Job updated");
      } else {
        await createJob.mutateAsync(payload);
        toast.success("Job posted");
      }
      setOpen(false);
    } catch (e) {
      toast.error("Could not save job", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteJob.mutateAsync(deleteTarget.id);
      toast.success("Job removed");
    } catch (e) {
      toast.error("Could not remove job", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const togglePublished = async (job: JobPosting) => {
    try {
      await updateJob.mutateAsync({ id: job.id, is_published: !job.is_published });
    } catch (e) {
      toast.error("Could not change visibility", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New job
        </Button>
      </div>

      <div className="space-y-3">
        {(jobs ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground py-10 text-center">No jobs yet. Create your first opening.</p>
        )}
        {(jobs ?? []).map((job) => (
          <div key={job.id} className="rounded-xl border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{job.title}</h3>
                <Badge variant={job.type === "paid" ? "default" : "outline"}>
                  {job.type === "paid" ? "Paid" : "Unpaid"}
                </Badge>
                {!job.is_published && <Badge variant="secondary">Draft</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {job.category} · {job.commitment} · {job.location}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <Switch
                  checked={job.is_published}
                  onCheckedChange={() => togglePublished(job)}
                  aria-label="Published"
                />
                <span className="text-xs text-muted-foreground">Live</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => startEdit(job)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(job)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit job" : "New job"}</DialogTitle>
            <DialogDescription>Published jobs appear immediately on the public careers page.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      title,
                      slug: editing ? prev.slug : slugify(title),
                    }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">URL slug</Label>
                <Input id="slug" value={form.slug} onChange={(e) => set("slug", slugify(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input id="category" value={form.category} onChange={(e) => set("category", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v as JobPostingInput["type"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="commission">Commission</SelectItem>
                    <SelectItem value="advisory">Advisory</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="volunteer">Volunteer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="commitment">Commitment</Label>
                <Input id="commitment" value={form.commitment} onChange={(e) => set("commitment", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" value={form.location} onChange={(e) => set("location", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select
                  value={form.icon_name}
                  onValueChange={(v) => set("icon_name", v as JobPostingInput["icon_name"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICONS.map((icon) => (
                      <SelectItem key={icon} value={icon}>
                        {icon}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sort">Sort order</Label>
                <Input
                  id="sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => set("sort_order", Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Short description</Label>
              <Textarea
                id="description"
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="full">Full description</Label>
              <Textarea
                id="full"
                rows={5}
                value={form.full_description}
                onChange={(e) => set("full_description", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resp">Responsibilities (one per line)</Label>
              <Textarea
                id="resp"
                rows={5}
                value={toLines(form.responsibilities)}
                onChange={(e) => set("responsibilities", fromLines(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quals">Qualifications (one per line)</Label>
              <Textarea
                id="quals"
                rows={5}
                value={toLines(form.qualifications)}
                onChange={(e) => set("qualifications", fromLines(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nice">Nice to have (one per line)</Label>
              <Textarea
                id="nice"
                rows={3}
                value={toLines(form.nice_to_have)}
                onChange={(e) => set("nice_to_have", fromLines(e.target.value))}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch id="published" checked={form.is_published} onCheckedChange={(v) => set("is_published", v)} />
              <Label htmlFor="published">Publish on the careers page</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={createJob.isPending || updateJob.isPending}>
              {(createJob.isPending || updateJob.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Save changes" : "Post job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this job?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” will disappear from the careers page. Applications already received are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
