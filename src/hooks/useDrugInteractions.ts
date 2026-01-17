import { useState, useCallback } from 'react';

interface InteractionConcept {
  minConceptItem: {
    rxcui: string;
    name: string;
    tty: string;
  };
}

interface InteractionPair {
  interactionConcept: Array<{
    minConceptItem: {
      rxcui: string;
      name: string;
    };
    sourceConceptItem: {
      id: string;
      name: string;
      url: string;
    };
  }>;
  severity?: string;
  description: string;
}

interface InteractionTypeGroup {
  sourceDisclaimer: string;
  sourceName: string;
  interactionType: Array<{
    comment: string;
    minConceptItem: {
      rxcui: string;
      name: string;
      tty: string;
    };
    interactionPair: InteractionPair[];
  }>;
}

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

// Cache for RxCUI lookups
const rxcuiCache = new Map<string, string | null>();

export function useDrugInteractions() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Look up RxCUI for a drug name
  const getRxCui = useCallback(async (drugName: string): Promise<string | null> => {
    const normalizedName = drugName.toLowerCase().trim();
    
    // Check cache first
    if (rxcuiCache.has(normalizedName)) {
      return rxcuiCache.get(normalizedName) || null;
    }

    try {
      // First try exact match
      const response = await fetch(
        `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(normalizedName)}&search=1`
      );
      const data = await response.json();
      
      if (data.idGroup?.rxnormId?.[0]) {
        rxcuiCache.set(normalizedName, data.idGroup.rxnormId[0]);
        return data.idGroup.rxnormId[0];
      }

      // Try approximate match
      const approxResponse = await fetch(
        `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(normalizedName)}&maxEntries=1`
      );
      const approxData = await approxResponse.json();
      
      if (approxData.approximateGroup?.candidate?.[0]?.rxcui) {
        const rxcui = approxData.approximateGroup.candidate[0].rxcui;
        rxcuiCache.set(normalizedName, rxcui);
        return rxcui;
      }

      rxcuiCache.set(normalizedName, null);
      return null;
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
      // Get RxCUIs for all drugs in parallel
      const rxcuiPromises = drugNames.map(name => getRxCui(name));
      const rxcuis = await Promise.all(rxcuiPromises);
      
      // Filter out drugs without RxCUIs
      const validRxcuis = rxcuis.filter((rxcui): rxcui is string => rxcui !== null);
      
      if (validRxcuis.length < 2) {
        // Not enough drugs found in RxNorm database
        return [];
      }

      // Call the interaction API
      const interactionResponse = await fetch(
        `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${validRxcuis.join('+')}`
      );
      const interactionData = await interactionResponse.json();
      
      const interactions: DrugInteraction[] = [];
      
      if (interactionData.fullInteractionTypeGroup) {
        for (const group of interactionData.fullInteractionTypeGroup as InteractionTypeGroup[]) {
          for (const interactionType of group.interactionType || []) {
            for (const pair of interactionType.interactionPair || []) {
              // Extract drug names from the interaction
              const drugs = pair.interactionConcept.map(c => c.minConceptItem.name);
              
              // Determine severity based on description keywords
              let severity: 'high' | 'moderate' | 'low' = 'moderate';
              const desc = pair.description.toLowerCase();
              
              if (
                desc.includes('contraindicated') ||
                desc.includes('avoid') ||
                desc.includes('serious') ||
                desc.includes('severe') ||
                desc.includes('fatal') ||
                desc.includes('death') ||
                desc.includes('life-threatening') ||
                desc.includes('do not use') ||
                desc.includes('serotonin syndrome') ||
                desc.includes('qt prolongation') ||
                desc.includes('bleeding')
              ) {
                severity = 'high';
              } else if (
                desc.includes('minor') ||
                desc.includes('unlikely') ||
                desc.includes('theoretical') ||
                desc.includes('not clinically significant')
              ) {
                severity = 'low';
              }

              interactions.push({
                drug1: drugs[0] || 'Unknown',
                drug2: drugs[1] || 'Unknown',
                severity,
                description: pair.description,
                source: group.sourceName,
                sourceUrl: pair.interactionConcept[0]?.sourceConceptItem?.url,
              });
            }
          }
        }
      }
      
      // Sort by severity
      return interactions.sort((a, b) => {
        const order = { high: 0, moderate: 1, low: 2 };
        return order[a.severity] - order[b.severity];
      });
    } catch (err) {
      console.error('Error fetching drug interactions:', err);
      setError('Failed to check drug interactions. Please try again later.');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [getRxCui]);

  // Search for drugs by name (for autocomplete)
  const searchDrugs = useCallback(async (query: string): Promise<RxCuiResult[]> => {
    if (!query || query.length < 2) return [];
    
    try {
      const response = await fetch(
        `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      
      const results: RxCuiResult[] = [];
      
      if (data.drugGroup?.conceptGroup) {
        for (const group of data.drugGroup.conceptGroup) {
          if (group.conceptProperties) {
            for (const concept of group.conceptProperties) {
              results.push({
                name: concept.name,
                rxcui: concept.rxcui,
              });
            }
          }
        }
      }
      
      // Return unique results by name
      const seen = new Set<string>();
      return results.filter(r => {
        const lowerName = r.name.toLowerCase();
        if (seen.has(lowerName)) return false;
        seen.add(lowerName);
        return true;
      }).slice(0, 20);
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
