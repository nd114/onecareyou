import { useEffect, useState, useRef } from 'react';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Mic, MicOff, Loader2, CheckCircle2, FileAudio, AlertTriangle, Trash2 } from 'lucide-react';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { toast } from 'sonner';
import { SEOHead } from '@/components/seo/SEOHead';
import { format } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Dictation {
  id: string;
  patient_label: string | null;
  audio_path: string;
  duration_seconds: number | null;
  transcript: string | null;
  summary: string | null;
  status: string;
  transcript_approved_at: string | null;
  summary_approved_at: string | null;
  bulk_approved: boolean;
  created_at: string;
}

export default function ClinicianDictations() {
  const { user } = useAuth();
  const recorder = useVoiceRecorder();
  const [patientLabel, setPatientLabel] = useState('');
  const [dictations, setDictations] = useState<Dictation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [editingTranscript, setEditingTranscript] = useState<Record<string, string>>({});
  const [editingSummary, setEditingSummary] = useState<Record<string, string>>({});

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('clinician_dictations')
      .select('*')
      .eq('clinician_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setDictations((data as Dictation[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [user]);

  const handleRecord = async () => {
    if (recorder.isRecording) {
      const blob = await recorder.stop();
      if (!blob || !user) return;
      await uploadAndProcess(blob, patientLabel);
      setPatientLabel('');
    } else {
      const ok = await recorder.start();
      if (!ok && recorder.error) toast.error(recorder.error);
    }
  };

  const uploadAndProcess = async (blob: Blob, label: string) => {
    if (!user) return;
    const path = `${user.id}/${Date.now()}.webm`;
    const { error: upErr } = await supabase.storage
      .from('clinician-dictations')
      .upload(path, blob, { contentType: blob.type });
    if (upErr) { toast.error(upErr.message); return; }
    const { data: row, error } = await supabase
      .from('clinician_dictations')
      .insert([{
        clinician_user_id: user.id,
        audio_path: path,
        patient_label: label || null,
        duration_seconds: Math.round(recorder.elapsedMs / 1000),
        status: 'pending_transcription',
      }])
      .select('*')
      .single();
    if (error || !row) { toast.error(error?.message || 'Could not save dictation'); return; }
    setDictations((prev) => [row as Dictation, ...prev]);
    setProcessingId(row.id);
    try {
      const { error: fnErr } = await supabase.functions.invoke('clinician-dictation-process', {
        body: { dictationId: row.id },
      });
      if (fnErr) throw fnErr;
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Processing failed');
    } finally {
      setProcessingId(null);
    }
  };

  const approveTranscript = async (d: Dictation) => {
    const text = editingTranscript[d.id] ?? d.transcript ?? '';
    await supabase
      .from('clinician_dictations')
      .update({ transcript: text, transcript_approved_at: new Date().toISOString(), transcript_approved_by: user!.id, status: 'transcript_approved' })
      .eq('id', d.id);
    toast.success('Transcript approved');
    void load();
  };

  const approveSummary = async (d: Dictation) => {
    const text = editingSummary[d.id] ?? d.summary ?? '';
    await supabase
      .from('clinician_dictations')
      .update({ summary: text, summary_approved_at: new Date().toISOString(), summary_approved_by: user!.id, status: 'filed' })
      .eq('id', d.id);
    toast.success('Summary approved and filed');
    void load();
  };

  const bulkApprovePending = async () => {
    const pending = dictations.filter((d) => d.status === 'transcribed' && !d.summary_approved_at);
    if (!pending.length) { toast.info('Nothing in the queue to bulk approve'); return; }
    const ids = pending.map((d) => d.id);
    await supabase
      .from('clinician_dictations')
      .update({
        transcript_approved_at: new Date().toISOString(),
        transcript_approved_by: user!.id,
        summary_approved_at: new Date().toISOString(),
        summary_approved_by: user!.id,
        bulk_approved: true,
        status: 'filed',
      })
      .in('id', ids);
    toast.success(`Bulk approved ${ids.length} dictation${ids.length === 1 ? '' : 's'}`);
    void load();
  };

  const deleteDictation = async (d: Dictation) => {
    await supabase.storage.from('clinician-dictations').remove([d.audio_path]);
    await supabase.from('clinician_dictations').delete().eq('id', d.id);
    toast.success('Deleted');
    void load();
  };

  const seconds = Math.floor(recorder.elapsedMs / 1000);
  const pendingCount = dictations.filter((d) => d.status === 'transcribed' && !d.summary_approved_at).length;

  return (
    <>
      <SEOHead title="Dictations — OneCare Clinician" description="Voice-dictated visit notes with AI transcription and summary, requiring clinician approval." noIndex />
      <ClinicianHeader />
      <SectionTabs section="communicate\" variant="clinician" />
      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dictations</h1>
          <p className="text-sm text-muted-foreground">
            Record visit notes; AI transcribes and summarizes. <strong>Nothing is filed until you approve it.</strong>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New dictation</CardTitle>
            <CardDescription>Record up to 60 seconds. Longer continuous-dictation (Otter-style) is coming.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="patient-label" className="text-xs">Patient (label or invite code, optional)</Label>
              <input id="patient-label" className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={patientLabel} onChange={(e) => setPatientLabel(e.target.value)}
                placeholder="e.g. John Doe — 9am follow-up" disabled={recorder.isRecording} />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleRecord} variant={recorder.isRecording ? 'destructive' : 'default'}>
                {recorder.isRecording ? <><MicOff className="h-4 w-4 mr-2" /> Stop ({seconds}s)</> : <><Mic className="h-4 w-4 mr-2" /> Record</>}
              </Button>
              {recorder.isRecording && <span className="text-sm text-muted-foreground">{seconds}s / 60s</span>}
              {processingId && <span className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Transcribing & summarizing…</span>}
            </div>
          </CardContent>
        </Card>

        {pendingCount > 0 && (
          <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10">
            <CardContent className="py-4 flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">{pendingCount} dictation{pendingCount === 1 ? '' : 's'} awaiting review</p>
                  <p className="text-xs text-muted-foreground">Bulk approve files everything as-is. You remain responsible for the contents.</p>
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline" size="sm">Bulk approve</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Bulk approve {pendingCount} dictation{pendingCount === 1 ? '' : 's'}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You're approving the AI transcript and summary for every queued dictation without reviewing each one. By proceeding you accept that any errors filed to a patient record are your responsibility. OneCare is not liable for unreviewed content.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={bulkApprovePending}>Yes, file them all</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : dictations.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No dictations yet. Record one above.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {dictations.map((d) => (
              <DictationCard key={d.id} d={d}
                editTranscript={editingTranscript[d.id] ?? d.transcript ?? ''}
                editSummary={editingSummary[d.id] ?? d.summary ?? ''}
                setEditTranscript={(v) => setEditingTranscript((s) => ({ ...s, [d.id]: v }))}
                setEditSummary={(v) => setEditingSummary((s) => ({ ...s, [d.id]: v }))}
                onApproveTranscript={() => approveTranscript(d)}
                onApproveSummary={() => approveSummary(d)}
                onDelete={() => deleteDictation(d)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function DictationCard({ d, editTranscript, editSummary, setEditTranscript, setEditSummary, onApproveTranscript, onApproveSummary, onDelete }: {
  d: Dictation;
  editTranscript: string;
  editSummary: string;
  setEditTranscript: (v: string) => void;
  setEditSummary: (v: string) => void;
  onApproveTranscript: () => void;
  onApproveSummary: () => void;
  onDelete: () => void;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void supabase.storage.from('clinician-dictations').createSignedUrl(d.audio_path, 60 * 60).then(({ data }) => {
      setAudioUrl(data?.signedUrl ?? null);
    });
  }, [d.audio_path]);

  const statusBadge = {
    pending_transcription: <Badge variant="outline">Transcribing…</Badge>,
    transcribed: <Badge variant="secondary">Awaiting review</Badge>,
    transcript_approved: <Badge variant="secondary">Transcript ✓ — summary pending</Badge>,
    summary_approved: <Badge>Filed</Badge>,
    filed: <Badge>Filed</Badge>,
    error: <Badge variant="destructive">Error</Badge>,
  }[d.status] ?? <Badge variant="outline">{d.status}</Badge>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileAudio className="h-4 w-4" />
              {d.patient_label || 'Unlabeled dictation'}
            </CardTitle>
            <CardDescription className="text-xs">
              {format(new Date(d.created_at), 'PPp')}
              {d.duration_seconds ? ` · ${d.duration_seconds}s` : ''}
              {d.bulk_approved ? ' · bulk-approved' : ''}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge}
            <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {audioUrl && <audio src={audioUrl} controls className="w-full h-9" />}
        {d.transcript !== null && (
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-2">
              Transcript {d.transcript_approved_at && <CheckCircle2 className="h-3 w-3 text-green-600" />}
            </Label>
            <Textarea value={editTranscript} onChange={(e) => setEditTranscript(e.target.value)} rows={4} className="text-sm font-mono" />
            {!d.transcript_approved_at && (
              <Button size="sm" variant="outline" onClick={onApproveTranscript}>Approve transcript</Button>
            )}
          </div>
        )}
        {d.summary !== null && (
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-2">
              AI Summary {d.summary_approved_at && <CheckCircle2 className="h-3 w-3 text-green-600" />}
            </Label>
            <Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={6} className="text-sm" />
            {!d.summary_approved_at && (
              <Button size="sm" onClick={onApproveSummary}>Approve summary & file</Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
