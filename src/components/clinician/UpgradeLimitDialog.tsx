import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useNavigate } from 'react-router-dom';

interface UpgradeLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCount: number;
  limit: number;
  tierName: string;
}

export function UpgradeLimitDialog({ 
  open, 
  onOpenChange, 
  currentCount, 
  limit, 
  tierName 
}: UpgradeLimitDialogProps) {
  const navigate = useNavigate();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <AlertDialogTitle>Patient Limit Reached</AlertDialogTitle>
              <AlertDialogDescription>
                Your {tierName} plan supports up to {limit} patients. You currently have {currentCount}.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">
          Upgrade your plan to add more patients and unlock additional features.
        </p>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gradient-primary border-0"
            onClick={() => {
              onOpenChange(false);
              navigate('/clinician/pricing');
            }}
          >
            <ArrowUpRight className="h-4 w-4 mr-1" />
            Upgrade Plan
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
