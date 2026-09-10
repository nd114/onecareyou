import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Dictation button, shared by the patient and clinician assistants.
 *
 * Speech is appended to the message draft — never sent automatically — so the
 * person can read it back (and correct it) before it goes anywhere. Recognition
 * keeps running through natural pauses until they press stop.
 *
 * It lived inside the patient chat panel, which is why the clinician assistant
 * had no microphone at all: the same duty, the same behaviour, one place.
 */
export function DictateButton({
  onFinalText,
  onInterimText,
  disabled,
}: {
  onFinalText: (text: string) => void;
  onInterimText: (text: string) => void;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const wantsListeningRef = useRef(false);

  const supported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => () => {
    wantsListeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const stop = () => {
    wantsListeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    setListening(false);
    onInterimText('');
  };

  const toggle = () => {
    if (listening) {
      stop();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interimText += chunk;
      }
      if (finalText.trim()) onFinalText(finalText.trim());
      onInterimText(interimText.trim());
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' / 'aborted' fire on quiet gaps — keep listening.
      if (event?.error === 'no-speech' || event?.error === 'aborted') return;
      stop();
    };

    recognition.onend = () => {
      if (wantsListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          /* fall through to stopping */
        }
      }
      setListening(false);
      onInterimText('');
    };

    recognitionRef.current = recognition;
    wantsListeningRef.current = true;
    recognition.start();
    setListening(true);
  };

  if (!supported) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant={listening ? 'destructive' : 'outline'}
      onClick={toggle}
      disabled={disabled}
      className="h-9 w-9 flex-shrink-0"
      title={listening ? 'Stop dictating' : 'Dictate your message'}
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}
