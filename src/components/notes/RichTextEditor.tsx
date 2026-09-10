import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, Heading1, Heading2, List, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { sanitizeNoteHtml } from '@/lib/sanitize-html';

/**
 * One editor, shared by a patient's personal notes and a clinician's own notes.
 *
 * Deliberately small: headings, bold, italic, underline and lists. Everything
 * saved goes through the allowlist sanitizer, so what comes back out is only
 * what this toolbar can make.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your note…',
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Only push the incoming value in when it differs, or every keystroke would
  // reset the caret to the start of the note.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const run = (command: string, arg?: string) => {
    ref.current?.focus();
    window.document.execCommand(command, false, arg);
    if (ref.current) onChange(sanitizeNoteHtml(ref.current.innerHTML));
  };

  const tools: { icon: typeof Bold; label: string; run: () => void }[] = [
    { icon: Heading1, label: 'Heading', run: () => run('formatBlock', 'H2') },
    { icon: Heading2, label: 'Subheading', run: () => run('formatBlock', 'H3') },
    { icon: Bold, label: 'Bold', run: () => run('bold') },
    { icon: Italic, label: 'Italic', run: () => run('italic') },
    { icon: Underline, label: 'Underline', run: () => run('underline') },
    { icon: List, label: 'Bulleted list', run: () => run('insertUnorderedList') },
    { icon: ListOrdered, label: 'Numbered list', run: () => run('insertOrderedList') },
  ];

  return (
    <div className={cn('rounded-lg border bg-background', className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        {tools.map((t) => (
          <Button
            key={t.label}
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={t.label}
            aria-label={t.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.run}
          >
            <t.icon className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => onChange(sanitizeNoteHtml(ref.current?.innerHTML ?? ''))}
        onBlur={() => onChange(sanitizeNoteHtml(ref.current?.innerHTML ?? ''))}
        onPaste={(e) => {
          // Paste as text: a copied web page brings styles, scripts and tables
          // that have no business in a health note.
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          window.document.execCommand('insertText', false, text);
        }}
        className="prose-sm min-h-[160px] max-w-none px-3 py-2 text-sm outline-none [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}

/** Read-only rendering of a saved note. */
export function NoteBody({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn(
        'text-sm [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1 [&_ul]:list-disc [&_ul]:pl-5',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(html) }}
    />
  );
}
