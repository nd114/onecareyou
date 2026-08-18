import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Archive,
  ArchiveRestore,
  Download,
  FileText,
  Loader2,
  Mail,
  Phone,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AdminPagination, usePagination } from '@/components/admin/AdminPagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  APPLICATION_STATUSES,
  getResumeUrl,
  statusLabel,
  useApplicationMutations,
  useJobApplications,
  type JobApplication,
} from '@/hooks/useJobApplications';

const statusVariant: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  reviewing: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  interview: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  offer: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  hired: 'bg-primary/15 text-primary',
  no_show: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  no_response: 'bg-muted text-muted-foreground',
  rejected: 'bg-destructive/15 text-destructive',
};

export function AdminApplications() {
  const { data, isLoading, error } = useJobApplications();
  const { updateApplication, setArchived } = useApplicationMutations();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [selected, setSelected] = useState<JobApplication | null>(null);
  const [notes, setNotes] = useState('');
  const [resumeLoading, setResumeLoading] = useState(false);

  const archivedCount = useMemo(
    () => (data ?? []).filter((a) => !!a.archived_at).length,
    [data],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter((a) => {
      const matchesView = view === 'archived' ? !!a.archived_at : !a.archived_at;
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      const matchesTerm =
        !term ||
        a.full_name.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term) ||
        a.job_title.toLowerCase().includes(term);
      return matchesView && matchesStatus && matchesTerm;
    });
  }, [data, search, statusFilter, view]);

  const { page, setPage, pageCount, pageItems, total, pageSize } = usePagination(filtered, 15);

  const toggleArchive = async (application: JobApplication) => {
    const archiving = !application.archived_at;
    try {
      await setArchived.mutateAsync({ id: application.id, archived: archiving });
      setSelected(null);
      toast.success(archiving ? 'Application archived' : 'Application restored');
    } catch (e) {
      toast.error('Could not update the archive', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };


  const openApplication = (application: JobApplication) => {
    setSelected(application);
    setNotes(application.admin_notes ?? '');
  };

  const openResume = async (path: string) => {
    setResumeLoading(true);
    try {
      const url = await getResumeUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error('Could not open resume', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setResumeLoading(false);
    }
  };

  const setStatus = async (application: JobApplication, status: string) => {
    try {
      await updateApplication.mutateAsync({ id: application.id, status });
      setSelected((prev) => (prev && prev.id === application.id ? { ...prev, status } : prev));
      toast.success(`Marked as ${status}`);
    } catch (e) {
      toast.error('Update failed', { description: e instanceof Error ? e.message : undefined });
    }
  };

  const saveNotes = async () => {
    if (!selected) return;
    try {
      await updateApplication.mutateAsync({ id: selected.id, admin_notes: notes || null });
      toast.success('Notes saved');
    } catch (e) {
      toast.error('Could not save notes', {
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

  if (error) {
    return (
      <p className="text-sm text-destructive py-8">
        Could not load applications: {error instanceof Error ? error.message : 'unknown error'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or role"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {APPLICATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Resume</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  No applications match this view.
                </TableCell>
              </TableRow>
            )}
            {pageItems.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <div className="font-medium">{a.full_name}</div>
                  <div className="text-xs text-muted-foreground">{a.email}</div>
                </TableCell>
                <TableCell className="text-sm">{a.job_title}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {format(new Date(a.created_at), 'd MMM yyyy')}
                </TableCell>
                <TableCell>
                  {a.resume_path ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={resumeLoading}
                      onClick={() => openResume(a.resume_path!)}
                    >
                      <FileText className="h-4 w-4 mr-1.5" />
                      Open
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`capitalize ${statusVariant[a.status] ?? ''}`}>
                    {a.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => openApplication(a)}>
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="px-4 pb-4">
          <AdminPagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            label="applications"
          />
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.full_name}</SheetTitle>
                <SheetDescription>
                  Applied for {selected.job_title} on{' '}
                  {format(new Date(selected.created_at), 'd MMMM yyyy, HH:mm')}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${selected.email}`} className="text-primary hover:underline">
                      {selected.email}
                    </a>
                  </div>
                  {selected.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {selected.phone}
                    </div>
                  )}
                  {selected.linkedin_url && (
                    <div>
                      <a
                        href={selected.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        LinkedIn profile
                      </a>
                    </div>
                  )}
                  {selected.portfolio_url && (
                    <div>
                      <a
                        href={selected.portfolio_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Portfolio
                      </a>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Experience</Label>
                    <p>{selected.years_experience || '—'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Heard about us</Label>
                    <p className="capitalize">{selected.how_heard || '—'}</p>
                  </div>
                </div>

                {selected.resume_path && (
                  <Button
                    variant="outline"
                    disabled={resumeLoading}
                    onClick={() => openResume(selected.resume_path!)}
                  >
                    {resumeLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    View resume
                  </Button>
                )}

                {selected.cover_letter && (
                  <div>
                    <Label className="text-muted-foreground">Cover letter</Label>
                    <p className="mt-1 text-sm whitespace-pre-line rounded-lg border bg-muted/40 p-3">
                      {selected.cover_letter}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={selected.status} onValueChange={(v) => setStatus(selected, v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPLICATION_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-notes">Internal notes</Label>
                  <Textarea
                    id="admin-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Interview impressions, next steps…"
                  />
                  <Button size="sm" onClick={saveNotes} disabled={updateApplication.isPending}>
                    {updateApplication.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Save notes
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
