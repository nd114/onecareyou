import { useState, useRef, useCallback } from 'react';
import { Camera, ScanBarcode, X, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface MedicationInfo {
  name: string;
  rxcui?: string;
  dosageForm?: string;
  strength?: string;
  manufacturer?: string;
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
    // For pill identification, we'll use NIH's Pillbox API characteristics
    // In a real app, you'd send the image to an AI service for analysis
    
    // Since we can't do real pill identification without an AI vision API,
    // we'll show a helpful message
    setError(
      'Pill photo identification requires AI vision processing. ' +
      'For now, please use the medication search to find your medication, ' +
      'or scan the barcode on the medication package.'
    );
    
    // In a production app, you would:
    // 1. Send image to an AI vision API (OpenAI GPT-4V, Google Gemini, etc.)
    // 2. Extract pill characteristics (shape, color, imprint)
    // 3. Query NIH Pillbox or similar database
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
                  <Card className="border-status-success/30 bg-status-success/5">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="h-5 w-5 text-status-success shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-semibold text-status-success">Medication Found!</p>
                          <p className="text-lg font-medium mt-1">{result.name}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {result.rxcui && (
                              <Badge variant="outline" className="text-xs">
                                RxCUI: {result.rxcui}
                              </Badge>
                            )}
                            {result.dosageForm && (
                              <Badge variant="outline" className="text-xs">
                                {result.dosageForm}
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
