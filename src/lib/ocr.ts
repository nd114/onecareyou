import Tesseract from 'tesseract.js';

export interface OCRProgress {
  status: string;
  progress: number;
}

export interface OCRResult {
  text: string;
  confidence: number;
}

/**
 * Performs OCR on an image file entirely client-side using Tesseract.js
 * The raw image never leaves the user's device - only extracted text is returned
 */
export async function performLocalOCR(
  file: File,
  onProgress?: (progress: OCRProgress) => void
): Promise<OCRResult> {
  // Convert file to image data URL
  const imageDataUrl = await fileToDataURL(file);
  
  // Pre-process: ensure image is loaded and valid
  await validateImage(imageDataUrl);
  
  // Perform OCR with Tesseract.js using optimized settings
  const result = await Tesseract.recognize(
    imageDataUrl,
    'eng',
    {
      logger: (m) => {
        if (onProgress && m.status && typeof m.progress === 'number') {
          onProgress({
            status: getProgressLabel(m.status),
            progress: Math.round(m.progress * 100)
          });
        }
      }
    }
  );

  const text = result.data.text?.trim() || '';
  const confidence = result.data.confidence || 0;
  
  console.log('OCR Result - Text length:', text.length, 'Confidence:', confidence);
  
  // If confidence is very low or no text, provide helpful error
  if (confidence < 30 && text.length < 20) {
    console.warn('OCR produced low confidence result:', { confidence, textLength: text.length });
  }

  return {
    text,
    confidence
  };
}

/**
 * Validates that the image data URL can be loaded as an image
 */
async function validateImage(dataUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      console.log('Image validated:', img.width, 'x', img.height);
      resolve();
    };
    img.onerror = () => {
      reject(new Error('Failed to load image. Please try a different file.'));
    };
    img.src = dataUrl;
  });
}

/**
 * Converts a File to a data URL for Tesseract processing
 */
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Maps Tesseract status codes to user-friendly labels
 */
function getProgressLabel(status: string): string {
  const labels: Record<string, string> = {
    'loading tesseract core': 'Loading OCR engine...',
    'initializing tesseract': 'Initializing...',
    'loading language traineddata': 'Loading language data...',
    'initializing api': 'Preparing...',
    'recognizing text': 'Reading document...',
  };
  return labels[status] || status;
}

/**
 * Checks if a file is a supported image type for OCR
 */
export function isOCRSupported(file: File): boolean {
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'];
  return supportedTypes.includes(file.type);
}

/**
 * For PDF files, we still need to send to server for processing
 * Returns true if the file needs server-side processing
 */
export function requiresServerProcessing(file: File): boolean {
  return file.type === 'application/pdf';
}
