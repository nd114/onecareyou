import { useMemo, useState } from "react";
import { Check, Lock, Building2, UserRound, HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The hero, and the argument.
 *
 * Every health app says the patient is in control. This one lets a visitor
 * operate the control before they sign up: turn a doctor off and watch the
 * record close to them, line by line. It is the product's thesis made
 * touchable, and the rest of the page is evidence for it.
 *
 * Nothing here is a mock of something we do not have. Each row is a real
 * sharing category and each relationship is a real pathway — a clinician the
 * patient invited, a hospital they shared with, someone in their care circle.
 */

interface Viewer {
  id: string;
  name: string;
  role: string;
  icon: typeof UserRound;
  sees: string[];
  on: boolean;
}

const ROWS = [
  { key: "vitals", label: "Blood pressure", value: "128/82", detail: "this morning" },
  { key: "meds", label: "Medications", value: "4 active", detail: "2 changed recently" },
  { key: "notes", label: "Visit summary", value: "Annual review", detail: "signed 12 May" },
  { key: "labs", label: "Lab results", value: "HbA1c 6.8%", detail: "down from 7.4%" },
  { key: "vault", label: "Scans and letters", value: "9 documents", detail: "yours to share" },
];

const INITIAL: Viewer[] = [
  { id: "gp", name: "Dr Jane Evans", role: "your GP", icon: UserRound,
    sees: ["vitals", "meds", "notes", "labs", "vault"], on: true },
  { id: "hospital", name: "City General", role: "cardiology", icon: Building2,
    sees: ["vitals", "meds", "labs"], on: true },
  { id: "family", name: "Amara", role: "your sister", icon: HeartHandshake,
    sees: ["meds"], on: false },
];

export function ConsentDemo() {
  const [viewers, setViewers] = useState<Viewer[]>(INITIAL);
  const [touched, setTouched] = useState(false);

  const visible = useMemo(
    () => new Set(viewers.filter((v) => v.on).flatMap((v) => v.sees)),
    [viewers],
  );

  const toggle = (id: string) => {
    setTouched(true);
    setViewers((prev) => prev.map((v) => (v.id === id ? { ...v, on: !v.on } : v)));
  };

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-primary/15 bg-background/85 shadow-[0_1px_0_hsl(var(--primary)/0.06),0_24px_60px_-30px_hsl(var(--primary)/0.4)] backdrop-blur-sm">
        <div className="border-b border-primary/10 bg-[hsl(var(--secondary))]/60 px-4 py-3.5 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/70">
            Who can see your record
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {viewers.map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => toggle(v.id)}
                  aria-pressed={v.on}
                  aria-label={`${v.name}, ${v.role}. ${v.on ? "Sharing. Tap to stop." : "Not sharing. Tap to share."}`}
                  className={cn(
                    "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-left",
                    "transition-colors duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    v.on
                      ? "border-primary/30 bg-primary text-primary-foreground"
                      : "border-primary/20 text-foreground/55 hover:border-primary/40",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs font-medium leading-tight">
                    {v.name}
                    <span className={cn("ml-1.5 font-normal", v.on ? "text-primary-foreground/70" : "text-foreground/40")}>
                      {v.role}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "ml-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
                      v.on ? "border-primary-foreground/40 bg-primary-foreground/15" : "border-foreground/25",
                    )}
                  >
                    {v.on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <ul className="divide-y divide-primary/[0.07]">
          {ROWS.map((row) => {
            const open = visible.has(row.key);
            return (
              <li key={row.key} className="flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-3.5">
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-300",
                    open ? "bg-[hsl(var(--emerald-light))] text-primary" : "bg-muted text-foreground/30",
                  )}
                >
                  {open ? <Check className="h-3 w-3" strokeWidth={3} /> : <Lock className="h-3 w-3" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{row.label}</span>
                  <span
                    className={cn(
                      "block text-xs transition-all duration-300",
                      open ? "text-muted-foreground blur-0" : "select-none text-foreground/25 blur-[3px]",
                    )}
                  >
                    {open ? `${row.value} · ${row.detail}` : "•••••• · ••••••••••"}
                  </span>
                </span>

                <span
                  className={cn(
                    "shrink-0 text-[11px] font-medium transition-colors duration-300",
                    open ? "text-primary" : "text-foreground/30",
                  )}
                >
                  {open ? "Shared" : "Private"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <p
        className={cn(
          "mt-3 text-center text-xs leading-relaxed text-muted-foreground transition-opacity duration-500 sm:text-left",
          touched ? "opacity-100" : "opacity-0",
        )}
        aria-live="polite"
      >
        That is not the screen hiding a row. Turn someone off and the database stops
        returning it to them.
      </p>
    </div>
  );
}
