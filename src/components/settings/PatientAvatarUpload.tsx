import { useState } from 'react';
import { Camera, Loader2, Upload, Eye, EyeOff } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface PatientAvatarUploadProps {
  avatarUrl: string | null;
  avatarSharedWithClinicians: boolean;
  onAvatarChange: (url: string | null) => void;
  onSharingChange: (shared: boolean) => void;
}

export function PatientAvatarUpload({
  avatarUrl,
  avatarSharedWithClinicians,
  onAvatarChange,
  onSharingChange,
}: PatientAvatarUploadProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingSharing, setIsSavingSharing] = useState(false);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('patient-avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get signed URL for private bucket
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from('patient-avatars')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year

      if (urlError) throw urlError;

      const newAvatarUrl = signedUrlData.signedUrl;

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      onAvatarChange(newAvatarUrl);
      refreshProfile?.();
      toast.success('Profile photo updated');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload profile photo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSharingChange = async (shared: boolean) => {
    if (!user) return;

    setIsSavingSharing(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_shared_with_clinicians: shared })
        .eq('user_id', user.id);

      if (error) throw error;

      onSharingChange(shared);
      refreshProfile?.();
      toast.success(shared ? 'Avatar will be visible to your clinicians' : 'Avatar hidden from clinicians');
    } catch (error) {
      console.error('Error updating sharing preference:', error);
      toast.error('Failed to update sharing preference');
    } finally {
      setIsSavingSharing(false);
    }
  };

  const displayName = (profile as any)?.name || user?.email || 'U';

  return (
    <div className="space-y-4">
      {/* Avatar Upload */}
      <div className="flex items-center gap-6">
        <div className="relative">
          <Avatar className="h-20 w-20">
            <AvatarImage src={avatarUrl || undefined} alt="Profile photo" />
            <AvatarFallback className="text-lg bg-primary/10 text-primary">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <label 
            htmlFor="patient-avatar-upload" 
            className="absolute bottom-0 right-0 p-1.5 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-colors"
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
          </label>
          <input
            id="patient-avatar-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
            disabled={isUploading}
          />
        </div>
        <div className="flex-1">
          <p className="font-medium">Profile Photo</p>
          <p className="text-sm text-muted-foreground">
            Add a photo to personalize your account
          </p>
          <label 
            htmlFor="patient-avatar-upload" 
            className="text-sm text-primary hover:underline cursor-pointer inline-flex items-center gap-1 mt-1"
          >
            <Upload className="h-3 w-3" />
            {avatarUrl ? 'Change photo' : 'Upload photo'}
          </label>
        </div>
      </div>

      {/* Sharing Toggle */}
      {avatarUrl && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            {avatarSharedWithClinicians ? (
              <Eye className="h-5 w-5 text-muted-foreground" />
            ) : (
              <EyeOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <Label className="text-sm font-medium">Share with Clinicians</Label>
              <p className="text-xs text-muted-foreground">
                Allow your healthcare providers to see your photo
              </p>
            </div>
          </div>
          <Switch
            checked={avatarSharedWithClinicians}
            onCheckedChange={handleSharingChange}
            disabled={isSavingSharing}
          />
        </div>
      )}
    </div>
  );
}
