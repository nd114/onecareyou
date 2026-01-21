import { useState, useMemo, useEffect } from 'react';
import { format, isWithinInterval, startOfDay, endOfDay, subDays } from 'date-fns';
import { Pencil, Trash2, Filter, ChevronDown, ChevronUp, CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
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

type DateFilterType = 'recorded' | 'logged';
type DateRangePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

const ITEMS_PER_PAGE = 10;

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

  // Date filtering state
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('recorded');
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('all');
  const [customDateStart, setCustomDateStart] = useState<Date | undefined>(undefined);
  const [customDateEnd, setCustomDateEnd] = useState<Date | undefined>(undefined);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Calculate date range based on preset
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (dateRangePreset) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      case 'month':
        return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
      case 'custom':
        if (customDateStart && customDateEnd) {
          return { start: startOfDay(customDateStart), end: endOfDay(customDateEnd) };
        }
        return null;
      default:
        return null;
    }
  }, [dateRangePreset, customDateStart, customDateEnd]);

  // Group vitals by created_at timestamp (within 2 seconds = same save session)
  const groupedEntries = useMemo(() => {
    // First filter by type
    let filtered = typeFilter === 'all' 
      ? vitals 
      : vitals.filter(v => v.type === typeFilter);

    // Then filter by date range if applicable
    if (dateRange) {
      filtered = filtered.filter(v => {
        const dateToCheck = dateFilterType === 'recorded' 
          ? new Date(v.recorded_at) 
          : new Date(v.created_at);
        return isWithinInterval(dateToCheck, { start: dateRange.start, end: dateRange.end });
      });
    }

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
  }, [vitals, typeFilter, dateRange, dateFilterType]);

  // Pagination calculations
  const totalPages = Math.ceil(groupedEntries.length / ITEMS_PER_PAGE);
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return groupedEntries.slice(start, start + ITEMS_PER_PAGE);
  }, [groupedEntries, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter, dateRangePreset, dateFilterType, customDateStart, customDateEnd]);

  const formatValue = (vital: VitalRecord) => {
    if (!vital || !vital.type) return '-';
    if (vital.type === 'blood_pressure' && vital.secondary_value) {
      return `${vital.value}/${vital.secondary_value}`;
    }
    const converted = convertVitalValue(vital.type, vital.value);
    return converted.value;
  };

  const getDisplayUnitForVital = (vital: VitalRecord) => {
    if (!vital || !vital.type) return '';
    return getDisplayUnit(vital.type);
  };

  const getStatus = (vital: VitalRecord): 'normal' | 'high' | 'low' => {
    if (!vital || !vital.type) return 'normal';
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

  const clearDateFilter = () => {
    setDateRangePreset('all');
    setCustomDateStart(undefined);
    setCustomDateEnd(undefined);
  };

  const totalVitals = typeFilter === 'all' ? vitals.length : vitals.filter(v => v.type === typeFilter).length;
  const filteredVitalsCount = groupedEntries.reduce((acc, g) => acc + g.vitals.length, 0);

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
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Type Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
              <Filter className="h-4 w-4" />
              {vitalTypeOptions.find(o => o.value === typeFilter)?.label || 'Filter'}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
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

        {/* Date Filter */}
        <div className="flex gap-2 flex-1">
          <Select value={dateFilterType} onValueChange={(v) => setDateFilterType(v as DateFilterType)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recorded">Recorded Date</SelectItem>
              <SelectItem value="logged">Logged Date</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 flex-1 sm:flex-initial">
                <CalendarIcon className="h-4 w-4" />
                {dateRangePreset === 'all' && 'All Time'}
                {dateRangePreset === 'today' && 'Today'}
                {dateRangePreset === 'week' && 'Last 7 Days'}
                {dateRangePreset === 'month' && 'Last 30 Days'}
                {dateRangePreset === 'custom' && customDateStart && customDateEnd && 
                  `${format(customDateStart, 'MMM d')} - ${format(customDateEnd, 'MMM d')}`}
                {dateRangePreset === 'custom' && (!customDateStart || !customDateEnd) && 'Custom Range'}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Quick Filters</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setDateRangePreset('all')}>
                All Time
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDateRangePreset('today')}>
                Today
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDateRangePreset('week')}>
                Last 7 Days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDateRangePreset('month')}>
                Last 30 Days
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Custom Range</DropdownMenuLabel>
              <div className="px-2 py-2">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Start Date</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-start text-left">
                          <CalendarIcon className="mr-2 h-3 w-3" />
                          {customDateStart ? format(customDateStart, 'MMM d, yyyy') : 'Select'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={customDateStart}
                          onSelect={(date) => {
                            setCustomDateStart(date);
                            setDateRangePreset('custom');
                          }}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">End Date</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-start text-left">
                          <CalendarIcon className="mr-2 h-3 w-3" />
                          {customDateEnd ? format(customDateEnd, 'MMM d, yyyy') : 'Select'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={customDateEnd}
                          onSelect={(date) => {
                            setCustomDateEnd(date);
                            setDateRangePreset('custom');
                          }}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {dateRangePreset !== 'all' && (
            <Button variant="ghost" size="sm" onClick={clearDateFilter} className="px-2">
              ×
            </Button>
          )}
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          {groupedEntries.length} session{groupedEntries.length !== 1 ? 's' : ''} ({filteredVitalsCount} readings)
          {dateRangePreset !== 'all' && ` • Filtered from ${totalVitals} total`}
        </p>
        {totalPages > 1 && (
          <p>Page {currentPage} of {totalPages}</p>
        )}
      </div>

      {/* Grouped Entries List */}
      <div className="space-y-3">
        {paginatedEntries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No records match the current filters</p>
            <Button variant="link" onClick={clearDateFilter} className="mt-2">
              Clear filters
            </Button>
          </div>
        ) : (
          paginatedEntries.map((group) => {
            const isExpanded = expandedGroups.has(group.key);
            const isSingleEntry = group.vitals.length === 1;

            // For single entries, render directly without collapsible
            if (isSingleEntry) {
              const vital = group.vitals[0];
              if (!vital || !vital.type || !VITAL_CONFIG[vital.type]) return null;
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
                            {group.vitals.filter(v => v && v.type && VITAL_CONFIG[v.type]).map((v) => {
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

                          <div className="flex flex-wrap gap-2 sm:gap-3 mt-2">
                            {group.vitals.filter(v => v && v.type && VITAL_CONFIG[v.type]).map((v) => (
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
                      {group.vitals.filter(v => v && v.type && VITAL_CONFIG[v.type]).map((vital) => {
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
          })
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? 'default' : 'outline'}
                  size="sm"
                  className="w-8 h-8 p-0"
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="gap-1"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

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