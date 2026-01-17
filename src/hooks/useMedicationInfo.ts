import { useQuery } from '@tanstack/react-query';

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

// Helper to clean HTML from label text
const cleanLabelText = (text: string | undefined): string => {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim()
    .substring(0, 2000);      // Limit length
};

export const useMedicationSearch = (query: string) => {
  return useQuery({
    queryKey: ['medication_search', query],
    queryFn: async (): Promise<DrugSearchResult[]> => {
      if (!query || query.length < 2) return [];

      try {
        // Search DailyMed SPL database
        const response = await fetch(
          `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(query)}&pagesize=10`
        );
        
        if (!response.ok) return [];
        
        const data = await response.json();
        
        return (data.data || []).map((item: any) => ({
          setId: item.setid,
          name: item.title,
          labeler: item.labeler,
          productType: item.product_type,
        }));
      } catch (error) {
        console.error('DailyMed search error:', error);
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
        // First, search for the drug to get its setId
        const searchResponse = await fetch(
          `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(drugName)}&pagesize=1`
        );
        
        if (!searchResponse.ok) {
          throw new Error('Failed to search medication');
        }
        
        const searchData = await searchResponse.json();
        
        if (!searchData.data || searchData.data.length === 0) {
          return null;
        }

        const setId = searchData.data[0].setid;
        
        // Get detailed label information using OpenFDA
        const fdaResponse = await fetch(
          `https://api.fda.gov/drug/label.json?search=set_id:"${setId}"&limit=1`
        );
        
        let labelData: DrugLabel = {
          setId,
          name: searchData.data[0].title,
        };

        if (fdaResponse.ok) {
          const fdaData = await fdaResponse.json();
          const result = fdaData.results?.[0];
          
          if (result) {
            labelData = {
              setId,
              name: result.openfda?.brand_name?.[0] || searchData.data[0].title,
              genericName: result.openfda?.generic_name?.[0],
              manufacturerName: result.openfda?.manufacturer_name?.[0],
              dosageForm: result.dosage_form?.[0],
              route: result.openfda?.route,
              activeIngredients: result.openfda?.substance_name,
              indications: cleanLabelText(result.indications_and_usage?.[0]),
              warnings: cleanLabelText(result.warnings?.[0] || result.boxed_warning?.[0]),
              adverseReactions: cleanLabelText(result.adverse_reactions?.[0]),
              dosageAndAdministration: cleanLabelText(result.dosage_and_administration?.[0]),
              howSupplied: cleanLabelText(result.how_supplied?.[0]),
              drugInteractions: cleanLabelText(result.drug_interactions?.[0]),
              contraindications: cleanLabelText(result.contraindications?.[0]),
              pregnancyInfo: cleanLabelText(result.pregnancy?.[0]),
              pediatricUse: cleanLabelText(result.pediatric_use?.[0]),
              geriatricUse: cleanLabelText(result.geriatric_use?.[0]),
            };
          }
        }

        return labelData;
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
        const response = await fetch(
          `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(drugName)}`
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        return data.idGroup?.rxnormId?.[0] || null;
      } catch {
        return null;
      }
    },
    enabled: !!drugName,
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
  });
};
