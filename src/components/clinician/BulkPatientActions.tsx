import { useState } from 'react';
import { 
  Users, 
  Send, 
  Bell, 
  Trash2, 
  CheckSquare, 
  Square,
  X,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

interface Patient {
  id: string;
  user_id: string;
  patient_name: string;
  patient_email: string;
}

interface BulkPatientActionsProps {
  patients: Patient[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onCreateGuidance?: (patientIds: string[]) => void;
  onCreateAlert?: (patientIds: string[]) => void;
}

export const BulkPatientActions = ({
  patients,
  selectedIds,
  onSelectionChange,
  onCreateGuidance,
  onCreateAlert,
}: BulkPatientActionsProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const selectedCount = selectedIds.size;
  const allSelected = selectedCount === patients.length && patients.length > 0;
  const someSelected = selectedCount > 0 && selectedCount < patients.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(patients.map(p => p.id)));
    }
  };

  const clearSelection = () => {
    onSelectionChange(new Set());
  };

  const handleBulkRemove = async () => {
    if (!user || selectedCount === 0) return;
    
    setIsRemoving(true);
    try {
      const { error } = await supabase
        .from('provider_shares')
        .update({ is_active: false })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast({
        title: 'Patients removed',
        description: `${selectedCount} patient${selectedCount > 1 ? 's' : ''} removed from your care.`,
      });

      queryClient.invalidateQueries({ queryKey: ['clinician-patients'] });
      clearSelection();
    } catch (error) {
      console.error('Error removing patients:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove patients. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRemoving(false);
      setShowRemoveDialog(false);
    }
  };

  const getSelectedPatientUserIds = () => {
    return patients
      .filter(p => selectedIds.has(p.id))
      .map(p => p.user_id);
  };

  if (patients.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2 mb-4 p-3 bg-muted/50 rounded-lg">
        {/* Select All Checkbox */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={toggleSelectAll}
        >
          {allSelected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : someSelected ? (
            <div className="h-4 w-4 border-2 border-primary rounded flex items-center justify-center">
              <div className="h-2 w-2 bg-primary rounded-sm" />
            </div>
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>

        {selectedCount > 0 ? (
          <>
            <span className="text-sm font-medium">
              {selectedCount} selected
            </span>
            
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={clearSelection}
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="flex-1" />

            {/* Bulk Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  Actions
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onCreateGuidance?.(getSelectedPatientUserIds())}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Guidance to All
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onCreateAlert?.(getSelectedPatientUserIds())}
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Create Alert Rule
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowRemoveDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove from Care
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            Select patients for bulk actions
          </span>
        )}
      </div>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedCount} patient{selectedCount > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the selected patients from your care. They can re-share 
              their data with you at any time. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkRemove}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// Selection checkbox for individual patients
export const PatientSelectCheckbox = ({
  patientId,
  isSelected,
  onToggle,
}: {
  patientId: string;
  isSelected: boolean;
  onToggle: (id: string) => void;
}) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(patientId);
      }}
    >
      {isSelected ? (
        <CheckSquare className="h-4 w-4 text-primary" />
      ) : (
        <Square className="h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  );
};
