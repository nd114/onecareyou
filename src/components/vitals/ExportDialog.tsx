import { useState } from 'react';
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfYear } from 'date-fns';
import { CalendarIcon, Download, Mail, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { VitalRecord } from '@/hooks/useVitals';
import { exportVitalsToCSV, exportVitalsToPDF } from '@/lib/vitals-export';
import { supabase } from '@/integrations/supabase/client';
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
  const [mode, setMode] = useState<'download' | 'email'>('download');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [sending, setSending] = useState(false);

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

  const handleSendEmail = async () => {
    if (!recipientEmail) {
      toast.error('Please enter recipient email');
      return;
    }
    if (filteredVitals.length === 0) {
      toast.error('No vitals in selected date range');
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in to send reports');
        return;
      }

      const { error } = await supabase.functions.invoke('send-vitals-report', {
        body: {
          recipientEmail,
          recipientName: recipientName || undefined,
          vitals: filteredVitals,
          dateRange: {
            from: dateRange.from?.toISOString(),
            to: dateRange.to?.toISOString(),
          },
        },
      });

      if (error) throw error;

      toast.success(`Report sent to ${recipientEmail}`);
      setRecipientEmail('');
      setRecipientName('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error sending report:', error);
      toast.error('Failed to send report');
    } finally {
      setSending(false);
    }
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
          <DialogTitle>Export Vitals</DialogTitle>
          <DialogDescription>
            Download or share your health data
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'download' | 'email')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="download" className="gap-2">
              <Download className="h-4 w-4" />
              Download
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 space-y-4">
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

            <TabsContent value="download" className="mt-0 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={handleExportCSV} disabled={filteredVitals.length === 0}>
                  Download CSV
                </Button>
                <Button variant="outline" onClick={handleExportPDF} disabled={filteredVitals.length === 0}>
                  Download PDF
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="email" className="mt-0 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="recipientName">Provider Name (optional)</Label>
                <Input
                  id="recipientName"
                  placeholder="Dr. Smith"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipientEmail">Provider Email *</Label>
                <Input
                  id="recipientEmail"
                  type="email"
                  placeholder="doctor@clinic.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                />
              </div>
              <Button 
                className="w-full gradient-primary border-0" 
                onClick={handleSendEmail}
                disabled={!recipientEmail || filteredVitals.length === 0 || sending}
              >
                {sending ? 'Sending...' : 'Send Report'}
              </Button>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
