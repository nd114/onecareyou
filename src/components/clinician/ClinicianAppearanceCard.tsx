import { Check, LayoutGrid, Monitor, PanelLeft, Smartphone, Sun } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useClinicianAppearance,
  type ClinicianNavLayout,
  type ClinicianSurface,
} from '@/hooks/useClinicianAppearance';

interface Option<T extends string> {
  value: T;
  label: string;
  description: string;
  swatch: string[];
}

const SURFACES: Option<ClinicianSurface>[] = [
  {
    value: 'warm',
    label: 'Warm Sanctuary',
    description: 'The OneCare cream, forest emerald and gold. Softer for long reading and night shifts.',
    swatch: ['hsl(45 56% 92%)', 'hsl(158 78% 17%)', 'hsl(43 55% 54%)'],
  },
  {
    value: 'console',
    label: 'Crisp Console',
    description: 'Paper and chalk with charcoal text. Amber and red alerts carry further when scanning a full list.',
    swatch: ['hsl(160 15% 95.5%)', 'hsl(163 80% 22%)', 'hsl(347 72% 42%)'],
  },
];

const LAYOUTS: Option<ClinicianNavLayout>[] = [
  {
    value: 'tabs',
    label: 'Top sections & tabs',
    description: 'The familiar two rows across the top of every page.',
    swatch: [],
  },
  {
    value: 'rail',
    label: 'Side panel',
    description: 'Every section listed down the left, collapsible, with the page taking the full height of the screen.',
    swatch: [],
  },
];

/**
 * Two choices, applied the instant they are made and remembered on this device.
 * Deliberately not on the account: "how I like this screen" is not the same
 * answer on a phone at the bedside and a monitor at the nursing station.
 */
export function ClinicianAppearanceCard() {
  const { surface, navLayout, setSurface, setNavLayout } = useClinicianAppearance();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="h-5 w-5" />
          Look &amp; layout
        </CardTitle>
        <CardDescription>
          How your workspace looks, and where its navigation sits on a computer screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium">Colour theme</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SURFACES.map((option) => {
              const isActive = surface === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setSurface(option.value);
                    toast.success(`${option.label} applied`);
                  }}
                  aria-pressed={isActive}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-colors',
                    isActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium">{option.label}</span>
                    {isActive && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="mb-2 flex gap-1.5">
                    {option.swatch.map((colour) => (
                      <span
                        key={colour}
                        style={{ background: colour }}
                        className="h-5 w-8 rounded-md border border-border/60"
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Navigation on computers &amp; large tablets</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {LAYOUTS.map((option) => {
              const isActive = navLayout === option.value;
              const Icon = option.value === 'rail' ? PanelLeft : LayoutGrid;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setNavLayout(option.value);
                    toast.success(`${option.label} applied`);
                  }}
                  aria-pressed={isActive}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-colors',
                    isActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {option.label}
                    </span>
                    {isActive && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </button>
              );
            })}
          </div>
          {/* Said plainly, because choosing a side panel and then picking up a
              phone should not look like the setting was ignored. */}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            On a phone your workspace always keeps the bottom bar and menu, so it stays
            one-handed at the bedside whichever option you choose here.
          </p>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Both choices are saved on this device, so your phone and your clinic screen can differ.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
