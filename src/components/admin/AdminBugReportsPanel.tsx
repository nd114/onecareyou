import { Archive, Bug, Loader2, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { useAdminBugReports, type BugReportRow, type BugReportStatus } from '@/hooks/useAdminBugReports';
import { formatDayTime } from '@/lib/format-date';

const STATUS_TABS: Array<{ value: BugReportStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

const CATEGORY_LABEL: Record<string, string> = {
  bug: 'Bug',
  design: 'Design / UX',
  suggestion: 'Suggestion',
};

/** Bug reports in full: who sent it, the whole description, select-and-move instead of "restore all". */
export function AdminBugReportsPanel() {
  const {
    rows,
    total,
    page,
    setPage,
    pageCount,
    pageSize,
    status,
    setStatus,
    isLoading,
    isFetching,
    selected,
    toggleSelected,
    toggleSelectAllOnPage,
    archiveSelected,
    restoreSelected,
    archiveOne,
    restoreOne,
    isMutating,
  } = useAdminBugReports();

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedCount = selected.size;

  return (
    <Card>
      <CardHeader className="gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Bug className="h-4 w-4 text-primary" />
            Bug reports
          </CardTitle>
          <CardDescription>
            Every report a beta tester filed, in full, with who sent it — a report was sent to
            OneCare on purpose, so it is shown in full rather than searched or gated. Archive
            clears one off the list without losing it; nothing here is deleted.
          </CardDescription>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <ToggleGroup
            type="single"
            value={status}
            onValueChange={(v) => v && setStatus(v as BugReportStatus)}
            className="rounded-lg border bg-card p-0.5 shrink-0 w-fit"
            aria-label="Status"
          >
            {STATUS_TABS.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value} className="h-8 px-3 text-xs">
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {selectedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedCount} selected</span>
              {status !== 'archived' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={isMutating}
                  onClick={archiveSelected}
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </Button>
              )}
              {status !== 'open' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={isMutating}
                  onClick={restoreSelected}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Restore
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            {status === 'archived'
              ? 'Nothing archived.'
              : status === 'open'
                ? 'No open reports — all clear.'
                : 'No reports yet.'}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 pb-2 border-b mb-2">
              <Checkbox
                checked={allOnPageSelected}
                onCheckedChange={toggleSelectAllOnPage}
                aria-label="Select all reports on this page"
              />
              <span className="text-xs text-muted-foreground">Select all on this page</span>
            </div>
            <div className={`space-y-2 ${isFetching ? 'opacity-60' : ''}`}>
              {rows.map((r) => (
                <BugReportRowItem
                  key={r.id}
                  row={r}
                  checked={selected.has(r.id)}
                  onToggle={() => toggleSelected(r.id)}
                  onArchive={() => archiveOne(r.id)}
                  onRestore={() => restoreOne(r.id)}
                  isMutating={isMutating}
                />
              ))}
            </div>
            <AdminPagination
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              label="reports"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BugReportRowItem({
  row,
  checked,
  onToggle,
  onArchive,
  onRestore,
  isMutating,
}: {
  row: BugReportRow;
  checked: boolean;
  onToggle: () => void;
  onArchive: () => void;
  onRestore: () => void;
  isMutating: boolean;
}) {
  const browser = row.browser_info;
  const browserSummary = browser
    ? [browser.platform, browser.viewport, browser.language].filter(Boolean).join(' · ')
    : null;

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        aria-label={`Select report from ${row.reporter_name}`}
        className="mt-1"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{CATEGORY_LABEL[row.category] ?? row.category}</Badge>
          {row.status === 'archived' && <Badge variant="outline">Archived</Badge>}
          <span className="text-xs text-muted-foreground">{formatDayTime(row.created_at)}</span>
        </div>
        <p className="text-sm mt-1.5 whitespace-pre-wrap break-words">{row.description}</p>
        <p className="text-xs text-muted-foreground mt-1.5">
          {row.reporter_name}
          {row.reporter_email ? ` · ${row.reporter_email}` : ''}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
          {row.page_url}
          {browserSummary ? ` · ${browserSummary}` : ''}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0"
        disabled={isMutating}
        onClick={row.status === 'archived' ? onRestore : onArchive}
      >
        {row.status === 'archived' ? (
          <>
            <Undo2 className="h-4 w-4 mr-1.5" />
            Restore
          </>
        ) : (
          <>
            <Archive className="h-4 w-4 mr-1.5" />
            Archive
          </>
        )}
      </Button>
    </div>
  );
}
