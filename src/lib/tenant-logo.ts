import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'tenant-logos';
/** Signed links last a year; branding changes rarely and we re-sign on every save. */
const SIGNED_URL_TTL = 60 * 60 * 24 * 365;

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Uploads an institution logo into the tenant-logos bucket under the practice id
 * folder and returns a long-lived signed URL that can be stored on the practice.
 */
export async function uploadTenantLogo(practiceId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');
  if (file.size > MAX_LOGO_BYTES) throw new Error('The logo must be smaller than 2MB');

  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${practiceId}/logo-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw upErr;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) throw error ?? new Error('Could not create a link for the logo');
  return data.signedUrl;
}
