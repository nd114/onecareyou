import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  Download,
  FileText,
  Loader2,
  Mic,
  MoreVertical,
  Pencil,
  Sparkles,
} from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelBody, PanelEmpty, PanelGlyph, PanelHeader, PanelRow, PanelRows } from '@/components/ui/panel';
import { RecordVisitDialog } from '@/components/recordings/RecordVisitDialog';
import {
  TRANSCRIPTION_NEEDS_CONSENT,
  usePatientRecordings,
  type PatientRecording,
} from '@/hooks/usePatientRecordings';
import { formatDuration } from '@/lib/recording-consent';
import { isTranscriptInFlight, transcriptActionLabel } from '@/lib/recording-status';

/**
 * The patient's own recordings of their appointments.
 *
 * A list, not a grid: these are one kind of thing, told apart by name and
 * date, and a grid of identical cards would make choosing between them harder
 * rather than easier.
 */
const Recordings = () => {
  const {
    active,
    archived,
    isLoading,
    saveRecording,
    requestTranscript,
    saveTranscriptToVault,
    renameRecording,
    archiveRecording,
    restoreRecording,
    getAudioUrl,
    downloadAudio,
    downloadTranscript,
    canTranscribe,
  } = usePatientRecordings();

  const [recordOpen, setRecordOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [renaming, setRenaming] = useState<PatientRecording | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [reading, setReading] = useState<PatientRecording | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const list = showArchived ? archived : active;

  const play = async (recording: PatientRecording) => {
    if (playingId === recording.id) {
      setPlayingId(null);
      setPlayingUrl(null);
      return;
    }
    setPlayingId(recording.id);
    setPlayingUrl(null);
    setPlayingUrl(await getAudioUrl(recording));
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <SectionTabs section="health" variant="patient" />
      <main className="container max-w-4xl px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <Mic className="h-6 w-6 text-primary" />
                Recordings
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Record an appointment so you can listen back to what was actually said.
              </p>
            </div>
            <Button onClick={() => setRecordOpen(true)}>
              <Mic className="mr-2 h-4 w-4" />
              Record an appointment
            </Button>
          </div>

          <Panel>
            <PanelHeader
              eyebrow={showArchived ? 'Archived' : 'Your recordings'}
              description={
                showArchived
                  ? 'Put away, not deleted. Restore any of these to bring it back.'
                  : 'Each one is saved in your Health Vault. Nobody else can see them unless you share them.'
              }
            >
              {(showArchived || archived.length > 0) && (
                <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
                  {showArchived ? 'Back to recordings' : `Archive (${archived.length})`}
                </Button>
              )}
            </PanelHeader>

            {!canTranscribe && list.length > 0 && !showArchived && (
              <PanelBody className="border-b border-primary/10 bg-secondary/30 text-xs leading-relaxed text-muted-foreground">
                {TRANSCRIPTION_NEEDS_CONSENT}{' '}
                <Link to="/settings?section=privacy" className="underline underline-offset-2">
                  Turn it on
                </Link>
                . Recording, playing back and downloading all work without it.
              </PanelBody>
            )}

            {isLoading ? (
              <PanelBody className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </PanelBody>
            ) : list.length === 0 ? (
              <PanelEmpty>
                {showArchived ? (
                  'Nothing archived.'
                ) : (
                  <>
                    <p>No recordings yet.</p>
                    <p className="mt-1 text-xs">
                      Ask the person you are with first — then press record before the appointment
                      starts.
                    </p>
                  </>
                )}
              </PanelEmpty>
            ) : (
              <PanelRows>
                {list.map((recording) => (
                  <PanelRow
                    key={recording.id}
                    glyph={
                      <PanelGlyph tone={recording.archived_at ? 'muted' : 'active'}>
                        <Mic />
                      </PanelGlyph>
                    }
                    overline={
                      <>
                        <span>{new Date(recording.recorded_at).toLocaleString()}</span>
                        <span>·</span>
                        <span>{formatDuration(recording.duration_seconds)}</span>
                        <TranscriptBadge recording={recording} />
                      </>
                    }
                    label={recording.title}
                    trailing={
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => play(recording)}>
                          {playingId === recording.id ? 'Hide' : 'Play'}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${recording.title}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              onSelect={() => {
                                setRenaming(recording);
                                setRenameValue(recording.title);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void downloadAudio(recording)}>
                              <Download className="mr-2 h-4 w-4" />
                              Download the audio
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {recording.transcript_status === 'ready' ? (
                              <>
                                <DropdownMenuItem onSelect={() => setReading(recording)}>
                                  <FileText className="mr-2 h-4 w-4" />
                                  Read the transcript
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => downloadTranscript(recording)}>
                                  <Download className="mr-2 h-4 w-4" />
                                  Download the transcript
                                </DropdownMenuItem>
                                {!recording.transcript_document_id && (
                                  <DropdownMenuItem
                                    onSelect={() => saveTranscriptToVault.mutate(recording)}
                                  >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Save transcript to my Vault
                                  </DropdownMenuItem>
                                )}
                              </>
                            ) : (
                              canTranscribe ? (
                              <DropdownMenuItem
                                disabled={isTranscriptInFlight(recording)}
                                onSelect={() => requestTranscript.mutate(recording)}
                              >
                                <Sparkles className="mr-2 h-4 w-4" />
                                {transcriptActionLabel(recording)}
                              </DropdownMenuItem>
                              ) : (
                              // Rather than an item that refuses when tapped:
                              // say what is needed and go straight there.
                              <DropdownMenuItem asChild>
                                <Link to="/settings?section=privacy">
                                  <Sparkles className="mr-2 h-4 w-4" />
                                  Turn on transcripts
                                </Link>
                              </DropdownMenuItem>
                              )
                            )}

                            <DropdownMenuSeparator />

                            {recording.archived_at ? (
                              <DropdownMenuItem onSelect={() => restoreRecording.mutate(recording)}>
                                <ArchiveRestore className="mr-2 h-4 w-4" />
                                Restore
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => archiveRecording.mutate(recording)}>
                                <Archive className="mr-2 h-4 w-4" />
                                Archive
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    }
                  >
                    {playingId === recording.id && (
                      <span className="mt-2 block">
                        {playingUrl ? (
                          <audio controls autoPlay src={playingUrl} className="w-full max-w-md" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Loading audio…</span>
                        )}
                      </span>
                    )}
                  </PanelRow>
                ))}
              </PanelRows>
            )}
          </Panel>
        </motion.div>
      </main>

      <RecordVisitDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onSave={async ({ alsoTranscribe, ...args }) => {
          const saved = await saveRecording.mutateAsync(args);
          if (alsoTranscribe && saved) requestTranscript.mutate(saved);
        }}
      />

      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename recording</DialogTitle>
            <DialogDescription>
              The copies in your Vault are renamed too, so you do not end up hunting for a file
              still called by its timestamp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-recording">Name</Label>
            <Input
              id="rename-recording"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={120}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              disabled={!renaming || renameValue.trim() === renaming.title}
              onClick={() => {
                if (!renaming) return;
                renameRecording.mutate({ recording: renaming, title: renameValue });
                setRenaming(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reading} onOpenChange={(open) => !open && setReading(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{reading?.title}</DialogTitle>
            <DialogDescription>
              Produced automatically. Names, doses and numbers are the parts most often wrong —
              check anything you plan to act on against the audio.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-4 text-sm leading-relaxed">
            {reading?.transcript}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => reading && downloadTranscript(reading)}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Button onClick={() => setReading(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** Only says something when there is something to say. */
function TranscriptBadge({ recording }: { recording: PatientRecording }) {
  if (recording.transcript_status === 'ready') {
    return (
      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
        Transcript
      </Badge>
    );
  }
  if (isTranscriptInFlight(recording)) {
    return <span className="text-[11px] text-muted-foreground">Transcribing…</span>;
  }
  if (recording.transcript_status === 'failed' || recording.transcript_status === 'pending') {
    return <span className="text-[11px] text-destructive">Transcript failed</span>;
  }
  return null;
}

export default Recordings;
