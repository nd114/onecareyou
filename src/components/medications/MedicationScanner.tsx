import { useState, useRef, useCallback } from 'react';
import { Camera, ScanBarcode, X, Loader2, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface MedicationInfo {
  name: string;
  rxcui?: string;
  dosageForm?: string;
  strength?: string;
  manufacturer?: string;
  genericName?: string;
  imprint?: string;
  shape?: string;
  color?: string;
  warnings?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

interface MedicationScannerProps {
  onMedicationIdentified: (info: MedicationInfo) => void;
}

export function MedicationScanner({ onMedicationIdentified }: MedicationScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'photo' | 'barcode' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [result, setResult] = useState<MedicationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please check permissions.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      stopCamera();
      setMode(null);
      setCapturedImage(null);
      setResult(null);
      setError(null);
    }
  };

  const selectMode = async (selectedMode: 'photo' | 'barcode') => {
    setMode(selectedMode);
    setError(null);
    await startCamera();
  };

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(imageData);
      stopCamera();
      processImage(imageData);
    }
  }, [stopCamera]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      setCapturedImage(imageData);
      processImage(imageData);
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (imageData: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      if (mode === 'barcode') {
        // Try to detect barcode using BarcodeDetector API (if available)
        if ('BarcodeDetector' in window) {
          const img = new Image();
          img.src = imageData;
          await new Promise(resolve => img.onload = resolve);

          // @ts-ignore - BarcodeDetector is not in TypeScript types yet
          const detector = new window.BarcodeDetector({ formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8'] });
          const barcodes = await detector.detect(img);

          if (barcodes.length > 0) {
            const ndc = barcodes[0].rawValue;
            await lookupNDC(ndc);
            return;
          }
        }
        
        // Fallback: ask user to enter barcode manually
        setError('Barcode not detected. Please ensure the barcode is clearly visible or enter it manually.');
      } else {
        // For photo identification, we'll use AI to analyze the pill
        await identifyPill(imageData);
      }
    } catch (err) {
      console.error('Processing error:', err);
      setError('Failed to process image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const lookupNDC = async (ndc: string) => {
    try {
      // Clean the NDC (remove dashes, etc.)
      const cleanNdc = ndc.replace(/[^0-9]/g, '');
      
      // Look up in RxNorm using NDC
      const response = await fetch(
        `https://rxnav.nlm.nih.gov/REST/ndcstatus.json?ndc=${cleanNdc}`
      );
      const data = await response.json();

      if (data.ndcStatus?.rxcui) {
        // Get drug name from RxCUI
        const rxcuiResponse = await fetch(
          `https://rxnav.nlm.nih.gov/REST/rxcui/${data.ndcStatus.rxcui}/properties.json`
        );
        const rxcuiData = await rxcuiResponse.json();

        if (rxcuiData.properties) {
          const info: MedicationInfo = {
            name: rxcuiData.properties.name,
            rxcui: data.ndcStatus.rxcui,
          };
          setResult(info);
          return;
        }
      }

      // Try OpenFDA as fallback
      const fdaResponse = await fetch(
        `https://api.fda.gov/drug/ndc.json?search=product_ndc:"${cleanNdc}"&limit=1`
      );
      const fdaData = await fdaResponse.json();

      if (fdaData.results?.[0]) {
        const drug = fdaData.results[0];
        const info: MedicationInfo = {
          name: drug.brand_name || drug.generic_name,
          dosageForm: drug.dosage_form,
          strength: drug.active_ingredients?.[0]?.strength,
          manufacturer: drug.labeler_name,
        };
        setResult(info);
        return;
      }

      setError('Medication not found in database. Please enter details manually.');
    } catch (err) {
      console.error('NDC lookup error:', err);
      setError('Failed to look up medication. Please try again.');
    }
  };

  const identifyPill = async (imageData: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('identify-pill', {
        body: { image: imageData }
      });

      if (error) {
        console.error('Pill identification error:', error);
        setError('Failed to identify medication. Please try again.');
        return;
      }

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.identified && data.name) {
        const info: MedicationInfo = {
          name: data.name,
          genericName: data.genericName,
          strength: data.strength,
          manufacturer: data.manufacturer,
          dosageForm: data.shape,
          imprint: data.imprint,
          shape: data.shape,
          color: data.color,
          warnings: data.warnings,
          confidence: data.confidence,
        };
        setResult(info);
      } else {
        // Not identified but got characteristics
        setError(
          `Could not confidently identify this medication. ` +
          `Observed: ${data.shape || 'unknown shape'}, ${data.color || 'unknown color'}` +
          (data.imprint ? `, imprint: ${data.imprint}` : '') +
          `. ${data.notes || 'Please verify with a pharmacist.'}`
        );
      }
    } catch (err) {
      console.error('Pill identification error:', err);
      setError('Failed to identify medication. Please try again.');
    }
  };

  const handleUseMedication = () => {
    if (result) {
      onMedicationIdentified(result);
      toast.success(`Added: ${result.name}`);
      handleOpenChange(false);
    }
  };

  const retake = () => {
    setCapturedImage(null);
    setResult(null);
    setError(null);
    startCamera();
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setMode('photo');
            setIsOpen(true);
          }}
          className="flex-1"
        >
          <Camera className="h-4 w-4 mr-2" />
          Photo ID
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setMode('barcode');
            setIsOpen(true);
          }}
          className="flex-1"
        >
          <ScanBarcode className="h-4 w-4 mr-2" />
          Scan Barcode
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileUpload}
      />

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {mode === 'photo' ? (
                <>
                  <Camera className="h-5 w-5" />
                  Identify Medication by Photo
                </>
              ) : (
                <>
                  <ScanBarcode className="h-5 w-5" />
                  Scan Medication Barcode
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {mode === 'photo' 
                ? 'Take a clear photo of your medication pill or tablet'
                : 'Point your camera at the barcode on the medication package'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!capturedImage ? (
              <>
                <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {mode === 'barcode' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-3/4 h-1/3 border-2 border-primary/70 rounded-lg">
                        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary/50" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={capturePhoto}
                    className="flex-1 gradient-primary border-0"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Capture
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="relative aspect-[4/3] rounded-lg overflow-hidden">
                  <img 
                    src={capturedImage} 
                    alt="Captured medication" 
                    className="w-full h-full object-cover"
                  />
                </div>

                {isProcessing && (
                  <Card>
                    <CardContent className="p-4 flex items-center justify-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span>Analyzing image...</span>
                    </CardContent>
                  </Card>
                )}

                {error && (
                  <Card className="border-destructive/30 bg-destructive/5">
                    <CardContent className="p-4 flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-destructive">{error}</p>
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-sm mt-2"
                          onClick={retake}
                        >
                          Try again
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {result && (
                  <Card className={`${
                    result.confidence === 'high' 
                      ? 'border-status-success/30 bg-status-success/5' 
                      : result.confidence === 'medium'
                      ? 'border-yellow-500/30 bg-yellow-500/5'
                      : 'border-orange-500/30 bg-orange-500/5'
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {result.confidence === 'high' ? (
                          <CheckCircle className="h-5 w-5 text-status-success shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`font-semibold ${
                              result.confidence === 'high' ? 'text-status-success' : 'text-yellow-600'
                            }`}>
                              {result.confidence === 'high' ? 'Medication Identified!' : 'Possible Match'}
                            </p>
                            <Badge variant="outline" className="text-xs capitalize">
                              {result.confidence || 'unknown'} confidence
                            </Badge>
                          </div>
                          <p className="text-lg font-medium mt-1">{result.name}</p>
                          {result.genericName && result.genericName !== result.name && (
                            <p className="text-sm text-muted-foreground">Generic: {result.genericName}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {result.color && (
                              <Badge variant="outline" className="text-xs">
                                {result.color}
                              </Badge>
                            )}
                            {result.shape && (
                              <Badge variant="outline" className="text-xs">
                                {result.shape}
                              </Badge>
                            )}
                            {result.imprint && (
                              <Badge variant="outline" className="text-xs">
                                Imprint: {result.imprint}
                              </Badge>
                            )}
                            {result.strength && (
                              <Badge variant="outline" className="text-xs">
                                {result.strength}
                              </Badge>
                            )}
                          </div>
                          {result.manufacturer && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Manufacturer: {result.manufacturer}
                            </p>
                          )}
                          {result.warnings && result.warnings.length > 0 && (
                            <div className="mt-3 p-2 bg-destructive/10 rounded-lg">
                              <p className="text-xs font-medium text-destructive flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Warnings
                              </p>
                              <ul className="text-xs text-destructive/80 mt-1 space-y-0.5">
                                {result.warnings.map((w, i) => (
                                  <li key={i}>• {w}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-3 italic">
                            ⚠️ Always verify with a pharmacist before use
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={retake} className="flex-1">
                    Retake
                  </Button>
                  {result && (
                    <Button 
                      onClick={handleUseMedication}
                      className="flex-1 gradient-primary border-0"
                    >
                      Use This Medication
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </DialogContent>
      </Dialog>
    </>
  );
}
