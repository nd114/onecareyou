import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface MedicationPhoto {
  id: string;
  medication_id: string;
  user_id: string;
  storage_path: string;
  caption: string | null;
  is_primary: boolean;
  created_at: string;
  url?: string;
}

export function useMedicationPhotos(medicationId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ['medication-photos', medicationId],
    queryFn: async () => {
      if (!user || !medicationId) return [];
      
      const { data, error } = await supabase
        .from('medication_photos')
        .select('*')
        .eq('medication_id', medicationId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get signed URLs for each photo (bucket is private)
      const photosWithUrls = await Promise.all(
        (data || []).map(async (photo) => {
          const { data: urlData, error: urlError } = await supabase.storage
            .from('medication-photos')
            .createSignedUrl(photo.storage_path, 3600); // 1 hour expiration
          
          return {
            ...photo,
            url: urlError ? undefined : urlData?.signedUrl,
          } as MedicationPhoto;
        })
      );

      return photosWithUrls;
    },
    enabled: !!user && !!medicationId,
  });

  const uploadPhoto = useMutation({
    mutationFn: async ({ 
      file, 
      caption, 
      isPrimary = false 
    }: { 
      file: File; 
      caption?: string; 
      isPrimary?: boolean;
    }) => {
      if (!user || !medicationId) throw new Error('Not authenticated');

      setUploading(true);

      // Generate unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `${user.id}/${medicationId}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('medication-photos')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // If this is primary, unset other primaries first
      if (isPrimary) {
        await supabase
          .from('medication_photos')
          .update({ is_primary: false })
          .eq('medication_id', medicationId)
          .eq('user_id', user.id);
      }

      // Create database record
      const { data, error: dbError } = await supabase
        .from('medication_photos')
        .insert({
          medication_id: medicationId,
          user_id: user.id,
          storage_path: storagePath,
          caption: caption || null,
          is_primary: isPrimary,
        })
        .select()
        .single();

      if (dbError) throw dbError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-photos', medicationId] });
      toast.success('Photo uploaded successfully');
    },
    onError: (error) => {
      console.error('Upload error:', error);
      toast.error('Failed to upload photo');
    },
    onSettled: () => {
      setUploading(false);
    },
  });

  const deletePhoto = useMutation({
    mutationFn: async (photoId: string) => {
      if (!user) throw new Error('Not authenticated');

      // Get the photo to find storage path
      const photo = photos.find(p => p.id === photoId);
      if (!photo) throw new Error('Photo not found');

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('medication-photos')
        .remove([photo.storage_path]);

      if (storageError) console.warn('Storage delete error:', storageError);

      // Delete from database
      const { error: dbError } = await supabase
        .from('medication_photos')
        .delete()
        .eq('id', photoId)
        .eq('user_id', user.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-photos', medicationId] });
      toast.success('Photo deleted');
    },
    onError: (error) => {
      console.error('Delete error:', error);
      toast.error('Failed to delete photo');
    },
  });

  const setPrimaryPhoto = useMutation({
    mutationFn: async (photoId: string) => {
      if (!user || !medicationId) throw new Error('Not authenticated');

      // Unset all primaries
      await supabase
        .from('medication_photos')
        .update({ is_primary: false })
        .eq('medication_id', medicationId)
        .eq('user_id', user.id);

      // Set new primary
      const { error } = await supabase
        .from('medication_photos')
        .update({ is_primary: true })
        .eq('id', photoId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-photos', medicationId] });
      toast.success('Primary photo updated');
    },
    onError: (error) => {
      console.error('Set primary error:', error);
      toast.error('Failed to update primary photo');
    },
  });

  const primaryPhoto = photos.find(p => p.is_primary) || photos[0];

  return {
    photos,
    primaryPhoto,
    isLoading,
    uploading,
    uploadPhoto,
    deletePhoto,
    setPrimaryPhoto,
  };
}
