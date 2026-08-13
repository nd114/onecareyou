import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { tenantSlugFromHost } from '@/lib/tenant-host';

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

/**
 * Institution slug taken from the host (e.g. lmc.onecare.you -> "lmc").
 * Thin re-export so existing call sites keep working; the resolution rules
 * live in src/lib/tenant-host.ts.
 */
export function institutionSlugFromHost(host?: string): string | null {
  return tenantSlugFromHost(host);
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
