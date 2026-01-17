import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Star, Trash2, Loader2, Upload, ImageIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { useMedicationPhotos, MedicationPhoto } from '@/hooks/useMedicationPhotos';
import { cn } from '@/lib/utils';

interface MedicationPhotoGalleryProps {
  medicationId: string;
  medicationName: string;
  compact?: boolean;
}

export function MedicationPhotoGallery({ 
  medicationId, 
  medicationName,
  compact = false 
}: MedicationPhotoGalleryProps) {
  const { photos, primaryPhoto, isLoading, uploading, uploadPhoto, deletePhoto, setPrimaryPhoto } = useMedicationPhotos(medicationId);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showGalleryDialog, setShowGalleryDialog] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<MedicationPhoto | null>(null);
  const [deletePhotoId, setDeletePhotoId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setShowUploadDialog(true);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    await uploadPhoto.mutateAsync({
      file: selectedFile,
      caption: caption || undefined,
      isPrimary: isPrimary || photos.length === 0,
    });

    // Reset state
    setShowUploadDialog(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaption('');
    setIsPrimary(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (deletePhotoId) {
      await deletePhoto.mutateAsync(deletePhotoId);
      setDeletePhotoId(null);
      if (selectedPhoto?.id === deletePhotoId) {
        setSelectedPhoto(null);
      }
    }
  };

  const handleSetPrimary = async (photoId: string) => {
    await setPrimaryPhoto.mutateAsync(photoId);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        
        {primaryPhoto ? (
          <button
            onClick={() => setShowGalleryDialog(true)}
            className="relative h-12 w-12 rounded-xl overflow-hidden border-2 border-primary/20 hover:border-primary/40 transition-colors"
          >
            <img 
              src={primaryPhoto.url} 
              alt={medicationName}
              className="h-full w-full object-cover"
            />
            {photos.length > 1 && (
              <span className="absolute bottom-0 right-0 bg-primary text-primary-foreground text-[10px] px-1 rounded-tl">
                +{photos.length - 1}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="h-12 w-12 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 transition-colors"
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Camera className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
        )}

        {/* Upload Dialog */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Photo</DialogTitle>
              <DialogDescription>
                Add a photo of {medicationName} for easy identification
              </DialogDescription>
            </DialogHeader>
            
            {previewUrl && (
              <div className="space-y-4">
                <div className="relative aspect-square max-h-64 mx-auto rounded-lg overflow-hidden bg-muted">
                  <img 
                    src={previewUrl} 
                    alt="Preview" 
                    className="h-full w-full object-contain"
                  />
                </div>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="caption">Caption (optional)</Label>
                    <Input
                      id="caption"
                      placeholder="e.g., Front view, With packaging..."
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                    />
                  </div>
                  
                  {photos.length > 0 && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isPrimary}
                        onChange={(e) => setIsPrimary(e.target.checked)}
                        className="rounded"
                      />
                      Set as primary photo
                    </label>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowUploadDialog(false);
                      setSelectedFile(null);
                      setPreviewUrl(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleUpload}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Gallery Dialog */}
        <Dialog open={showGalleryDialog} onOpenChange={setShowGalleryDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{medicationName} Photos</DialogTitle>
              <DialogDescription>
                {photos.length} photo{photos.length !== 1 ? 's' : ''} • Click to view larger
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo) => (
                <motion.div
                  key={photo.id}
                  layout
                  className="relative aspect-square rounded-lg overflow-hidden bg-muted group cursor-pointer"
                  onClick={() => setSelectedPhoto(photo)}
                >
                  <img 
                    src={photo.url} 
                    alt={photo.caption || medicationName}
                    className="h-full w-full object-cover"
                  />
                  {photo.is_primary && (
                    <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full p-1">
                      <Star className="h-3 w-3" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {!photo.is_primary && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetPrimary(photo.id);
                        }}
                      >
                        <Star className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletePhotoId(photo.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </motion.div>
              ))}
              
              {/* Add more button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 hover:border-primary/50 transition-colors"
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Plus className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Add Photo</span>
                  </>
                )}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Photo Viewer Dialog */}
        <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
          <DialogContent className="max-w-3xl">
            {selectedPhoto && (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
                  <img 
                    src={selectedPhoto.url} 
                    alt={selectedPhoto.caption || medicationName}
                    className="h-full w-full object-contain"
                  />
                </div>
                {selectedPhoto.caption && (
                  <p className="text-center text-muted-foreground">{selectedPhoto.caption}</p>
                )}
                <div className="flex justify-center gap-2">
                  {!selectedPhoto.is_primary && (
                    <Button
                      variant="outline"
                      onClick={() => handleSetPrimary(selectedPhoto.id)}
                    >
                      <Star className="h-4 w-4 mr-2" />
                      Set as Primary
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={() => setDeletePhotoId(selectedPhoto.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletePhotoId} onOpenChange={() => setDeletePhotoId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Photo</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this photo? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Full gallery view (for Edit Medication page)
  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">Photo Gallery</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Camera className="h-4 w-4 mr-2" />
          )}
          Add Photo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : photos.length === 0 ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-8 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center gap-2 hover:border-primary/50 transition-colors"
        >
          <ImageIcon className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No photos yet</p>
          <p className="text-xs text-muted-foreground">Click to add your first photo</p>
        </button>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          <AnimatePresence>
            {photos.map((photo) => (
              <motion.div
                key={photo.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative aspect-square rounded-lg overflow-hidden bg-muted group"
              >
                <img 
                  src={photo.url} 
                  alt={photo.caption || medicationName}
                  className="h-full w-full object-cover"
                />
                {photo.is_primary && (
                  <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full p-1">
                    <Star className="h-3 w-3" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  {!photo.is_primary && (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      onClick={() => handleSetPrimary(photo.id)}
                      title="Set as primary"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8"
                    onClick={() => setDeletePhotoId(photo.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {photo.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <p className="text-xs text-white truncate">{photo.caption}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Photo</DialogTitle>
            <DialogDescription>
              Add a photo of {medicationName} for easy identification
            </DialogDescription>
          </DialogHeader>
          
          {previewUrl && (
            <div className="space-y-4">
              <div className="relative aspect-square max-h-64 mx-auto rounded-lg overflow-hidden bg-muted">
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="h-full w-full object-contain"
                />
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label htmlFor="caption-full">Caption (optional)</Label>
                  <Input
                    id="caption-full"
                    placeholder="e.g., Front view, With packaging..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                </div>
                
                {photos.length > 0 && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isPrimary}
                      onChange={(e) => setIsPrimary(e.target.checked)}
                      className="rounded"
                    />
                    Set as primary photo
                  </label>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowUploadDialog(false);
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletePhotoId} onOpenChange={() => setDeletePhotoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
