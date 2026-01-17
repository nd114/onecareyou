import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DrugLabel {
  setId: string;
  name: string;
  genericName?: string;
  manufacturerName?: string;
  dosageForm?: string;
  route?: string[];
  activeIngredients?: string[];
  indications?: string;
  warnings?: string;
  adverseReactions?: string;
  dosageAndAdministration?: string;
  howSupplied?: string;
  drugInteractions?: string;
  contraindications?: string;
  pregnancyInfo?: string;
  pediatricUse?: string;
  geriatricUse?: string;
}

export interface DrugSearchResult {
  setId: string;
  name: string;
  labeler: string;
  productType: string;
}

export const useMedicationSearch = (query: string) => {
  return useQuery({
    queryKey: ['medication_search', query],
    queryFn: async (): Promise<DrugSearchResult[]> => {
      if (!query || query.length < 2) return [];

      try {
        const { data, error } = await supabase.functions.invoke('drug-lookup', {
          body: { action: 'search', query }
        });
        
        if (error) {
          console.error('Drug search error:', error);
          return [];
        }
        
        return data || [];
      } catch (error) {
        console.error('Drug search error:', error);
        return [];
      }
    },
    enabled: query.length >= 2,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};

export const useMedicationInfo = (drugName: string | null) => {
  return useQuery({
    queryKey: ['medication_info', drugName],
    queryFn: async (): Promise<DrugLabel | null> => {
      if (!drugName) return null;

      try {
        const { data, error } = await supabase.functions.invoke('drug-lookup', {
          body: { action: 'get-info', drugName }
        });
        
        if (error) {
          console.error('Medication info error:', error);
          throw new Error('Failed to fetch medication info');
        }
        
        if (data?.error) {
          throw new Error(data.error);
        }
        
        return data;
      } catch (error) {
        console.error('Medication info error:', error);
        throw error;
      }
    },
    enabled: !!drugName,
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
    retry: 1,
  });
};

// Helper to fetch RxCUI for a drug name (useful for interactions)
export const useRxCui = (drugName: string | null) => {
  return useQuery({
    queryKey: ['rxcui', drugName],
    queryFn: async (): Promise<string | null> => {
      if (!drugName) return null;

      try {
        const { data, error } = await supabase.functions.invoke('drug-lookup', {
          body: { action: 'get-rxcui', drugName }
        });
        
        if (error) return null;
        
        return data || null;
      } catch {
        return null;
      }
    },
    enabled: !!drugName,
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
  });
};
