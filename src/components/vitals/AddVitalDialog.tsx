import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Upload, FileText, Check, X, Loader2, Shield, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAIConsent } from '@/hooks/useAIConsent';
import { AIConsentDialog } from '@/components/consent/AIConsentDialog';
import { performLocalOCR, isOCRSupported, requiresServerProcessing, type OCRProgress } from '@/lib/ocr';
import { Progress } from '@/components/ui/progress';
import { useUnitPreferences } from '@/hooks/useUnitPreferences';

interface AddVitalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (type: VitalType, value: number, secondaryValue?: number, notes?: string, date?: Date) => Promise<any>;
}

interface ExtractedVital {
  type: VitalType;
  value: number;
  secondary_value: number | null;
  unit: string;
  selected: boolean;
}

const vitalCategories = [
  { id: 'daily', label: 'Daily', types: ['weight', 'blood_pressure', 'heart_rate', 'oxygen_saturation', 'temperature'] as VitalType[] },
  { id: 'sugar', label: 'Sugar', types: ['glucose', 'hba1c'] as VitalType[] },
  { id: 'kidneys', label: 'Kidneys', types: ['urea', 'creatinine', 'gfr'] as VitalType[] },
  { id: 'heart', label: 'Heart', types: ['cholesterol_total', 'ldl', 'hdl'] as VitalType[] },
  { id: 'liver', label: 'Liver', types: ['alt', 'ast'] as VitalType[] },
  { id: 'blood', label: 'Blood', types: ['hemoglobin', 'wbc'] as VitalType[] },
  { id: 'minerals', label: 'Minerals', types: ['potassium', 'sodium'] as VitalType[] },
];

export function AddVitalDialog({ open, onOpenChange, onSave }: AddVitalDialogProps) {
  const { hasConsent, grantConsent, checkConsentRequired } = useAIConsent();
  const { getDisplayUnit, getNormalRange, convertToBaseUnit } = useUnitPreferences();
  
  const [mode, setMode] = useState<'manual' | 'upload'>('manual');
  const [step, setStep] = useState<'entry' | 'confirm'>('entry');
  const [selectedCategory, setSelectedCategory] = useState('daily');
  const [values, setValues] = useState<Record<string, string>>({});
  const [secondaryValues, setSecondaryValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>(format(new Date(), 'HH:mm'));
  const [saving, setSaving] = useState(false);
  
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [extractedVitals, setExtractedVitals] = useState<ExtractedVital[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Local OCR progress state
  const [ocrProgress, setOcrProgress] = useState<OCRProgress | null>(null);
  const [usedLocalOCR, setUsedLocalOCR] = useState(false);
  
  // Consent dialog state
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const resetForm = () => {
    setValues({});
    setSecondaryValues({});
    setNotes('');
    setSelectedDate(new Date());
    setSelectedTime(format(new Date(), 'HH:mm'));
    setSelectedCategory('daily');
    setExtractedVitals([]);
    setUploadError(null);
    setMode('manual');
    setStep('entry');
    setPendingFile(null);
    setOcrProgress(null);
    setUsedLocalOCR(false);
  };

  // Combine date and time into a single Date object
  const getRecordedDateTime = () => {
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const dateTime = new Date(selectedDate);
    dateTime.setHours(hours, minutes, 0, 0);
    return dateTime;
  };

  // Get entries to save for confirmation display
  const getEntriesToSave = () => {
    return Object.entries(values)
      .filter(([_, v]) => v && !isNaN(parseFloat(v)))
      .map(([type, value]) => {
        const vitalType = type as VitalType;
        const displayUnit = getDisplayUnit(vitalType);
        return {
          type: vitalType,
          value: parseFloat(value),
          displayUnit,
          secondaryValue: secondaryValues[type] ? parseFloat(secondaryValues[type]) : undefined,
          config: VITAL_CONFIG[vitalType],
        };
      });
  };

  const handleProceedToConfirm = () => {
    if (getEntriesToSave().length > 0) {
      setStep('confirm');
    }
  };

  const handleSaveManual = async () => {
    setSaving(true);
    
    try {
      const entries = getEntriesToSave();
      const recordedDateTime = getRecordedDateTime();
      
      for (const entry of entries) {
        // Convert from user's preferred unit to base unit before saving
        const baseValue = convertToBaseUnit(entry.type, entry.value);
        const baseSecondaryValue = entry.secondaryValue !== undefined 
          ? convertToBaseUnit(entry.type, entry.secondaryValue) 
          : undefined;
        
        await onSave(entry.type, baseValue, baseSecondaryValue, notes || undefined, recordedDateTime);
      }

      resetForm();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const processFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setExtractedVitals([]);
    setOcrProgress(null);
    setUsedLocalOCR(false);

    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please sign in to upload lab reports');
      }

      let requestBody: { preExtractedText?: string; imageBase64?: string; reportDate: string };

      // Check if we can use local OCR (for images, not PDFs)
      if (isOCRSupported(file) && !requiresServerProcessing(file)) {
        // Perform OCR locally - image never leaves device
        console.log('Using local OCR for privacy-preserving processing');
        
        setOcrProgress({ status: 'Initializing OCR...', progress: 0 });
        
        const ocrResult = await performLocalOCR(file, (progress) => {
          setOcrProgress(progress);
        });

        setOcrProgress({ status: 'Processing text...', progress: 100 });
        
        if (!ocrResult.text.trim()) {
          throw new Error('Could not read text from image. Try a clearer photo.');
        }

        console.log('Local OCR complete, confidence:', ocrResult.confidence);
        setUsedLocalOCR(true);

        // Send only the extracted text - no image data
        requestBody = {
          preExtractedText: ocrResult.text,
          reportDate: selectedDate.toISOString()
        };
      } else {
        // For PDFs, fall back to server-side processing
        console.log('Using server-side OCR for PDF processing');
        
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        requestBody = {
          imageBase64: base64,
          reportDate: selectedDate.toISOString()
        };
      }

      // Call edge function to parse
      const { data, error } = await supabase.functions.invoke('parse-lab-report', {
        body: requestBody
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to process lab report');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to extract vitals from report');
      }

      if (data.extractedVitals && data.extractedVitals.length > 0) {
        setExtractedVitals(data.extractedVitals.map((v: any) => ({ ...v, selected: true })));
        const privacyMessage = data.usedLocalOCR 
          ? 'Image processed on your device - maximum privacy!' 
          : 'Document processed securely';
        toast.success(`Found ${data.extractedVitals.length} health metrics! ${privacyMessage}`);
      } else {
        setUploadError('No health metrics found in the image. Try a clearer photo of your lab report.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to process file');
    } finally {
      setUploading(false);
      setOcrProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Please upload a JPG, PNG, WebP, or PDF file');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be less than 10MB');
      return;
    }

    // Check if consent is required
    if (checkConsentRequired()) {
      setPendingFile(file);
      setShowConsentDialog(true);
      return;
    }

    // Process the file
    await processFile(file);
  };

  const handleConsentGranted = async () => {
    const success = await grantConsent();
    if (success && pendingFile) {
      await processFile(pendingFile);
      setPendingFile(null);
    }
  };

  const handleConsentDeclined = () => {
    setPendingFile(null);
    toast.info('You can still enter vitals manually');
  };

  const toggleVitalSelection = (index: number) => {
    setExtractedVitals(prev => prev.map((v, i) => 
      i === index ? { ...v, selected: !v.selected } : v
    ));
  };

  const handleSaveExtracted = async () => {
    setSaving(true);
    
    try {
      const selectedVitals = extractedVitals.filter(v => v.selected);
      
      for (const vital of selectedVitals) {
        await onSave(
          vital.type, 
          vital.value, 
          vital.secondary_value || undefined, 
          'Extracted from lab report', 
          selectedDate
        );
      }

      toast.success(`Saved ${selectedVitals.length} health metrics!`);
      resetForm();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const hasManualValues = Object.values(values).some(v => v && !isNaN(parseFloat(v)));
  const hasSelectedExtracted = extractedVitals.some(v => v.selected);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Health Metrics</DialogTitle>
            <DialogDescription>
              Enter measurements manually or upload a lab report
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {/* Mode Toggle */}
            <div className="flex rounded-lg border bg-muted/50 p-1">
              <Button
                variant={mode === 'manual' ? 'default' : 'ghost'}
                size="sm"
                className="flex-1"
                onClick={() => setMode('manual')}
              >
                Manual Entry
              </Button>
              <Button
                variant={mode === 'upload' ? 'default' : 'ghost'}
                size="sm"
                className="flex-1"
                onClick={() => setMode('upload')}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Report
              </Button>
            </div>

            {/* Date & Time Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "MMM d, yyyy") : "Select date"}
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
              <div className="space-y-2">
                <Label htmlFor="recordTime">Time</Label>
                <Input
                  id="recordTime"
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {mode === 'manual' ? (
              step === 'entry' ? (
                <>
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
                          const displayUnit = getDisplayUnit(type);
                          const normalRange = getNormalRange(type);
                          
                          return (
                            <div key={type} className="space-y-2">
                              <Label htmlFor={type}>
                                {config.label} 
                                <span className="text-muted-foreground ml-1">({displayUnit})</span>
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  id={type}
                                  type="number"
                                  step="0.1"
                                  placeholder={hasBPSecondary ? "Systolic (e.g., 120)" : `e.g., ${normalRange.min}-${normalRange.max}`}
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
                                Normal range: {normalRange.min}–{normalRange.max} {normalRange.unit}
                              </p>
                            </div>
                          );
                        })}
                      </TabsContent>
                    ))}
                  </Tabs>

                  {/* Notes for Clinician */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes for Clinician (optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Add context for your care team, e.g., 'Measured after exercise', 'Feeling dizzy', 'Urine output: 500ml'..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      These notes will be visible to clinicians you've shared your data with
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
                      onClick={handleProceedToConfirm}
                      disabled={!hasManualValues}
                    >
                      Review & Save
                    </Button>
                  </div>
                </>
              ) : (
                /* Confirmation Step */
                <>
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="p-4">
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        Confirm Your Entries
                      </h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        You're about to save {getEntriesToSave().length} health metric{getEntriesToSave().length !== 1 ? 's' : ''} for{' '}
                        <strong>{format(getRecordedDateTime(), "MMM d, yyyy 'at' h:mm a")}</strong>
                      </p>
                      
                      <div className="space-y-2">
                        {getEntriesToSave().map((entry) => (
                          <div key={entry.type} className="flex items-center justify-between py-2 px-3 bg-background rounded-lg border">
                            <span className="font-medium">{entry.config.label}</span>
                            <span className="text-lg font-bold">
                              {entry.type === 'blood_pressure' && entry.secondaryValue
                                ? `${entry.value}/${entry.secondaryValue}`
                                : entry.value}
                              <span className="text-sm font-normal text-muted-foreground ml-1">
                                {entry.displayUnit}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                      
                      {notes && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-xs text-muted-foreground">Notes:</p>
                          <p className="text-sm">{notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="flex gap-3 pt-2">
                    <Button 
                      variant="outline" 
                      className="flex-1" 
                      onClick={() => setStep('entry')}
                    >
                      Add More
                    </Button>
                    <Button 
                      className="flex-1 gradient-primary border-0" 
                      onClick={handleSaveManual}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Confirm Save'}
                    </Button>
                  </div>
                </>
              )
            ) : (
              <>
                {/* Upload Section */}
                <div className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  
                  {/* Privacy Info Banner */}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                    <Lock className="h-5 w-5 text-primary flex-shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Privacy-First Processing</p>
                      <p className="text-muted-foreground">Images are processed on your device. Only text is sent for analysis.</p>
                    </div>
                  </div>
                  
                  {/* Consent Status Banner */}
                  {!hasConsent && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber/10 border border-amber/20 text-sm">
                      <Shield className="h-5 w-5 text-amber flex-shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">AI Consent Required</p>
                        <p className="text-muted-foreground">You'll be asked to consent before processing</p>
                      </div>
                    </div>
                  )}
                  
                  {extractedVitals.length === 0 ? (
                    <Card 
                      className={cn(
                        "border-dashed border-2 cursor-pointer transition-colors",
                        uploading ? "opacity-50 cursor-default" : "hover:border-primary/50"
                      )}
                      onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                      <CardContent className="flex flex-col items-center justify-center py-10">
                        {uploading ? (
                          <>
                            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                            {ocrProgress ? (
                              <div className="w-full max-w-xs space-y-2">
                                <p className="text-sm text-center font-medium">
                                  {ocrProgress.status}
                                </p>
                                <Progress value={ocrProgress.progress} className="h-2" />
                                <p className="text-xs text-muted-foreground text-center">
                                  Processing on your device...
                                </p>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm text-muted-foreground">
                                  Extracting health metrics...
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Your data is anonymized before processing
                                </p>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <FileText className="h-10 w-10 text-muted-foreground mb-4" />
                            <p className="font-medium mb-1">Upload Lab Report</p>
                            <p className="text-sm text-muted-foreground text-center">
                              Take a photo or upload a PDF of your lab results
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              Supports: JPG, PNG, WebP, PDF (max 10MB)
                            </p>
                            <Badge variant="secondary" className="mt-3 gap-1">
                              <Lock className="h-3 w-3" />
                              Images stay on your device
                            </Badge>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">Extracted Values</h4>
                          {usedLocalOCR && (
                            <Badge variant="outline" className="bg-primary/10 text-primary gap-1 text-xs">
                              <Lock className="h-3 w-3" />
                              On-device
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline" className="bg-status-success/10 text-status-success">
                          {extractedVitals.filter(v => v.selected).length} selected
                        </Badge>
                      </div>
                      
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {extractedVitals.map((vital, index) => {
                          const config = VITAL_CONFIG[vital.type];
                          const displayValue = vital.type === 'blood_pressure' && vital.secondary_value
                            ? `${vital.value}/${vital.secondary_value}`
                            : vital.value;
                          
                          return (
                            <Card 
                              key={index}
                              className={cn(
                                "cursor-pointer transition-colors",
                                vital.selected 
                                  ? "border-primary bg-primary/5" 
                                  : "opacity-60"
                              )}
                              onClick={() => toggleVitalSelection(index)}
                            >
                              <CardContent className="p-3 flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{config.label}</p>
                                  <p className="text-lg font-bold">
                                    {displayValue} 
                                    <span className="text-sm font-normal text-muted-foreground ml-1">
                                      {config.unit}
                                    </span>
                                  </p>
                                </div>
                                <div className={cn(
                                  "h-6 w-6 rounded-full flex items-center justify-center",
                                  vital.selected 
                                    ? "bg-primary text-primary-foreground" 
                                    : "bg-muted"
                                )}>
                                  {vital.selected ? (
                                    <Check className="h-4 w-4" />
                                  ) : (
                                    <X className="h-4 w-4" />
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>

                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => {
                          setExtractedVitals([]);
                          fileInputRef.current?.click();
                        }}
                      >
                        Upload Different Report
                      </Button>
                    </div>
                  )}

                  {uploadError && (
                    <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                      {uploadError}
                    </div>
                  )}
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
                    onClick={handleSaveExtracted}
                    disabled={!hasSelectedExtracted || saving}
                  >
                    {saving ? 'Saving...' : `Save ${extractedVitals.filter(v => v.selected).length} Metrics`}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Consent Dialog */}
      <AIConsentDialog
        open={showConsentDialog}
        onOpenChange={setShowConsentDialog}
        onConsent={handleConsentGranted}
        onDecline={handleConsentDeclined}
      />
    </>
  );
}
