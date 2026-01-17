import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'high' | 'moderate' | 'low';
  description: string;
  source: string;
  sourceUrl?: string;
}

interface RxCuiResult {
  name: string;
  rxcui: string;
}

export function useDrugInteractions() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Look up RxCUI for a drug name
  const getRxCui = useCallback(async (drugName: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('drug-lookup', {
        body: { action: 'get-rxcui', drugName }
      });
      
      if (error) {
        console.error('Error fetching RxCUI:', error);
        return null;
      }
      
      return data || null;
    } catch (err) {
      console.error('Error fetching RxCUI:', err);
      return null;
    }
  }, []);

  // Get interactions between a list of drugs
  const getInteractions = useCallback(async (drugNames: string[]): Promise<DrugInteraction[]> => {
    if (drugNames.length < 2) return [];
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('drug-lookup', {
        body: { action: 'check-interactions', drugNames }
      });
      
      if (error) {
        console.error('Error fetching drug interactions:', error);
        setError('Failed to check drug interactions. Please try again later.');
        return [];
      }
      
      if (data?.error) {
        setError(data.error);
        return [];
      }
      
      return data || [];
    } catch (err) {
      console.error('Error fetching drug interactions:', err);
      setError('Failed to check drug interactions. Please try again later.');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Search for drugs by name (for autocomplete)
  const searchDrugs = useCallback(async (query: string): Promise<RxCuiResult[]> => {
    if (!query || query.length < 2) return [];
    
    try {
      const { data, error } = await supabase.functions.invoke('drug-lookup', {
        body: { action: 'search', query }
      });
      
      if (error) {
        console.error('Error searching drugs:', error);
        return [];
      }
      
      // Map the search results to RxCuiResult format
      return (data || []).map((item: any) => ({
        name: item.name,
        rxcui: item.setId,
      })).slice(0, 20);
    } catch (err) {
      console.error('Error searching drugs:', err);
      return [];
    }
  }, []);

  return {
    getInteractions,
    searchDrugs,
    getRxCui,
    isLoading,
    error,
  };
}
