import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { usePatientOnboarding } from '@/hooks/usePatientOnboarding';
import { cn } from '@/lib/utils';

/**
 * The first four things worth doing, and what has been done already.
 *
 * A clinician has had this since launch. A patient signed up, answered the
 * profile questions and landed on a dashboard of empty cards with no
 * indication of what the product is for or what to do next — the one thing
 * that makes it worth anything, sharing your record with someone, being four
 * taps away and never mentioned.
 *
 * It leaves on its own once the four are done, and it can be put away before
 * then. A checklist that will not go is nagging rather than helping.
 */
export function GettingStartedCard() {
  const { steps, progress, shouldShow, dismiss } = usePatientOnboarding();

  if (!shouldShow) return null;

  const next = steps.find((s) => !s.completed);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold">Getting started</h2>
              <p className="text-sm text-muted-foreground">
                {progress.completed} of {progress.total} done — a few minutes, and your record is
                worth sharing.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={() => dismiss.mutate()}
              disabled={dismiss.isPending}
              aria-label="Put the getting started list away"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <Progress
            value={(progress.completed / progress.total) * 100}
            className="mt-3 h-1.5"
            aria-label={`${progress.completed} of ${progress.total} steps done`}
          />

          <ul className="mt-4 space-y-2">
            {steps.map((step) => {
              const isNext = step.id === next?.id;
              return (
                <li
                  key={step.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg px-2 py-2',
                    isNext && 'bg-background/70',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                      step.completed
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30',
                    )}
                    aria-hidden
                  >
                    {step.completed && <Check className="h-3 w-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        step.completed && 'text-muted-foreground line-through',
                      )}
                    >
                      {step.label}
                    </p>
                    {/* Only the next one explains itself — four descriptions at
                        once is a wall, and three of them are for later. */}
                    {isNext && (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    )}
                  </div>
                  {isNext && (
                    <Button asChild size="sm" className="h-8 shrink-0 gradient-primary border-0">
                      <Link to={step.href}>
                        <span className="hidden xs:inline">{step.actionLabel}</span>
                        <ArrowRight className="h-3.5 w-3.5 xs:ml-1.5" />
                      </Link>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
}
