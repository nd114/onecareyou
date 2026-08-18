/**
 * Offline drug-interaction reference.
 *
 * A small hand-maintained table used when the NIH RxNorm lookup is unavailable,
 * and as a second opinion alongside it. It is deliberately not authoritative —
 * it exists so the app still says something useful with no connection.
 *
 * It used to render as its own panel underneath the RxNorm one, which meant the
 * two could contradict each other on screen: "No interactions found" sitting
 * directly above a real Lisinopril + Metformin warning. Both sources now feed a
 * single verdict in InteractionsPanel, which never reports "safe" while any
 * source disagrees.
 */
import { Medication } from '@/hooks/useMedications';

export interface InteractionInfo {
  medications: [string, string];
  severity: 'high' | 'moderate' | 'low';
  description: string;
  recommendation: string;
}

// Common drug interactions database (simplified)
export const INTERACTION_DATABASE: InteractionInfo[] = [
  // NSAID interactions
  {
    medications: ['Ibuprofen', 'Advil'],
    severity: 'moderate',
    description: 'Advil is a brand name for Ibuprofen. Taking both means double dosing on the same medication.',
    recommendation: 'Do not take both. Choose one or the other.',
  },
  {
    medications: ['Ibuprofen', 'Aspirin'],
    severity: 'moderate',
    description: 'Both are NSAIDs. Combined use increases risk of stomach bleeding and kidney problems.',
    recommendation: 'Avoid taking together unless directed by your doctor.',
  },
  {
    medications: ['Ibuprofen', 'Naproxen'],
    severity: 'moderate',
    description: 'Both are NSAIDs. Combined use increases risk of stomach bleeding and kidney problems.',
    recommendation: 'Do not take together. Choose one NSAID only.',
  },
  {
    medications: ['Advil', 'Aspirin'],
    severity: 'moderate',
    description: 'Both are NSAIDs. Combined use increases risk of stomach bleeding.',
    recommendation: 'Avoid taking together unless directed by your doctor.',
  },
  {
    medications: ['Advil', 'Naproxen'],
    severity: 'moderate',
    description: 'Both are NSAIDs. Combined use increases risk of gastrointestinal bleeding.',
    recommendation: 'Do not take together. Choose one NSAID only.',
  },
  // Original interactions
  {
    medications: ['Metformin', 'Lisinopril'],
    severity: 'low',
    description: 'Lisinopril may slightly enhance the blood glucose-lowering effect of Metformin.',
    recommendation: 'Monitor blood glucose levels. Usually no action needed.',
  },
  {
    medications: ['Warfarin', 'Aspirin'],
    severity: 'high',
    description: 'Combined use significantly increases bleeding risk.',
    recommendation: 'Consult your doctor immediately. Close monitoring required.',
  },
  {
    medications: ['Warfarin', 'Ibuprofen'],
    severity: 'high',
    description: 'NSAIDs like Ibuprofen increase the risk of bleeding when taken with Warfarin.',
    recommendation: 'Avoid combination. Consult your healthcare provider.',
  },
  {
    medications: ['Warfarin', 'Advil'],
    severity: 'high',
    description: 'NSAIDs like Advil (Ibuprofen) increase the risk of bleeding when taken with Warfarin.',
    recommendation: 'Avoid combination. Consult your healthcare provider.',
  },
  {
    medications: ['Warfarin', 'Vitamin K'],
    severity: 'moderate',
    description: 'Vitamin K can reduce the effectiveness of Warfarin.',
    recommendation: 'Maintain consistent Vitamin K intake. Monitor INR closely.',
  },
  {
    medications: ['Lisinopril', 'Potassium'],
    severity: 'moderate',
    description: 'ACE inhibitors like Lisinopril can increase potassium levels.',
    recommendation: 'Monitor potassium levels regularly. Avoid high-potassium supplements.',
  },
  {
    medications: ['Atorvastatin', 'Grapefruit'],
    severity: 'moderate',
    description: 'Grapefruit can increase statin levels in the blood.',
    recommendation: 'Avoid grapefruit products while taking this medication.',
  },
  {
    medications: ['Metoprolol', 'Verapamil'],
    severity: 'high',
    description: 'Both medications slow heart rate. Combination can cause severe bradycardia.',
    recommendation: 'Use together only under close medical supervision.',
  },
  {
    medications: ['Metformin', 'Alcohol'],
    severity: 'high',
    description: 'Alcohol can increase the risk of lactic acidosis with Metformin.',
    recommendation: 'Limit alcohol consumption. Monitor for symptoms.',
  },
  {
    medications: ['Simvastatin', 'Amlodipine'],
    severity: 'moderate',
    description: 'Amlodipine can increase Simvastatin blood levels.',
    recommendation: 'Simvastatin dose should not exceed 20mg daily.',
  },
  {
    medications: ['Omeprazole', 'Clopidogrel'],
    severity: 'moderate',
    description: 'Omeprazole may reduce the effectiveness of Clopidogrel.',
    recommendation: 'Consider alternative acid-reducing medication.',
  },
  {
    medications: ['Fluoxetine', 'Tramadol'],
    severity: 'high',
    description: 'Risk of serotonin syndrome and reduced seizure threshold.',
    recommendation: 'Avoid combination. Consult your doctor.',
  },
  {
    medications: ['Ciprofloxacin', 'Antacids'],
    severity: 'moderate',
    description: 'Antacids reduce absorption of Ciprofloxacin.',
    recommendation: 'Take Ciprofloxacin 2 hours before or 6 hours after antacids.',
  },
  {
    medications: ['Digoxin', 'Amiodarone'],
    severity: 'high',
    description: 'Amiodarone increases Digoxin levels, risking toxicity.',
    recommendation: 'Reduce Digoxin dose by 50%. Monitor closely.',
  },
  {
    medications: ['Levothyroxine', 'Calcium'],
    severity: 'moderate',
    description: 'Calcium supplements reduce absorption of Levothyroxine.',
    recommendation: 'Take Levothyroxine 4 hours apart from calcium.',
  },
  {
    medications: ['Prednisone', 'NSAIDs'],
    severity: 'moderate',
    description: 'Increased risk of gastrointestinal bleeding and ulcers.',
    recommendation: 'Use gastroprotective medication if combination is necessary.',
  },
  {
    medications: ['Prednisone', 'Ibuprofen'],
    severity: 'moderate',
    description: 'Increased risk of gastrointestinal bleeding and ulcers.',
    recommendation: 'Use gastroprotective medication if combination is necessary.',
  },
  {
    medications: ['Sertraline', 'Tramadol'],
    severity: 'high',
    description: 'Risk of serotonin syndrome when combining SSRIs with Tramadol.',
    recommendation: 'Avoid combination. Consult your doctor.',
  },
  {
    medications: ['Escitalopram', 'Tramadol'],
    severity: 'high',
    description: 'Risk of serotonin syndrome when combining SSRIs with Tramadol.',
    recommendation: 'Avoid combination. Consult your doctor.',
  },
  {
    medications: ['Alprazolam', 'Alcohol'],
    severity: 'high',
    description: 'Combination can cause severe drowsiness, respiratory depression, and death.',
    recommendation: 'Never mix benzodiazepines with alcohol.',
  },
  {
    medications: ['Lorazepam', 'Alcohol'],
    severity: 'high',
    description: 'Combination can cause severe drowsiness, respiratory depression, and death.',
    recommendation: 'Never mix benzodiazepines with alcohol.',
  },
  {
    medications: ['Gabapentin', 'Opioids'],
    severity: 'high',
    description: 'Combined use increases risk of respiratory depression.',
    recommendation: 'Use with extreme caution and close monitoring.',
  },
  {
    medications: ['Lisinopril', 'Losartan'],
    severity: 'high',
    description: 'Dual renin-angiotensin blockade increases risk of kidney problems and hyperkalemia.',
    recommendation: 'Generally avoid combination. Close monitoring required.',
  },
  {
    medications: ['Metformin', 'Contrast Dye'],
    severity: 'high',
    description: 'Risk of lactic acidosis if Metformin is continued during contrast procedures.',
    recommendation: 'Stop Metformin before and 48 hours after contrast procedures.',
  },
];

// Normalize medication name for comparison
const normalizeName = (name: string): string => {
  return name.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
};

// Check if two medication names match (including partial matches)
const medicationsMatch = (med1: string, med2: string): boolean => {
  const n1 = normalizeName(med1);
  const n2 = normalizeName(med2);
  return n1.includes(n2) || n2.includes(n1) || n1 === n2;
};

export interface OfflineInteraction extends InteractionInfo {
  med1Name: string;
  med2Name: string;
}

const SEVERITY_ORDER: Record<InteractionInfo['severity'], number> = {
  high: 0,
  moderate: 1,
  low: 2,
};

/**
 * Every pair of active medications that appears in the offline table.
 *
 * Only active medications are considered — the RxNorm check already works that
 * way, and a stopped medication raising a warning the other source cannot see
 * was part of why the two panels disagreed.
 */
export function findOfflineInteractions(medications: Medication[]): OfflineInteraction[] {
  const active = medications.filter((m) => m.is_active);
  const found: OfflineInteraction[] = [];

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const med1 = active[i];
      const med2 = active[j];

      for (const interaction of INTERACTION_DATABASE) {
        const [dbMed1, dbMed2] = interaction.medications;
        if (
          (medicationsMatch(med1.name, dbMed1) && medicationsMatch(med2.name, dbMed2)) ||
          (medicationsMatch(med1.name, dbMed2) && medicationsMatch(med2.name, dbMed1))
        ) {
          found.push({ ...interaction, med1Name: med1.name, med2Name: med2.name });
        }
      }
    }
  }

  return found.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
