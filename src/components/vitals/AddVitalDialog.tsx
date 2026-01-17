import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AddVitalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (type: VitalType, value: number, secondaryValue?: number, notes?: string, date?: Date) => Promise<any>;
}

const vitalCategories = [
  { id: 'daily', label: 'Daily', types: ['weight', 'blood_pressure', 'heart_rate', 'temperature'] as VitalType[] },
  { id: 'sugar', label: 'Sugar', types: ['glucose', 'hba1c'] as VitalType[] },
  { id: 'kidneys', label: 'Kidneys', types: ['urea', 'creatinine', 'gfr'] as VitalType[] },
  { id: 'heart', label: 'Heart', types: ['cholesterol_total', 'ldl', 'hdl'] as VitalType[] },
  { id: 'liver', label: 'Liver', types: ['alt', 'ast'] as VitalType[] },
  { id: 'blood', label: 'Blood', types: ['hemoglobin', 'wbc'] as VitalType[] },
  { id: 'minerals', label: 'Minerals', types: ['potassium', 'sodium'] as VitalType[] },
];

export function AddVitalDialog({ open, onOpenChange, onSave }: AddVitalDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState('daily');
  const [values, setValues] = useState<Record<string, string>>({});
  const [secondaryValues, setSecondaryValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setValues({});
    setSecondaryValues({});
    setNotes('');
    setSelectedDate(new Date());
    setSelectedCategory('daily');
  };

  const handleSave = async () => {
    setSaving(true);
    
    try {
      // Save all entered values
      const entries = Object.entries(values).filter(([_, v]) => v && !isNaN(parseFloat(v)));
      
      for (const [type, value] of entries) {
        const numValue = parseFloat(value);
        const secondaryValue = secondaryValues[type] ? parseFloat(secondaryValues[type]) : undefined;
        await onSave(type as VitalType, numValue, secondaryValue, notes || undefined, selectedDate);
      }

      resetForm();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const hasValues = Object.values(values).some(v => v && !isNaN(parseFloat(v)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Health Metrics</DialogTitle>
          <DialogDescription>
            Enter your measurements manually or upload a document
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Date Selection */}
          <div className="flex items-center gap-4">
            <Label className="w-20">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "flex-1 justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Category Tabs */}
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="flex flex-wrap h-auto gap-1">
              {vitalCategories.map((cat) => (
                <TabsTrigger key={cat.id} value={cat.id} className="text-xs">
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {vitalCategories.map((category) => (
              <TabsContent key={category.id} value={category.id} className="space-y-4 pt-4">
                {category.types.map((type) => {
                  const config = VITAL_CONFIG[type];
                  const hasBPSecondary = type === 'blood_pressure';
                  
                  return (
                    <div key={type} className="space-y-2">
                      <Label htmlFor={type}>
                        {config.label} 
                        <span className="text-muted-foreground ml-1">({config.unit})</span>
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id={type}
                          type="number"
                          step="0.1"
                          placeholder={hasBPSecondary ? "Systolic (e.g., 120)" : `e.g., ${config.normalMin}-${config.normalMax}`}
                          value={values[type] || ''}
                          onChange={(e) => setValues({ ...values, [type]: e.target.value })}
                          className="flex-1"
                        />
                        {hasBPSecondary && (
                          <Input
                            type="number"
                            placeholder="Diastolic (e.g., 80)"
                            value={secondaryValues[type] || ''}
                            onChange={(e) => setSecondaryValues({ ...secondaryValues, [type]: e.target.value })}
                            className="flex-1"
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Normal range: {config.normalMin}–{config.normalMax} {config.unit}
                      </p>
                    </div>
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any relevant context or observations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Upload Option - Placeholder for future OCR */}
          <div className="border-t pt-4">
            <Button variant="outline" className="w-full" disabled>
              <Upload className="h-4 w-4 mr-2" />
              Upload Lab Report (Coming Soon)
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              OCR document upload will be available soon
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button 
              variant="outline" 
              className="flex-1" 
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1 gradient-primary border-0" 
              onClick={handleSave}
              disabled={!hasValues || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
