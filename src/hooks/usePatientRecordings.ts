import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { edgeFunctionError } from '@/lib/edge-function-error';
import { useAuth } from '@/contexts/AuthContext';
import { useAIConsent } from '@/hooks/useAIConsent';
import { toast } from 'sonner';
import {
  RECORDING_NOTICE_VERSION,
  normaliseRecordingTitle,
  recordingFileName,
  transcriptFileBody,
  type RecordingConsent,
} from '@/lib/recording-consent';

/**
 * A patient's own recordings of their appointments.
 *
 * The audio and the transcript are ordinary Health Vault documents, so they
 * inherit sharing, archiving, search and download without a second mechanism
 * being invented for them. This table holds what the Vault cannot: the name of
 * the recording, when the conversation happened, and — the part that matters —
 * which version of the notice the patient acknowledged before they pressed
 * record.
 *
 * Transcription is deliberately not automatic. Producing a transcript means
 * sending the audio to a service that can hear it, which is the one thing that
 * takes the recording outside the patient's own storage, so it is a decision
 * they make per recording rather than a default they discover afterwards.
 */

export type TranscriptStatus = 'none' | 'pending' | 'ready' | 'failed';

export interface PatientRecording {
  id: string;
  user_id: string;
  title: string;
  recorded_at: string;
  duration_seconds: number | null;
  audio_document_id: string | null;
  transcript_document_id: string | null;
  transcript: string | null;
  transcript_status: TranscriptStatus;
  consent_acknowledged_at: string;
  consent_notice_version: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The Vault category recordings land in, so they group and filter with everything else. */
export const RECORDING_CATEGORY = 'recording';

/** webm is what MediaRecorder gives us nearly everywhere; Safari hands back mp4. */
function extensionForMime(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

/**
 * Hand a blob to the browser as a file.
 *
 * Used for the transcript, which is generated in the page and never needs a
 * round trip to storage to be saved. Audio goes through a signed URL instead,
 * because it is already in the bucket and re-downloading it into memory just
 * to save it again would double the transfer for no gain.
 */
function saveBlobToDevice(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately races the download in Safari; a tick is enough.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Said in one place so the pre-flight check and the page agree word for word.
 *
 * Names the consequence rather than the setting: "turn on AI processing" tells
 * somebody what to click, not what it means for their consultation.
 */
export const TRANSCRIPTION_NEEDS_CONSENT =
  'Writing a transcript means sending this recording to a transcription service, so it needs ' +
  'AI processing turned on in Settings first.';

export function usePatientRecordings() {
  const { user } = useAuth();
  const { hasConsent: hasAIConsent } = useAIConsent();
  const queryClient = useQueryClient();

  const { data: recordings = [], isLoading } = useQuery({
    queryKey: ['patient-recordings', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('patient_recordings')
        .select('*')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PatientRecording[];
    },
    enabled: !!user,
  });

  const active = recordings.filter((r) => !r.archived_at);
  const archived = recordings.filter((r) => Boolean(r.archived_at));

  /**
   * Save a finished recording.
   *
   * The audio lands in the Vault first. If that fails there is nothing worth
   * writing a row about, and a row pointing at an upload that never happened
   * is worse than no row: it shows the patient a recording they cannot play.
   */
  const saveRecording = useMutation({
    mutationFn: async ({
      blob,
      title,
      durationSeconds,
      consent,
      recordedAt,
    }: {
      blob: Blob;
      title: string;
      durationSeconds: number;
      consent: RecordingConsent;
      recordedAt?: Date;
    }) => {
      if (!user) throw new Error('Not authenticated');
      if (blob.size === 0) throw new Error('That recording is empty');

      const when = recordedAt ?? new Date();
      const cleanTitle = normaliseRecordingTitle(title, when);
      const ext = extensionForMime(blob.type || 'audio/webm');
      const fileName = recordingFileName(cleanTitle, ext);
      const filePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('health-documents')
        .upload(filePath, blob, { contentType: blob.type || 'audio/webm' });
      if (uploadError) throw uploadError;

      const { data: doc, error: docError } = await supabase
        .from('health_documents')
        .insert({
          user_id: user.id,
          file_path: filePath,
          file_name: fileName,
          file_size: blob.size,
          mime_type: blob.type || 'audio/webm',
          title: cleanTitle,
          category: RECORDING_CATEGORY,
          document_date: when.toISOString().slice(0, 10),
          source_context: 'patient_recording',
          tags: ['recording'],
        })
        .select()
        .single();
      if (docError) {
        // Do not leave an orphan in the bucket counting against their storage.
        await supabase.storage.from('health-documents').remove([filePath]);
        throw docError;
      }

      const { data, error } = await supabase
        .from('patient_recordings')
        .insert({
          user_id: user.id,
          title: cleanTitle,
          recorded_at: when.toISOString(),
          duration_seconds: Math.max(0, Math.round(durationSeconds)),
          audio_document_id: doc.id,
          consent_acknowledged_at: consent.acknowledgedAt,
          consent_notice_version: consent.noticeVersion,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as PatientRecording;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-recordings'] });
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      toast.success('Saved to your Vault');
    },
    onError: (e: Error) => {
      console.error('Saving recording failed', e);
      toast.error('Could not save that recording: ' + e.message);
    },
  });

  /**
   * Ask for a transcript.
   *
   * Separate from saving on purpose — see the note at the top of the file. The
   * status goes to 'pending' before the call so a patient who navigates away
   * and back sees that something is in flight rather than an empty transcript
   * and a button that looks untouched.
   */
  const requestTranscript = useMutation({
    mutationFn: async (recording: PatientRecording) => {
      if (!user) throw new Error('Not authenticated');
      if (!recording.audio_document_id) throw new Error('This recording has no audio to transcribe');

      // Asked and answered here rather than only at the server, so somebody
      // who has not turned AI processing on is told what to do instead of
      // watching a request go out and come back refused. The function checks
      // it too — that is the boundary; this is the courtesy.
      if (!hasAIConsent) throw new Error(TRANSCRIPTION_NEEDS_CONSENT);

      await supabase
        .from('patient_recordings')
        .update({ transcript_status: 'pending' })
        .eq('id', recording.id);
      queryClient.invalidateQueries({ queryKey: ['patient-recordings'] });

      const { data, error } = await supabase.functions.invoke('transcribe-recording', {
        body: { recordingId: recording.id },
      });
      if (error) {
        // The function marks its own failures, but a network error never
        // reaches it, so clear the pending state here too rather than leaving
        // a spinner that outlives the request.
        await supabase
          .from('patient_recordings')
          .update({ transcript_status: 'failed' })
          .eq('id', recording.id);
        // `functions.invoke` throws "Edge Function returned a non-2xx status
        // code" whatever the function said. The reason it actually gave — too
        // long, nothing audible, consent not given — is in the response body,
        // and is the only part worth showing anybody.
        const { message } = await edgeFunctionError(error);
        throw new Error(message);
      }
      return data as { transcript?: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-recordings'] });
      toast.success('Transcript ready — read it against your own memory before you rely on it');
    },
    onError: (e: Error) => {
      console.error('Transcription failed', e);
      queryClient.invalidateQueries({ queryKey: ['patient-recordings'] });
      // Two things every failure here has to say: what went wrong, and that
      // the recording itself is untouched. Somebody who asked for a transcript
      // and saw an error will assume they have lost the audio too.
      toast.error(e.message, {
        description: 'Your recording is safe — only the transcript failed.',
        duration: 8000,
      });
    },
  });

  /** Put the transcript in the Vault as its own document, next to the audio. */
  const saveTranscriptToVault = useMutation({
    mutationFn: async (recording: PatientRecording) => {
      if (!user) throw new Error('Not authenticated');
      const text = recording.transcript?.trim();
      if (!text) throw new Error('There is no transcript to save yet');
      if (recording.transcript_document_id) throw new Error('That transcript is already in your Vault');

      const body = transcriptFileBody(recording);
      const fileName = recordingFileName(`${recording.title} transcript`, 'txt');
      const filePath = `${user.id}/${crypto.randomUUID()}.txt`;
      const blob = new Blob([body], { type: 'text/plain' });

      const { error: uploadError } = await supabase.storage
        .from('health-documents')
        .upload(filePath, blob, { contentType: 'text/plain' });
      if (uploadError) throw uploadError;

      const { data: doc, error: docError } = await supabase
        .from('health_documents')
        .insert({
          user_id: user.id,
          file_path: filePath,
          file_name: fileName,
          file_size: blob.size,
          mime_type: 'text/plain',
          title: `${recording.title} — transcript`,
          category: RECORDING_CATEGORY,
          document_date: recording.recorded_at.slice(0, 10),
          source_context: 'patient_recording',
          tags: ['recording', 'transcript'],
        })
        .select()
        .single();
      if (docError) {
        await supabase.storage.from('health-documents').remove([filePath]);
        throw docError;
      }

      const { error } = await supabase
        .from('patient_recordings')
        .update({ transcript_document_id: doc.id })
        .eq('id', recording.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-recordings'] });
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      toast.success('Transcript saved to your Vault');
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const renameRecording = useMutation({
    mutationFn: async ({ recording, title }: { recording: PatientRecording; title: string }) => {
      const clean = normaliseRecordingTitle(title, new Date(recording.recorded_at));
      const { error } = await supabase
        .from('patient_recordings')
        .update({ title: clean })
        .eq('id', recording.id);
      if (error) throw error;

      // Keep the Vault copies in step, otherwise renaming here leaves the
      // patient hunting for a document still called "Tue, 3 Sep, 09:15".
      const docIds = [recording.audio_document_id, recording.transcript_document_id].filter(
        (id): id is string => Boolean(id),
      );
      if (docIds.length > 0) {
        await supabase
          .from('health_documents')
          .update({ title: clean })
          .eq('id', docIds[0]);
        if (docIds[1]) {
          await supabase
            .from('health_documents')
            .update({ title: `${clean} — transcript` })
            .eq('id', docIds[1]);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-recordings'] });
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      toast.success('Renamed');
    },
    onError: (e: Error) => toast.error('Could not rename: ' + e.message),
  });

  /**
   * Archive, not delete.
   *
   * Same rule as the rest of the Vault: putting something away is not the same
   * act as destroying it, and a recording of a conversation about your own
   * health is exactly the kind of thing people want back a year later.
   */
  const archiveRecording = useMutation({
    mutationFn: async (recording: PatientRecording) => {
      const { error } = await supabase
        .from('patient_recordings')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', recording.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-recordings'] });
      toast.success('Moved to your archive');
    },
    onError: (e: Error) => toast.error('Could not archive: ' + e.message),
  });

  const restoreRecording = useMutation({
    mutationFn: async (recording: PatientRecording) => {
      const { error } = await supabase
        .from('patient_recordings')
        .update({ archived_at: null })
        .eq('id', recording.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-recordings'] });
      toast.success('Restored');
    },
    onError: (e: Error) => toast.error('Could not restore: ' + e.message),
  });

  /**
   * A signed URL for playback.
   *
   * Separate from the download URL because the two want opposite
   * Content-Disposition headers: an <audio> element needs the file served
   * inline, and a save needs it served as an attachment.
   */
  const getAudioUrl = async (recording: PatientRecording): Promise<string | null> => {
    if (!recording.audio_document_id) return null;
    const { data: doc } = await supabase
      .from('health_documents')
      .select('file_path')
      .eq('id', recording.audio_document_id)
      .single();
    if (!doc) return null;
    const { data: signed } = await supabase.storage
      .from('health-documents')
      .createSignedUrl(doc.file_path, 3600);
    return signed?.signedUrl ?? null;
  };

  /** A signed URL that saves rather than opens. */
  const downloadAudio = async (recording: PatientRecording) => {
    if (!recording.audio_document_id) {
      toast.error('This recording has no audio');
      return;
    }
    const { data: doc, error } = await supabase
      .from('health_documents')
      .select('file_path, file_name')
      .eq('id', recording.audio_document_id)
      .single();
    if (error || !doc) {
      toast.error('Could not find that audio file');
      return;
    }
    const { data: signed } = await supabase.storage
      .from('health-documents')
      .createSignedUrl(doc.file_path, 3600, { download: doc.file_name || true });
    if (!signed?.signedUrl) {
      toast.error('Could not prepare that download');
      return;
    }
    window.location.href = signed.signedUrl;
  };

  /** The transcript is already in the page — no round trip needed to save it. */
  const downloadTranscript = (recording: PatientRecording) => {
    if (!recording.transcript?.trim()) {
      toast.error('There is no transcript yet');
      return;
    }
    saveBlobToDevice(
      new Blob([transcriptFileBody(recording)], { type: 'text/plain;charset=utf-8' }),
      recordingFileName(recording.title, 'txt'),
    );
  };

  return {
    recordings,
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
    /** So a menu can explain itself before the patient taps something that will refuse. */
    canTranscribe: hasAIConsent,
    noticeVersion: RECORDING_NOTICE_VERSION,
  };
}
