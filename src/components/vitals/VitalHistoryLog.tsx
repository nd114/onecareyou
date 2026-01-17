import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Pencil, Trash2, Filter, ChevronDown, ChevronUp } from 'lucide-react';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { VitalRecord } from '@/hooks/useVitals';
import { useUnitPreferences } from '@/hooks/useUnitPreferences';

interface VitalHistoryLogProps {
  vitals: VitalRecord[];
  onEdit: (vital: VitalRecord) => void;
  onDelete: (id: string) => void;
}

interface GroupedEntry {
  key: string;
  recordedAt: string;
  createdAt: string;
  vitals: VitalRecord[];
  notes: string | null;
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { convertVitalValue, getDisplayUnit, getNormalRange } = useUnitPreferences();

  // Group vitals by created_at timestamp (within 2 seconds = same save session)
  const groupedEntries = useMemo(() => {
    const filtered = typeFilter === 'all' 
      ? vitals 
      : vitals.filter(v => v.type === typeFilter);

    const groups: Map<string, GroupedEntry> = new Map();
    
    for (const vital of filtered) {
      const createdTime = new Date(vital.created_at).getTime();
      
      // Find existing group within 2 seconds
      let foundGroup: string | null = null;
      for (const [key, group] of groups) {
        const groupTime = new Date(group.createdAt).getTime();
        if (Math.abs(createdTime - groupTime) < 2000) {
          foundGroup = key;
          break;
        }
      }

      if (foundGroup) {
        groups.get(foundGroup)!.vitals.push(vital);
      } else {
        const key = vital.created_at;
        groups.set(key, {
          key,
          recordedAt: vital.recorded_at,
          createdAt: vital.created_at,
          vitals: [vital],
          notes: vital.notes,
        });
      }
    }

    // Sort by created_at descending
    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [vitals, typeFilter]);

  const formatValue = (vital: VitalRecord) => {
    if (vital.type === 'blood_pressure' && vital.secondary_value) {
      return `${vital.value}/${vital.secondary_value}`;
    }
    const converted = convertVitalValue(vital.type, vital.value);
    return converted.value;
  };

  const getDisplayUnitForVital = (vital: VitalRecord) => {
    return getDisplayUnit(vital.type);
  };

  const getStatus = (vital: VitalRecord): 'normal' | 'high' | 'low' => {
    const normalRange = getNormalRange(vital.type);
    const converted = convertVitalValue(vital.type, vital.value);
    if (converted.value < normalRange.min) return 'low';
    if (converted.value > normalRange.max) return 'high';
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

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const totalVitals = typeFilter === 'all' ? vitals.length : vitals.filter(v => v.type === typeFilter).length;

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
          {groupedEntries.length} session{groupedEntries.length !== 1 ? 's' : ''} ({totalVitals} readings)
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

      {/* Grouped Entries List */}
      <div className="space-y-3">
        {groupedEntries.map((group) => {
          const isExpanded = expandedGroups.has(group.key);
          const isSingleEntry = group.vitals.length === 1;

          // For single entries, render directly without collapsible
          if (isSingleEntry) {
            const vital = group.vitals[0];
            const config = VITAL_CONFIG[vital.type];
            const status = getStatus(vital);

            return (
              <Card key={group.key} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{config.label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[status]}`}>
                          {status}
                        </span>
                      </div>
                      
                      <p className="text-xl sm:text-2xl font-bold mt-1">
                        {formatValue(vital)}
                        <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">
                          {getDisplayUnitForVital(vital)}
                        </span>
                      </p>

                      {vital.notes && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {vital.notes}
                        </p>
                      )}

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
          }

          // For multiple entries, render as collapsible group
          return (
            <Card key={group.key} className="border-border/50">
              <Collapsible open={isExpanded} onOpenChange={() => toggleGroup(group.key)}>
                <CollapsibleTrigger asChild>
                  <CardContent className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Badge variant="secondary" className="text-xs">
                            {group.vitals.length} metrics
                          </Badge>
                          {group.vitals.map((v) => {
                            const status = getStatus(v);
                            return (
                              <span 
                                key={v.id} 
                                className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[status]}`}
                              >
                                {VITAL_CONFIG[v.type].label}
                              </span>
                            );
                          })}
                        </div>

                        {/* Summary of values */}
                        <div className="flex flex-wrap gap-2 sm:gap-3 mt-2">
                          {group.vitals.map((v) => (
                            <div key={v.id} className="text-xs sm:text-sm">
                              <span className="text-muted-foreground">{VITAL_CONFIG[v.type].label}:</span>{' '}
                              <span className="font-semibold">{formatValue(v)} {getDisplayUnitForVital(v)}</span>
                            </div>
                          ))}
                        </div>

                        {group.notes && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                            {group.notes}
                          </p>
                        )}

                        <div className="flex flex-col sm:flex-row sm:gap-4 mt-3 text-xs text-muted-foreground">
                          <div>
                            <span className="font-medium">Recorded:</span>{' '}
                            {format(new Date(group.recordedAt), "MMM d, yyyy 'at' h:mm a")}
                          </div>
                          <div>
                            <span className="font-medium">Logged:</span>{' '}
                            {format(new Date(group.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center">
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="border-t px-4 pb-4 pt-3 space-y-2 bg-muted/30">
                    {group.vitals.map((vital) => {
                      const config = VITAL_CONFIG[vital.type];
                      const status = getStatus(vital);

                      return (
                        <div 
                          key={vital.id} 
                          className="flex items-center justify-between py-2 px-2 sm:px-3 bg-background rounded-lg border gap-2"
                        >
                          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
                            <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium border ${statusColors[status]} flex-shrink-0`}>
                              {status}
                            </span>
                            <span className="font-medium text-xs sm:text-sm">{config.label}</span>
                            <span className="text-sm sm:text-lg font-bold">
                              {formatValue(vital)}
                              <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">
                                {getDisplayUnitForVital(vital)}
                              </span>
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(vital);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(vital.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
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
