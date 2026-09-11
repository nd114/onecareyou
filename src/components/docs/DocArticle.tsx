import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';
import { slugifyHeading } from '@/lib/docs';

interface DocArticleProps {
  content: string;
  className?: string;
}

function headingText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(headingText).join('');
  if (children && typeof children === 'object' && 'props' in (children as any)) {
    return headingText((children as any).props?.children);
  }
  return '';
}

/**
 * Documentation prose, as opposed to a chat bubble.
 *
 * The assistant's renderer squeezes everything down so it fits a message;
 * documentation is read for minutes, so it gets real type scale, real rhythm
 * and — the part that makes it documentation rather than a page of text —
 * headings with ids, so any section can be linked to directly.
 */
export function DocArticle({ content, className }: DocArticleProps) {
  return (
    <div
      className={cn(
        'max-w-3xl text-[15px] leading-7 text-foreground/90',
        '[&>*:first-child]:mt-0',
        '[&_p]:my-4',
        '[&_strong]:font-semibold [&_strong]:text-foreground',
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-primary/40 hover:[&_a]:decoration-primary',
        '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-4 [&_ul]:space-y-2',
        '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-4 [&_ol]:space-y-2',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:font-mono',
        '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_blockquote]:my-5 [&_blockquote]:rounded-r-lg [&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:bg-primary/5 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-muted-foreground',
        '[&_hr]:my-10 [&_hr]:border-border',
        '[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
        '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold',
        '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              id={slugifyHeading(headingText(children))}
              className="scroll-mt-28 font-display text-xl font-semibold text-foreground mt-10 mb-3 border-t border-border/60 pt-8 first:border-0 first:pt-0"
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              id={slugifyHeading(headingText(children))}
              className="scroll-mt-28 text-base font-semibold text-foreground mt-6 mb-2"
            >
              {children}
            </h3>
          ),
          a: ({ node, href, ...props }) => {
            const external = Boolean(href && /^https?:\/\//.test(href));
            return (
              <a
                {...props}
                href={href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
