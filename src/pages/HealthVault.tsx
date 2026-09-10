import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Search, FolderOpen, Loader2, Crown, Lock, Folder, Files, FolderPlus,
  NotebookPen, Pencil, Trash2, CalendarRange,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { UploadDocumentDialog } from '@/components/documents/UploadDocumentDialog';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { PersonalNoteCard } from '@/components/documents/PersonalNoteCard';
import { PersonalNoteDialog } from '@/components/documents/PersonalNoteDialog';
import type { HealthDocument } from '@/hooks/useHealthDocuments';
import { useHealthDocuments, DOCUMENT_CATEGORIES, DocumentCategory } from '@/hooks/useHealthDocuments';
import { useDocumentFolders } from '@/hooks/useDocumentFolders';
import { usePersonalNotes, type PersonalNote } from '@/hooks/usePersonalNotes';
import { noteHtmlToText } from '@/lib/sanitize-html';
import { didYouMean, search as searchList } from '@/lib/search';
import { formatDateOnly } from '@/lib/date-only';

/**
 * A date, written the ways people actually type it.
 *
 * Search was name-only, so "2025" or "March" found nothing even when the date
 * was on screen. Folding the document's own date into the searchable text is
 * the smallest way to make typing a year or a month work.
 */
const dateSearchText = (value: string | null | undefined) => {
  if (!value) return null;
  const long = formatDateOnly(value, { year: 'numeric', month: 'long', day: 'numeric' });
  const short = formatDateOnly(value, { year: 'numeric', month: 'short', day: 'numeric' });
  return [value, long, short].filter(Boolean).join(' ');
};

/** Most important first: a hit in the title outranks one in a summary. */
const vaultSearchFields = (d: HealthDocument) => [
  d.title,
  d.file_name,
  ...(d.tags ?? []),
  ...(d.ai_tags ?? []),
  d.notes,
  d.ai_summary,
  dateSearchText(d.document_date),
];

const noteSearchFields = (n: PersonalNote) => [
  n.title,
  ...(n.tags ?? []),
  noteHtmlToText(n.body_html),
  dateSearchText(n.note_date),
];
import { VisitSummariesSection } from '@/components/documents/VisitSummariesSection';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { FREE_DOCUMENT_LIMIT } from '@/lib/pricing-constants';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const HealthVault = () => {
  const { profile } = useAuth();
  const { documents, isLoading } = useHealthDocuments();
  // Folders are records of their own now, so an empty one survives a reload and
  // can be renamed or removed.
  const { folders: folderRecords, folderNames, createFolder, renameFolder, deleteFolder } =
    useDocumentFolders();
  const { notes, isLoading: notesLoading } = usePersonalNotes();
  const folders = folderNames;
  const { checkSubscription, isPremium } = useSubscription();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<DocumentCategory | 'all'>('all');
  const [activeFolder, setActiveFolder] = useState<string>('all');
  const [checkedSub, setCheckedSub] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showDates, setShowDates] = useState(false);
  const [showNewNote, setShowNewNote] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    checkSubscription().then(() => setCheckedSub(true));
  }, [checkSubscription]);

  const isOverFreeLimit = !isPremium && documents.length >= FREE_DOCUMENT_LIMIT;

  // Archived documents are out of the way by default and one toggle from
  // being back. Not hidden: a patient who put something away needs to be able
  // to find it again without being told to contact support.
  const [showArchived, setShowArchived] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const isArchived = (d: HealthDocument) => Boolean(d.archived_at);
  const archivedCount = useMemo(
    () => documents.filter(isArchived).length + notes.filter((n) => n.archived_at).length,
    [documents, notes],
  );

  const withinDates = (value: string | null) => {
    if (!fromDate && !toDate) return true;
    if (!value) return false;
    if (fromDate && value < fromDate) return false;
    if (toDate && value > toDate) return false;
    return true;
  };

  const filteredDocuments = useMemo(() => {
    let filtered = documents.filter((d) => (showArchived ? isArchived(d) : !isArchived(d)));
    if (activeFolder === '__unfiled__') {
      filtered = filtered.filter((d) => !d.folder);
    } else if (activeFolder !== 'all') {
      filtered = filtered.filter((d) => d.folder === activeFolder);
    }
    if (activeCategory !== 'all') {
      filtered = filtered.filter((d) => d.category === activeCategory || d.ai_category === activeCategory);
    }
    filtered = filtered.filter((d) => withinDates(d.document_date));
    if (search.trim()) {
      // Ranked, accent- and typo-tolerant, and the title outranks a passing
      // mention in a summary — a substring filter treated all five fields as
      // equally important and none of them as ranked.
      filtered = searchList(filtered, search, vaultSearchFields);
    }
    return filtered;
    // showArchived belongs here: leaving it out was why switching to the
    // archive changed nothing until a folder was clicked.
  }, [documents, activeCategory, activeFolder, search, showArchived, fromDate, toDate]);

  /** Notes live beside the documents and answer to the same filters. */
  const filteredNotes = useMemo(() => {
    let filtered = notes.filter((n) => (showArchived ? !!n.archived_at : !n.archived_at));
    if (activeFolder === '__unfiled__') filtered = filtered.filter((n) => !n.folder);
    else if (activeFolder !== 'all') filtered = filtered.filter((n) => n.folder === activeFolder);
    // Notes are not one of the document types, so any type filter excludes them.
    if (activeCategory !== 'all') return [];
    filtered = filtered.filter((n) => withinDates(n.note_date));
    if (search.trim()) filtered = searchList(filtered, search, noteSearchFields);
    return filtered;
  }, [notes, activeCategory, activeFolder, search, showArchived, fromDate, toDate]);

  // Only computed when the search found nothing, which is the only moment the
  // question helps — offering a correction beside results teaches people to
  // distrust the results.
  const vaultSuggestion = useMemo(
    () => (search.trim() ? didYouMean(documents, search, vaultSearchFields) : null),
    [documents, search],
  );

  const categoryCounts = useMemo(() => {
    const scoped =
      activeFolder === 'all'
        ? documents
        : activeFolder === '__unfiled__'
          ? documents.filter((d) => !d.folder)
          : documents.filter((d) => d.folder === activeFolder);
    const counts: Record<string, number> = { all: scoped.length };
    scoped.forEach((d) => {
      counts[d.category] = (counts[d.category] || 0) + 1;
    });
    return counts;
  }, [documents, activeFolder]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { all: documents.length + notes.length, __unfiled__: 0 };
    const tally = (folder: string | null) => {
      if (folder) counts[folder] = (counts[folder] || 0) + 1;
      else counts.__unfiled__ += 1;
    };
    documents.forEach((d) => tally(d.folder));
    notes.forEach((n) => tally(n.folder));
    return counts;
  }, [documents, notes]);

  const activeFolderRecord = folderRecords.find((f) => f.name === activeFolder) ?? null;
  const hasResults = filteredDocuments.length > 0 || filteredNotes.length > 0;


  return (
    <div className="min-h-screen bg-background">
      <Header />
      <SectionTabs section="health" variant="patient" />
      <main className="container py-8 px-4 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FolderOpen className="h-6 w-6 text-primary" />
                Health Vault
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Your visit summaries, health documents and your own notes, in one place
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowNewNote(true)}>
                <NotebookPen className="h-4 w-4 mr-2" />
                New note
              </Button>
              {!isOverFreeLimit && (
                <UploadDocumentDialog
                  defaultFolder={activeFolder === 'all' || activeFolder === '__unfiled__' ? null : activeFolder}
                />
              )}
            </div>
          </div>


          {/* Premium Upsell Banner for free users at limit */}
          {isOverFreeLimit && (
            <Card className="mb-6 border-primary/30 bg-primary/5">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Crown className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">You've reached {FREE_DOCUMENT_LIMIT} documents</p>
                  <p className="text-xs text-muted-foreground">Upgrade to Premium for unlimited document storage and AI summaries.</p>
                </div>
                <Button size="sm" asChild className="flex-shrink-0">
                  <Link to="/pricing">
                    <Crown className="h-4 w-4 mr-1" />
                    Upgrade
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Free tier info for users not at limit */}
          {!isPremium && !isOverFreeLimit && documents.length > 0 && (
            <div className="mb-4 text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              {documents.length} of {FREE_DOCUMENT_LIMIT} free documents used.{' '}
              <Link to="/pricing" className="text-primary hover:underline">Upgrade for unlimited</Link>
            </div>
          )}

          {/* What a clinician wrote after a visit. Sits above the files
              because it is the thing people open the Vault to find after an
              appointment, and because a document is only one kind of record. */}
          <VisitSummariesSection />

          {/* Search */}
          <div className="mb-4 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, tag, note — or a date like 2026 or March"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant={fromDate || toDate ? 'default' : 'outline'}
                className="shrink-0"
                onClick={() => setShowDates((v) => !v)}
              >
                <CalendarRange className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Dates</span>
              </Button>
            </div>

            {/* Searching by name only meant a result from March could not be
                found by its month. This filters on the date written on the
                document, not the day it was uploaded. */}
            {showDates && (
              <div className="rounded-xl border bg-secondary/30 p-3 space-y-2">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="vault-from" className="text-xs">From</Label>
                    <Input
                      id="vault-from"
                      type="date"
                      className="h-9"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="vault-to" className="text-xs">To</Label>
                    <Input
                      id="vault-to"
                      type="date"
                      className="h-9"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </div>
                  {(fromDate || toDate) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9"
                      onClick={() => { setFromDate(''); setToDate(''); }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 30);
                      setFromDate(d.toISOString().slice(0, 10));
                      setToDate('');
                    }}
                  >
                    Last 30 days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setFromDate(`${new Date().getFullYear()}-01-01`);
                      setToDate('');
                    }}
                  >
                    This year
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Filtered on the date written on the document or note.
                </p>
              </div>
            )}
          </div>

          {/* Archive switch. Kept beside the folders because that is what it
              is — a place things go, not a destructive action. */}
          {(archivedCount > 0 || showArchived) && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-secondary/40 px-4 py-2.5">
              <p className="text-sm text-muted-foreground">
                {showArchived
                  ? 'Showing your archive. These are not shared with anyone through whole-Vault access.'
                  : `${archivedCount} item${archivedCount === 1 ? '' : 's'} in your archive`}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? 'Back to Vault' : 'View archive'}
              </Button>
            </div>
          )}


          {/* Folders */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground">Folders</p>
              {/* Creating a folder used to live inside one document's menu, and
                  the menu item set state that nothing rendered — so it did
                  nothing at all. A folder is a Vault-level thing; it belongs
                  here, next to the folders. */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => { setNewFolderName(''); setShowNewFolder(true); }}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                New folder
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge
                variant={activeFolder === 'all' ? 'default' : 'outline'}
                className="cursor-pointer gap-1"
                onClick={() => setActiveFolder('all')}
              >
                <Files className="h-3 w-3" />
                All documents ({folderCounts.all || 0})
              </Badge>
              <Badge
                variant={activeFolder === '__unfiled__' ? 'default' : 'outline'}
                className="cursor-pointer gap-1"
                onClick={() => setActiveFolder('__unfiled__')}
              >
                <FileText className="h-3 w-3" />
                Unfiled ({folderCounts.__unfiled__ || 0})
              </Badge>
              {folders.map((f) => (
                <Badge
                  key={f}
                  variant={activeFolder === f ? 'default' : 'outline'}
                  className="cursor-pointer gap-1"
                  onClick={() => setActiveFolder(f)}
                >
                  <Folder className="h-3 w-3" />
                  {f} ({folderCounts[f] || 0})
                </Badge>
              ))}
            </div>

            {/* Renaming and removing belong to the folder you are looking at,
                so they appear once it is selected rather than as icons on every
                chip. Removing never touches a file: its contents go back to
                Unfiled. */}
            {activeFolderRecord && (
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => {
                    setRenameDraft(activeFolderRecord.name);
                    setRenaming({ id: activeFolderRecord.id, name: activeFolderRecord.name });
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename "{activeFolderRecord.name}"
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                  onClick={() => setRemoving({ id: activeFolderRecord.id, name: activeFolderRecord.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove folder
                </Button>
              </div>
            )}

            {folders.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Make a folder with "New folder", then use the folder icon on any document to file it.
              </p>
            )}
          </div>


          {/* Category Filters */}
          <div className="flex gap-2 mb-6 flex-wrap">
            <Badge
              variant={activeCategory === 'all' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setActiveCategory('all')}
            >
              All ({categoryCounts.all || 0})
            </Badge>
            {/* A filter that finds nothing is not a filter. Twelve chips, five
                of them "(0)", is a wall to read past on the way to eight
                documents. The one you are on stays even when it empties, so
                the row does not shift under your hand. */}
            {DOCUMENT_CATEGORIES.filter(
              (cat) => (categoryCounts[cat.value] || 0) > 0 || activeCategory === cat.value,
            ).map((cat) => (
              <Badge
                key={cat.value}
                variant={activeCategory === cat.value ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setActiveCategory(cat.value)}
              >
                {cat.label} ({categoryCounts[cat.value] || 0})
              </Badge>
            ))}
          </div>

          {/* Documents and notes */}
          {isLoading || notesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !hasResults ? (
            <div className="text-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">
                {showArchived
                  ? 'Nothing archived'
                  : documents.length === 0 && notes.length === 0
                    ? 'Nothing here yet'
                    : activeFolderRecord
                      ? `"${activeFolder}" is empty`
                      : 'Nothing matches your search'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {vaultSuggestion ? (
                  <>
                    Did you mean{' '}
                    <button
                      type="button"
                      onClick={() => setSearch(vaultSuggestion)}
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      {vaultSuggestion}
                    </button>
                    ?
                  </>
                ) : documents.length === 0 && notes.length === 0 ? (
                  'Upload prescriptions, lab results and discharge summaries, or write a note of your own.'
                ) : activeFolderRecord ? (
                  'Use the folder icon on any document to file it in here, or upload straight into it with the Upload button.'
                ) : (
                  'Try a different search, date range or type.'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotes.map((note) => (
                <motion.div key={note.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <PersonalNoteCard note={note} />
                </motion.div>
              ))}
              {filteredDocuments.map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <DocumentCard document={doc} isPremium={isPremium} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>

      {/* A folder is its own record now: it survives being empty, and renaming
          it moves its documents with it. */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Name it and it stays, empty or not. File documents into it with the folder icon on
              any document, or upload straight into it.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const name = newFolderName.trim();
              if (!name) return;
              if (folders.some((f) => f.toLowerCase() === name.toLowerCase())) {
                toast.error('You already have a folder with that name');
                return;
              }
              await createFolder.mutateAsync(name);
              setActiveFolder(name);
              setShowNewFolder(false);
              setNewFolderName('');
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder name</Label>
              <Input
                id="folder-name"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Lab results 2026"
                maxLength={60}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNewFolder(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newFolderName.trim() || createFolder.isPending}>
                Create folder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog open={!!renaming} onOpenChange={(v) => !v && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>
              Everything filed in "{renaming?.name}" moves with the new name.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const name = renameDraft.trim();
              if (!name || !renaming) return;
              if (
                name.toLowerCase() !== renaming.name.toLowerCase() &&
                folders.some((f) => f.toLowerCase() === name.toLowerCase())
              ) {
                toast.error('You already have a folder with that name');
                return;
              }
              await renameFolder.mutateAsync({ id: renaming.id, name });
              if (activeFolder === renaming.name) setActiveFolder(name);
              setRenaming(null);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="rename-folder">Folder name</Label>
              <Input
                id="rename-folder"
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                maxLength={60}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameDraft.trim() || renameFolder.isPending}>
                Save name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{removing?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The folder goes; nothing inside it is deleted. Anything filed in it moves back to
              Unfiled, where you can find it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!removing) return;
                await deleteFolder.mutateAsync(removing.id);
                if (activeFolder === removing.name) setActiveFolder('all');
                setRemoving(null);
              }}
            >
              Remove folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PersonalNoteDialog open={showNewNote} onOpenChange={setShowNewNote} />
    </div>
  );
};

export default HealthVault;

