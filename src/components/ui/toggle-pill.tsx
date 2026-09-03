import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * TogglePill — the control from the consent demo.
 *
 * A switch says "a setting changed". This says "this person can see this",
 * because the filled state carries the person's name inside it. That reads
 * better anywhere the thing being toggled is someone or something with an
 * identity: a clinician on a share, a department on a rota, a filter that is
 * really a person.
 *
 * It is a real button with `aria-pressed`, so it announces its state and
 * takes focus. `label` is the name; `meta` is the quiet qualifier beside it.
 */
interface TogglePillProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  pressed: boolean;
  label: React.ReactNode;
  meta?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  onPressedChange?: (pressed: boolean) => void;
}

const TogglePill = React.forwardRef<HTMLButtonElement, TogglePillProps>(
  ({ className, pressed, label, meta, icon: Icon, onPressedChange, onClick, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onPressedChange?.(!pressed);
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-left transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        pressed
          ? "border-primary/30 bg-primary text-primary-foreground"
          : "border-primary/20 text-foreground/55 hover:border-primary/40",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="text-xs font-medium leading-tight">
        {label}
        {meta && (
          <span
            className={cn(
              "ml-1.5 font-normal",
              pressed ? "text-primary-foreground/70" : "text-foreground/40",
            )}
          >
            {meta}
          </span>
        )}
      </span>
      <span
        className={cn(
          "ml-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
          pressed ? "border-primary-foreground/40 bg-primary-foreground/15" : "border-foreground/25",
        )}
      >
        {pressed && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
    </button>
  ),
);
TogglePill.displayName = "TogglePill";

export { TogglePill };
