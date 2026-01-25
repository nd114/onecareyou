import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useClinicianOnboarding, OnboardingStep } from '@/hooks/useClinicianOnboarding';
import { cn } from '@/lib/utils';

const StepItem = ({ 
  step, 
  isNext,
  onNavigate,
}: { 
  step: OnboardingStep;
  isNext: boolean;
  onNavigate: (href: string) => void;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "flex items-center gap-3 py-2 group",
        isNext && "bg-primary/5 -mx-3 px-3 rounded-lg"
      )}
    >
      {/* Status Icon */}
      <div
        className={cn(
          "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
          step.completed
            ? "bg-status-success text-white"
            : isNext
            ? "bg-primary text-white"
            : "bg-muted text-muted-foreground"
        )}
      >
        {step.completed ? (
          <Check className="h-3.5 w-3.5" />
        ) : isNext ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <span className="text-xs font-medium">○</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium truncate",
            step.completed && "text-muted-foreground line-through"
          )}
        >
          {step.label}
        </p>
        {isNext && step.description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {step.description}
          </p>
        )}
      </div>

      {/* Action Button */}
      {isNext && step.href && (
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => onNavigate(step.href!)}
        >
          {step.actionLabel || 'Continue'}
        </Button>
      )}
    </motion.div>
  );
};

export const ClinicianOnboardingCard = () => {
  const navigate = useNavigate();
  const {
    steps,
    completedCount,
    totalSteps,
    isComplete,
    shouldShowOnboarding,
    nextStep,
    dismissOnboarding,
    completeOnboarding,
  } = useClinicianOnboarding();

  // Auto-complete when all steps done
  if (isComplete && shouldShowOnboarding) {
    completeOnboarding.mutate();
  }

  if (!shouldShowOnboarding) {
    return null;
  }

  const handleNavigate = (href: string) => {
    navigate(href);
  };

  const handleDismiss = () => {
    dismissOnboarding.mutate();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -10, height: 0 }}
        transition={{ duration: 0.2 }}
        className="mb-6"
      >
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold">
                Complete Your Setup
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {completedCount} of {totalSteps} steps completed
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -mt-1 -mr-2 text-muted-foreground hover:text-foreground"
              onClick={handleDismiss}
              title="Dismiss for now"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {steps.map((step) => (
                <StepItem
                  key={step.id}
                  step={step}
                  isNext={nextStep?.id === step.id}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>

            {/* Skip link */}
            <div className="mt-4 pt-3 border-t flex justify-end">
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleDismiss}
              >
                Skip for now
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};
