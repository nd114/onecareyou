import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { AuroraField } from "@/components/home/AuroraField";

/**
 * The signed-out page furniture, extracted from the homepage.
 *
 * The five marketing tabs were each carrying their own hero, their own heading
 * scale and their own idea of a section, which is why they read as five
 * different products. These are the homepage's pieces, so a tab extends the
 * argument instead of restarting it.
 */

/** Gold rule + tracked label. The rule is the page's signature; keep it. */
export function Eyebrow({ children, tone = "dark" }: { children: React.ReactNode; tone?: "dark" | "light" }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn("h-px w-10", tone === "light" ? "bg-[hsl(var(--gold))]" : "bg-[hsl(var(--gold))]")}
        aria-hidden
      />
      <span className={cn("eyebrow", tone === "light" ? "text-[hsl(var(--gold))]" : "text-primary/75")}>
        {children}
      </span>
    </div>
  );
}

interface HeroProps {
  eyebrow: string;
  title: React.ReactNode;
  lede: React.ReactNode;
  /** Small print under the buttons — the promise, not a disclaimer. */
  note?: React.ReactNode;
  primary?: { to: string; label: string };
  secondary?: { to: string; label: string };
  /** The right-hand column. A tab earns one only if it has something to show. */
  aside?: React.ReactNode;
}

export function MarketingHero({ eyebrow, title, lede, note, primary, secondary, aside }: HeroProps) {
  return (
    <section className="oc-hero-ground relative isolate overflow-hidden">
      <AuroraField />
      <div className="relative mx-auto max-w-7xl px-6 pb-12 pt-12 sm:pb-16 sm:pt-16 lg:pb-20 lg:pt-20">
        <div className={cn("grid items-center gap-10 lg:gap-14", aside && "lg:grid-cols-12")}>
          <div className={cn("oc-rise", aside ? "lg:col-span-6" : "max-w-3xl")}>
            <div className="mb-7">
              <Eyebrow>{eyebrow}</Eyebrow>
            </div>

            <h1 className="font-display text-[2.4rem] leading-[1.04] tracking-[-0.02em] sm:text-5xl lg:text-[3.6rem]">
              {title}
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {lede}
            </p>

            {(primary || secondary) && (
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                {primary && (
                  <Link to={primary.to} className={ctaPrimary}>
                    {primary.label}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
                {secondary && (
                  <Link to={secondary.to} className={ctaSecondary}>
                    {secondary.label}
                  </Link>
                )}
              </div>
            )}

            {note && <p className="mt-5 text-xs text-muted-foreground">{note}</p>}
          </div>

          {aside && (
            <div className="oc-rise lg:col-span-6" style={{ animationDelay: "120ms" }}>
              {aside}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export const ctaPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold tracking-wide text-primary-foreground transition-colors hover:bg-[hsl(var(--emerald-mid))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export const ctaSecondary =
  "inline-flex items-center justify-center rounded-full border border-primary/25 px-7 py-3.5 text-sm font-semibold tracking-wide text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export function SectionHeading({
  eyebrow,
  title,
  lede,
  tone = "dark",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow && (
        <div className="mb-6">
          <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
        </div>
      )}
      <h2 className="font-display text-3xl leading-tight tracking-[-0.015em] sm:text-4xl">{title}</h2>
      {lede && (
        <p
          className={cn(
            "mt-4 leading-relaxed",
            tone === "light" ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

/**
 * Cells that share a hairline rather than each carrying a border — the same
 * grouping idea as Panel, at page scale. `gap-px` over a tinted background is
 * what makes the seams a single pixel wide at every breakpoint.
 */
export function HairlineGrid({
  className,
  cellClassName,
  children,
}: {
  className?: string;
  cellClassName?: string;
  children: React.ReactNode[];
}) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-2xl border border-primary/10 bg-primary/10",
        className,
      )}
    >
      {children.map((child, i) => (
        <div key={i} className={cn("bg-background p-6 sm:p-7", cellClassName)}>
          {child}
        </div>
      ))}
    </div>
  );
}

/** The closing block. Every tab ends by asking for the same thing. */
export function ClosingCta({
  title,
  lede,
  to = "/sign-up",
  label = "Start your record",
  note,
}: {
  title: React.ReactNode;
  lede: React.ReactNode;
  to?: string;
  label?: string;
  note?: React.ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden border-t border-primary/10">
      <AuroraField className="opacity-70" />
      <div className="relative mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
        <h2 className="font-display text-3xl leading-tight tracking-[-0.015em] sm:text-5xl">{title}</h2>
        <p className="mx-auto mt-5 max-w-xl text-muted-foreground">{lede}</p>
        <Link to={to} className={cn(ctaPrimary, "mt-9 px-8 py-4")}>
          {label}
          <ArrowRight className="h-4 w-4" />
        </Link>
        {note && <p className="mt-5 text-xs text-muted-foreground">{note}</p>}
      </div>
    </section>
  );
}
