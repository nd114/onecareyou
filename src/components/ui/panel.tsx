import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Panel — the surface language from the signed-out consent demo, extracted so
 * the app can speak it too.
 *
 * The difference between this and Card is not decoration, it is grouping. A
 * Card says "here is a box". A Panel says "here is one thing, and these are the
 * facts inside it". Five facts become five rows under one header instead of
 * five bordered boxes stacked down the page, which is what made the signed-in
 * screens feel rigid: every fact was given the same structural weight as every
 * other, so nothing read as belonging to anything.
 *
 * Use Panel + PanelRow wherever the content is a list of comparable facts —
 * a queue, a medication list, a document shelf, a set of shares. Keep Card for
 * genuinely standalone objects (a single stat, a form, a dialog body).
 */

const Panel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "overflow-hidden rounded-2xl border border-primary/15 bg-card/85 backdrop-blur-sm",
        "shadow-[0_1px_0_hsl(var(--primary)/0.06),0_24px_60px_-30px_hsl(var(--primary)/0.4)]",
        className,
      )}
      {...props}
    />
  ),
);
Panel.displayName = "Panel";

/**
 * The tinted band at the top. `eyebrow` is the small tracked label; anything
 * passed as children sits to its right, which is where actions belong.
 */
interface PanelHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow: React.ReactNode;
  description?: React.ReactNode;
  /** Full-width content under the eyebrow row — filters, share pills, a search. */
  below?: React.ReactNode;
}

const PanelHeader = React.forwardRef<HTMLDivElement, PanelHeaderProps>(
  ({ className, eyebrow, description, below, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("border-b border-primary/10 bg-secondary/60 px-4 py-3.5 sm:px-6", className)}
      {...props}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/70">
            {eyebrow}
          </p>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
      </div>
      {below && <div className="mt-3">{below}</div>}
    </div>
  ),
);
PanelHeader.displayName = "PanelHeader";

/** Hairline-separated rows. The hairline is the whole point — it groups. */
const PanelRows = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn("divide-y divide-primary/[0.07]", className)} {...props} />
  ),
);
PanelRows.displayName = "PanelRows";

/**
 * One row: an optional glyph, an overline of metadata, a label/detail stack,
 * and an optional trailing note.
 *
 * Pass `onSelect` for a row that opens something and the row body becomes a
 * real button — full width, focusable, with a visible ring — so a keyboard
 * user gets the same row a mouse user does. `interactive` alone gives the
 * hover wash without claiming the row is operable, for rows whose control
 * lives in `trailing`.
 *
 * Note that with `onSelect` the padding sits on the button rather than the
 * `li`, so `className` cannot change it — pass `bodyClassName` instead.
 */
interface PanelRowProps extends Omit<React.LiHTMLAttributes<HTMLLIElement>, "onSelect"> {
  glyph?: React.ReactNode;
  /** Small metadata line above the label — a kind, a priority, whose it is. */
  overline?: React.ReactNode;
  label: React.ReactNode;
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
  interactive?: boolean;
  /** Makes the row body a button. Implies `interactive`. */
  onSelect?: () => void;
  /** Accessible name for the row button when the label alone is not enough. */
  selectLabel?: string;
  /** Classes for the row body — the only way to reach padding when `onSelect` is set. */
  bodyClassName?: string;
  /** For rows that treat the detail line as state — redacted, pending, stale. */
  detailClassName?: string;
}

const PanelRow = React.forwardRef<HTMLLIElement, PanelRowProps>(
  (
    {
      className,
      glyph,
      overline,
      label,
      detail,
      detailClassName,
      trailing,
      interactive,
      onSelect,
      selectLabel,
      bodyClassName,
      children,
      ...props
    },
    ref,
  ) => {
    const body = (
      <>
        {glyph && <span className="shrink-0">{glyph}</span>}
        <span className="min-w-0 flex-1">
          {overline && (
            <span className="mb-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {overline}
            </span>
          )}
          <span className="block truncate text-sm font-medium">{label}</span>
          {detail && (
            <span className={cn("block truncate text-xs text-muted-foreground", detailClassName)}>
              {detail}
            </span>
          )}
          {children}
        </span>
        {trailing && <span className="shrink-0 text-right">{trailing}</span>}
      </>
    );

    const padding = "px-4 py-3 sm:px-6 sm:py-3.5";

    return (
      <li
        ref={ref}
        className={cn(
          !onSelect && `flex items-center gap-3 ${padding}`,
          !onSelect && interactive && "cursor-pointer transition-colors hover:bg-secondary/40",
          className,
        )}
        {...props}
      >
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            aria-label={selectLabel}
            className={cn(
              `flex w-full items-center gap-3 text-left ${padding}`,
              "transition-colors hover:bg-secondary/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              bodyClassName,
            )}
          >
            {body}
          </button>
        ) : (
          body
        )}
      </li>
    );
  },
);
PanelRow.displayName = "PanelRow";

/**
 * The round status glyph. `tone` carries meaning, so it takes the same names
 * the rest of the app uses for state rather than colour names.
 */
const GLYPH_TONES = {
  active: "bg-[hsl(var(--emerald-light))] text-primary",
  muted: "bg-muted text-muted-foreground",
  attention: "bg-[hsl(var(--gold-light))] text-[hsl(var(--accent-foreground))]",
  alert: "bg-destructive/12 text-destructive",
} as const;

interface PanelGlyphProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof GLYPH_TONES;
}

const PanelGlyph = React.forwardRef<HTMLSpanElement, PanelGlyphProps>(
  ({ className, tone = "active", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-full transition-colors duration-300 [&>svg]:h-3.5 [&>svg]:w-3.5",
        GLYPH_TONES[tone],
        className,
      )}
      {...props}
    />
  ),
);
PanelGlyph.displayName = "PanelGlyph";

/**
 * A row for the empty case. A panel with no rows should still say what would
 * be here, in the panel's own voice, rather than collapsing to a bare border.
 */
const PanelEmpty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("px-4 py-8 text-center text-sm text-muted-foreground sm:px-6", className)}
      {...props}
    />
  ),
);
PanelEmpty.displayName = "PanelEmpty";

/** Free-form panel body, for content that is not a list of rows. */
const PanelBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-4 py-4 sm:px-6", className)} {...props} />
  ),
);
PanelBody.displayName = "PanelBody";

export { Panel, PanelHeader, PanelRows, PanelRow, PanelGlyph, PanelEmpty, PanelBody };
