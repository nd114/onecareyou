import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PublicInstitution {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  country: string | null;
  tenant_type: string | null;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
}

/** Institution slug taken from the host (e.g. lmc.onecare.you -> "lmc"). */
export function institutionSlugFromHost(host = window.location.hostname): string | null {
  const reserved = new Set(['www', 'app', 'onecare', 'localhost', 'preview', 'id-preview']);
  const parts = host.split('.');
  if (parts.length < 3) return null;
  const sub = parts[0].toLowerCase();
  if (reserved.has(sub) || sub.includes('-preview') || sub.endsWith('lovable')) return null;
  return sub;
}

/** Public, pre-auth branding for an institution's own sign-up address. */
export function useInstitutionBranding(slug?: string | null) {
  const query = useQuery({
    queryKey: ['public-institution', slug],
    enabled: !!slug,
    queryFn: async (): Promise<PublicInstitution | null> => {
      const { data, error } = await supabase.rpc('public_institution_by_slug', {
        _slug: slug!,
      });
      if (error) throw error;
      return ((data || []) as PublicInstitution[])[0] ?? null;
    },
  });

  return { institution: query.data ?? null, isLoading: query.isLoading };
}
