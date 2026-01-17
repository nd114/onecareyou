import { useState } from 'react';
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfYear } from 'date-fns';
import { CalendarIcon, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { VitalRecord } from '@/hooks/useVitals';
import { exportVitalsToCSV, exportVitalsToPDF } from '@/lib/vitals-export';
import { toast } from 'sonner';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vitals: VitalRecord[];
}

const quickRanges = [
  { label: 'Last 7 days', getValue: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
  { label: 'Last 30 days', getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: 'Last 90 days', getValue: () => ({ from: subDays(new Date(), 90), to: new Date() }) },
  { label: 'This month', getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: 'Last month', getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: 'This year', getValue: () => ({ from: startOfYear(new Date()), to: new Date() }) },
  { label: 'All time', getValue: () => ({ from: undefined, to: undefined }) },
];

export function ExportDialog({ open, onOpenChange, vitals }: ExportDialogProps) {
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const filteredVitals = vitals.filter(v => {
    if (!dateRange.from && !dateRange.to) return true;
    const recordedDate = new Date(v.recorded_at);
    if (dateRange.from && recordedDate < dateRange.from) return false;
    if (dateRange.to && recordedDate > dateRange.to) return false;
    return true;
  });

  const handleExportCSV = () => {
    if (filteredVitals.length === 0) {
      toast.error('No vitals in selected date range');
      return;
    }
    exportVitalsToCSV(filteredVitals);
    toast.success('CSV downloaded');
    onOpenChange(false);
  };

  const handleExportPDF = () => {
    if (filteredVitals.length === 0) {
      toast.error('No vitals in selected date range');
      return;
    }
    exportVitalsToPDF(filteredVitals);
    onOpenChange(false);
  };

  const formatDateRange = () => {
    if (!dateRange.from && !dateRange.to) return 'All time';
    if (dateRange.from && dateRange.to) {
      return `${format(dateRange.from, 'MMM d, yyyy')} - ${format(dateRange.to, 'MMM d, yyyy')}`;
    }
    if (dateRange.from) return `From ${format(dateRange.from, 'MMM d, yyyy')}`;
    if (dateRange.to) return `Until ${format(dateRange.to, 'MMM d, yyyy')}`;
    return '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Vitals
          </DialogTitle>
          <DialogDescription>
            Download your health data as CSV or PDF
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date Range Selection */}
          <div className="space-y-2">
            <Label>Date Range</Label>
            <div className="flex flex-wrap gap-2">
              {quickRanges.map((range) => (
                <Button
                  key={range.label}
                  variant="outline"
                  size="sm"
                  className={cn(
                    "text-xs",
                    JSON.stringify(dateRange) === JSON.stringify(range.getValue()) && "border-primary bg-primary/10"
                  )}
                  onClick={() => setDateRange(range.getValue())}
                >
                  {range.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateRange.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? format(dateRange.from, "MMM d") : "Start"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => setDateRange(prev => ({ ...prev, from: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateRange.to && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.to ? format(dateRange.to, "MMM d") : "End"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => setDateRange(prev => ({ ...prev, to: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Period:</span>
              <span className="font-medium">{formatDateRange()}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Readings:</span>
              <span className="font-medium">{filteredVitals.length}</span>
            </div>
          </div>

          {/* Download Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={handleExportCSV} disabled={filteredVitals.length === 0}>
              Download CSV
            </Button>
            <Button variant="outline" onClick={handleExportPDF} disabled={filteredVitals.length === 0}>
              Download PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
