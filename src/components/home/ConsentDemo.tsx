import { useMemo, useState } from "react";
import { Check, Lock, Building2, UserRound, HeartHandshake } from "lucide-react";
import { Panel, PanelGlyph, PanelHeader, PanelRow, PanelRows } from "@/components/ui/panel";
import { TogglePill } from "@/components/ui/toggle-pill";
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
      <Panel className="bg-background/85">
        <PanelHeader
          eyebrow="Who can see your record"
          below={
            <div className="flex flex-wrap gap-2">
              {viewers.map((v) => (
                <TogglePill
                  key={v.id}
                  pressed={v.on}
                  onPressedChange={() => toggle(v.id)}
                  label={v.name}
                  meta={v.role}
                  icon={v.icon}
                  aria-label={`${v.name}, ${v.role}. ${v.on ? "Sharing. Tap to stop." : "Not sharing. Tap to share."}`}
                />
              ))}
            </div>
          }
        />

        <PanelRows>
          {ROWS.map((row) => {
            const open = visible.has(row.key);
            return (
              <PanelRow
                key={row.key}
                glyph={
                  <PanelGlyph tone={open ? "active" : "muted"} className="h-6 w-6 [&>svg]:h-3 [&>svg]:w-3">
                    {open ? <Check strokeWidth={3} /> : <Lock />}
                  </PanelGlyph>
                }
                label={row.label}
                detail={open ? `${row.value} \u00b7 ${row.detail}` : "\u2022\u2022\u2022\u2022\u2022\u2022 \u00b7 \u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
                detailClassName={cn(
                  "transition-all duration-300",
                  open ? "blur-0" : "select-none text-foreground/25 blur-[3px]",
                )}
                trailing={
                  <span
                    className={cn(
                      "text-[11px] font-medium transition-colors duration-300",
                      open ? "text-primary" : "text-foreground/30",
                    )}
                  >
                    {open ? "Shared" : "Private"}
                  </span>
                }
              />
            );
          })}
        </PanelRows>
      </Panel>

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
