import {
  Send,
  Bell,
  CheckSquare,
  Square,
  X,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// There is deliberately no "Remove from care" action here. A provider share
// is the patient's consent: guard_provider_share_consent keeps is_active for
// the patient (or a platform admin) to change, so a clinician's bulk "end
// share" was silently ignored while the UI reported success.

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
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            Select patients for bulk actions
          </span>
        )}
      </div>
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
