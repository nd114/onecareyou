import { useState } from 'react';
import { format } from 'date-fns';
import { Pencil, Trash2, Filter, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { VitalRecord } from '@/hooks/useVitals';

interface VitalHistoryLogProps {
  vitals: VitalRecord[];
  onEdit: (vital: VitalRecord) => void;
  onDelete: (id: string) => void;
}

const vitalTypeOptions: { value: VitalType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'blood_pressure', label: 'Blood Pressure' },
  { value: 'heart_rate', label: 'Heart Rate' },
  { value: 'weight', label: 'Weight' },
  { value: 'temperature', label: 'Temperature' },
  { value: 'glucose', label: 'Glucose' },
  { value: 'hba1c', label: 'HbA1c' },
  { value: 'cholesterol_total', label: 'Cholesterol' },
  { value: 'ldl', label: 'LDL' },
  { value: 'hdl', label: 'HDL' },
  { value: 'hemoglobin', label: 'Hemoglobin' },
  { value: 'creatinine', label: 'Creatinine' },
  { value: 'gfr', label: 'GFR' },
];

export function VitalHistoryLog({ vitals, onEdit, onDelete }: VitalHistoryLogProps) {
  const [typeFilter, setTypeFilter] = useState<VitalType | 'all'>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const filteredVitals = typeFilter === 'all' 
    ? vitals 
    : vitals.filter(v => v.type === typeFilter);

  const formatValue = (vital: VitalRecord) => {
    if (vital.type === 'blood_pressure' && vital.secondary_value) {
      return `${vital.value}/${vital.secondary_value}`;
    }
    return vital.value;
  };

  const getStatus = (vital: VitalRecord): 'normal' | 'high' | 'low' => {
    const config = VITAL_CONFIG[vital.type];
    if (vital.value < config.normalMin) return 'low';
    if (vital.value > config.normalMax) return 'high';
    return 'normal';
  };

  const statusColors = {
    normal: 'bg-status-success/10 text-status-success border-status-success/20',
    high: 'bg-severity-high/10 text-severity-high border-severity-high/20',
    low: 'bg-ocean/10 text-ocean border-ocean/20',
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      onDelete(deleteConfirm);
      setDeleteConfirm(null);
    }
  };

  const wasEdited = (vital: VitalRecord) => {
    const created = new Date(vital.created_at).getTime();
    const recorded = new Date(vital.recorded_at).getTime();
    // If difference is more than 5 minutes, it was likely edited
    return Math.abs(created - recorded) > 5 * 60 * 1000;
  };

  if (vitals.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium mb-2">No vital records yet</p>
        <p className="text-sm">Start tracking your health by adding your first vital reading.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredVitals.length} of {vitals.length} entries
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              {vitalTypeOptions.find(o => o.value === typeFilter)?.label || 'Filter'}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
            {vitalTypeOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setTypeFilter(option.value)}
                className={typeFilter === option.value ? 'bg-accent' : ''}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Entries List */}
      <div className="space-y-3">
        {filteredVitals.map((vital) => {
          const config = VITAL_CONFIG[vital.type];
          const status = getStatus(vital);
          const edited = wasEdited(vital);

          return (
            <Card key={vital.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{config.label}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[status]}`}>
                        {status}
                      </span>
                      {edited && (
                        <Badge variant="outline" className="text-xs">
                          edited
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-2xl font-bold mt-1">
                      {formatValue(vital)}
                      <span className="text-sm font-normal text-muted-foreground ml-1">
                        {config.unit}
                      </span>
                    </p>

                    {vital.notes && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {vital.notes}
                      </p>
                    )}

                    {/* Timestamps */}
                    <div className="flex flex-col sm:flex-row sm:gap-4 mt-3 text-xs text-muted-foreground">
                      <div>
                        <span className="font-medium">Recorded:</span>{' '}
                        {format(new Date(vital.recorded_at), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                      <div>
                        <span className="font-medium">Logged:</span>{' '}
                        {format(new Date(vital.created_at), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEdit(vital)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm(vital.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this vital record?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The vital reading will be permanently removed from your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
