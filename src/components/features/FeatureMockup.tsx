import {
  Activity,
  Pill,
  ShieldCheck,
  Camera,
  Clock,
  Users,
  TrendingUp,
  Check,
} from "lucide-react";

/**
 * Lightweight CSS mockups shown next to each core feature on /features.
 * No screenshots — themed panels that flip cleanly in dark mode.
 */

function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-primary/15 bg-card shadow-lg overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-primary/10 bg-muted/40">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/60" />
        <span className="ml-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          onecare.you
        </span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function CareCircleMockup() {
  const people = [
    { name: "Dr. Adler", role: "Cardiologist", initials: "DA" },
    { name: "Nurse Bell", role: "Care team", initials: "NB" },
    { name: "Family — Rowan", role: "Caregiver", initials: "R" },
  ];
  return (
    <BrowserFrame>
      <p className="eyebrow text-primary mb-3">Care Circle</p>
      <p className="font-display text-lg font-bold mb-4">Shared with 3 people</p>
      <ul className="space-y-2">
        {people.map((p) => (
          <li
            key={p.name}
            className="flex items-center gap-3 rounded-lg border border-primary/10 bg-background/60 p-3"
          >
            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
              {p.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.role}</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80">
              Active
            </span>
          </li>
        ))}
      </ul>
    </BrowserFrame>
  );
}

export function VitalsMockup() {
  return (
    <BrowserFrame>
      <div className="flex items-center justify-between mb-3">
        <p className="eyebrow text-primary">Blood Pressure · 30d</p>
        <TrendingUp className="h-4 w-4 text-primary" />
      </div>
      <div className="flex items-end gap-1.5 h-24 mb-3">
        {[40, 55, 48, 62, 58, 70, 66, 75, 68, 80, 72, 78].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm bg-gradient-to-t from-primary to-primary/60"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-primary/10 p-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg</p>
          <p className="font-display text-base font-bold">124/81</p>
        </div>
        <div className="rounded-lg border border-primary/10 p-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Trend</p>
          <p className="font-display text-base font-bold text-primary">↓ 4%</p>
        </div>
        <div className="rounded-lg border border-primary/10 p-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Shared</p>
          <p className="font-display text-base font-bold">Yes</p>
        </div>
      </div>
    </BrowserFrame>
  );
}

export function InteractionsMockup() {
  const rows = [
    { a: "Warfarin", b: "Ibuprofen", severity: "High", color: "bg-destructive/15 text-destructive" },
    { a: "Metformin", b: "Contrast dye", severity: "Moderate", color: "bg-accent/20 text-accent-foreground" },
    { a: "Lisinopril", b: "Potassium", severity: "Low", color: "bg-primary/10 text-primary" },
  ];
  return (
    <BrowserFrame>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="eyebrow text-primary">Interactions</p>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.a}
            className="flex items-center justify-between gap-3 rounded-lg border border-primary/10 p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {r.a} <span className="text-muted-foreground">×</span> {r.b}
              </p>
              <p className="text-xs text-muted-foreground">Reviewed just now</p>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${r.color}`}>
              {r.severity}
            </span>
          </li>
        ))}
      </ul>
    </BrowserFrame>
  );
}

export function PhotoIdMockup() {
  return (
    <BrowserFrame>
      <div className="grid grid-cols-2 gap-4 items-center">
        <div className="aspect-square rounded-xl border border-primary/15 bg-gradient-to-br from-muted to-background flex items-center justify-center">
          <div className="h-16 w-24 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Pill className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div>
          <p className="eyebrow text-primary mb-2">Identified</p>
          <p className="font-display text-lg font-bold">Lisinopril 10 mg</p>
          <p className="text-xs text-muted-foreground mb-3">
            ACE inhibitor · Once daily
          </p>
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <Check className="h-3.5 w-3.5" /> Matched with 98% confidence
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Camera className="h-3.5 w-3.5" /> Snapped from label
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

export function ScheduleMockup() {
  const slots = [
    { time: "08:00", label: "Metformin 500 mg", state: "done" },
    { time: "12:30", label: "Lisinopril 10 mg", state: "due" },
    { time: "18:00", label: "Atorvastatin 20 mg", state: "later" },
    { time: "22:00", label: "Melatonin 3 mg", state: "later" },
  ];
  return (
    <BrowserFrame>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-primary" />
        <p className="eyebrow text-primary">Today's schedule</p>
      </div>
      <ul className="space-y-2">
        {slots.map((s) => (
          <li
            key={s.time}
            className="flex items-center gap-3 rounded-lg border border-primary/10 p-3"
          >
            <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">
              {s.time}
            </span>
            <span className="flex-1 text-sm font-medium truncate">{s.label}</span>
            {s.state === "done" && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                <Check className="h-3 w-3" /> Taken
              </span>
            )}
            {s.state === "due" && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-foreground bg-accent/20 px-2 py-0.5 rounded-full">
                Due now
              </span>
            )}
            {s.state === "later" && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Later
              </span>
            )}
          </li>
        ))}
      </ul>
    </BrowserFrame>
  );
}

export const FEATURE_MOCKUPS: Record<string, React.FC> = {
  "Care Circle": CareCircleMockup,
  "Vitals & Lab Tracking": VitalsMockup,
  "Drug Interaction Checking": InteractionsMockup,
  "Photo Medication Identification": PhotoIdMockup,
  "Smart Scheduling": ScheduleMockup,
};

export const FEATURE_ICONS = { Activity, Pill, ShieldCheck, Camera, Clock, Users };
