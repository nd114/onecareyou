import { useMemo } from 'react';
import { AlertTriangle, CheckCircle, Info, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Medication } from '@/hooks/useMedications';

interface InteractionInfo {
  medications: [string, string];
  severity: 'high' | 'moderate' | 'low';
  description: string;
  recommendation: string;
}

// Common drug interactions database (simplified)
const INTERACTION_DATABASE: InteractionInfo[] = [
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

interface MedicationInteractionCheckerProps {
  medications: Medication[];
  compact?: boolean;
}

export function MedicationInteractionChecker({ medications, compact = false }: MedicationInteractionCheckerProps) {
  const interactions = useMemo(() => {
    const found: (InteractionInfo & { med1Name: string; med2Name: string })[] = [];
    
    // Check each pair of medications
    for (let i = 0; i < medications.length; i++) {
      for (let j = i + 1; j < medications.length; j++) {
        const med1 = medications[i];
        const med2 = medications[j];
        
        // Check against database
        for (const interaction of INTERACTION_DATABASE) {
          const [dbMed1, dbMed2] = interaction.medications;
          
          if (
            (medicationsMatch(med1.name, dbMed1) && medicationsMatch(med2.name, dbMed2)) ||
            (medicationsMatch(med1.name, dbMed2) && medicationsMatch(med2.name, dbMed1))
          ) {
            found.push({
              ...interaction,
              med1Name: med1.name,
              med2Name: med2.name,
            });
          }
        }
      }
    }
    
    // Sort by severity
    return found.sort((a, b) => {
      const order = { high: 0, moderate: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [medications]);

  const severityCounts = useMemo(() => ({
    high: interactions.filter(i => i.severity === 'high').length,
    moderate: interactions.filter(i => i.severity === 'moderate').length,
    low: interactions.filter(i => i.severity === 'low').length,
  }), [interactions]);

  const severityColors = {
    high: 'bg-severity-high/10 text-severity-high border-severity-high/20',
    moderate: 'bg-severity-moderate/10 text-severity-moderate border-severity-moderate/20',
    low: 'bg-severity-low/10 text-severity-low border-severity-low/20',
  };

  const severityIcons = {
    high: AlertTriangle,
    moderate: Info,
    low: Shield,
  };

  if (medications.length < 2) {
    if (compact) return null;
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Add at least 2 medications to check for interactions
          </p>
        </CardContent>
      </Card>
    );
  }

  if (interactions.length === 0) {
    if (compact) {
      return (
        <div className="flex items-center gap-2 text-status-success">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">No interactions detected</span>
        </div>
      );
    }
    
    return (
      <Card className="border-status-success/30 bg-status-success/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-status-success/10 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-status-success" />
            </div>
            <div>
              <h4 className="font-semibold text-status-success">No Interactions Found</h4>
              <p className="text-sm text-muted-foreground">
                Your {medications.length} medications appear safe to take together based on our database.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {severityCounts.high > 0 && (
          <Badge variant="outline" className={severityColors.high}>
            <AlertTriangle className="h-3 w-3 mr-1" />
            {severityCounts.high} high-risk
          </Badge>
        )}
        {severityCounts.moderate > 0 && (
          <Badge variant="outline" className={severityColors.moderate}>
            <Info className="h-3 w-3 mr-1" />
            {severityCounts.moderate} moderate
          </Badge>
        )}
        {severityCounts.low > 0 && (
          <Badge variant="outline" className={severityColors.low}>
            <Shield className="h-3 w-3 mr-1" />
            {severityCounts.low} low-risk
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-severity-high" />
          <CardTitle className="text-lg">Drug Interactions</CardTitle>
        </div>
        <CardDescription>
          Found {interactions.length} potential interaction{interactions.length !== 1 ? 's' : ''} between your medications
        </CardDescription>
        <div className="flex gap-2 pt-2">
          {severityCounts.high > 0 && (
            <Badge variant="outline" className={severityColors.high}>
              {severityCounts.high} High Risk
            </Badge>
          )}
          {severityCounts.moderate > 0 && (
            <Badge variant="outline" className={severityColors.moderate}>
              {severityCounts.moderate} Moderate
            </Badge>
          )}
          {severityCounts.low > 0 && (
            <Badge variant="outline" className={severityColors.low}>
              {severityCounts.low} Low Risk
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {interactions.map((interaction, index) => {
            const Icon = severityIcons[interaction.severity];
            return (
              <div
                key={index}
                className={`p-4 rounded-xl border ${severityColors[interaction.severity]}`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-background/80">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{interaction.med1Name}</span>
                      <span className="text-muted-foreground">+</span>
                      <span className="font-semibold">{interaction.med2Name}</span>
                    </div>
                    <p className="text-sm mb-2">{interaction.description}</p>
                    <p className="text-sm font-medium">
                      <span className="text-muted-foreground">Recommendation: </span>
                      {interaction.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        <p className="text-xs text-muted-foreground mt-4 pt-4 border-t">
          ⚠️ This is not a complete list of all possible interactions. Always consult your healthcare provider or pharmacist for personalized advice.
        </p>
      </CardContent>
    </Card>
  );
}
