import { Info, Sparkles } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * The Simple Mode choice, offered at onboarding and repeated in Settings.
 *
 * Written as an offer rather than a diagnosis: nobody should have to identify
 * as struggling to pick it. The tooltip says who it helps and why, so the
 * choice is informed instead of a mystery toggle — and it is reachable by
 * keyboard and touch, not hover alone.
 */
export function SimpleModeChoice({
  value,
  onChange,
  className,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <Label htmlFor="simple-mode" className="text-base font-medium">
              Use the simple version
            </Label>

            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* A real button: hover is not available on touch, and this
                      has to be reachable by keyboard. */}
                  <button
                    type="button"
                    aria-label="Who is the simple version for?"
                    className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs space-y-2 text-left">
                  <p className="font-medium">Who it is for</p>
                  <p>
                    Anyone who wants less on screen — people recently out of hospital, older
                    patients, anyone managing care for someone else, or anyone who finds a lot of
                    text and buttons hard going.
                  </p>
                  <p className="font-medium">What changes</p>
                  <p>
                    Bigger text, fewer things on each screen, and plain wording. Your medicines,
                    readings and messages are all still there — nothing is hidden or taken away.
                  </p>
                  <p className="font-medium">Why</p>
                  <p>
                    Missing a dose because a screen was confusing is a health problem, not a design
                    problem. You can switch back any time in Settings.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <p className="text-sm text-muted-foreground">
            Bigger text and fewer things on each screen. You can change this whenever you like.
          </p>
        </div>

        <Switch
          id="simple-mode"
          checked={value}
          onCheckedChange={onChange}
          aria-describedby="simple-mode-hint"
        />
      </div>
      <span id="simple-mode-hint" className="sr-only">
        Turns on a simplified version of OneCare with larger text and fewer options per screen.
      </span>
    </div>
  );
}
