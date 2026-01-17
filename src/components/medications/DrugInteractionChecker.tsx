import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, CheckCircle, Info, Shield, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Medication } from '@/hooks/useMedications';
import { useDrugInteractions, DrugInteraction } from '@/hooks/useDrugInteractions';

interface DrugInteractionCheckerProps {
  medications: Medication[];
  compact?: boolean;
}

export function DrugInteractionChecker({ medications, compact = false }: DrugInteractionCheckerProps) {
  const { getInteractions, isLoading, error } = useDrugInteractions();
  const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
  const [hasChecked, setHasChecked] = useState(false);

  // Get active medication names
  const activeMedNames = useMemo(() => 
    medications.filter(m => m.is_active).map(m => m.name),
    [medications]
  );

  // Check interactions when medications change
  useEffect(() => {
    if (activeMedNames.length >= 2) {
      checkInteractions();
    } else {
      setInteractions([]);
      setHasChecked(false);
    }
  }, [activeMedNames.join(',')]);

  const checkInteractions = async () => {
    const results = await getInteractions(activeMedNames);
    setInteractions(results);
    setHasChecked(true);
  };

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

  if (activeMedNames.length < 2) {
    if (compact) return null;
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Add at least 2 active medications to check for interactions
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground">Checking NIH RxNorm database...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="text-destructive">{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={checkInteractions}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (hasChecked && interactions.length === 0) {
    if (compact) {
      return (
        <div className="flex items-center gap-2 text-status-success">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">No interactions found (NIH RxNorm)</span>
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
            <div className="flex-1">
              <h4 className="font-semibold text-status-success">No Interactions Found</h4>
              <p className="text-sm text-muted-foreground">
                Your {activeMedNames.length} medications appear safe to take together based on NIH RxNorm database.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={checkInteractions}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Recheck
            </Button>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-severity-high" />
            <CardTitle className="text-lg">Drug Interactions</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={checkInteractions}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Recheck
          </Button>
        </div>
        <CardDescription>
          Found {interactions.length} potential interaction{interactions.length !== 1 ? 's' : ''} from NIH RxNorm
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
        <div className="space-y-4 max-h-[500px] overflow-y-auto">
          {interactions.map((interaction, index) => {
            const Icon = severityIcons[interaction.severity];
            return (
              <div
                key={index}
                className={`p-4 rounded-xl border ${severityColors[interaction.severity]}`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-background/80 shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold">{interaction.drug1}</span>
                      <span className="text-muted-foreground">+</span>
                      <span className="font-semibold">{interaction.drug2}</span>
                    </div>
                    <p className="text-sm mb-2">{interaction.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Source: {interaction.source}</span>
                      {interaction.sourceUrl && (
                        <a 
                          href={interaction.sourceUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Learn more
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        <p className="text-xs text-muted-foreground mt-4 pt-4 border-t">
          ⚠️ Data provided by NIH RxNorm. This is not a complete list of all possible interactions. 
          Always consult your healthcare provider or pharmacist for personalized advice.
        </p>
      </CardContent>
    </Card>
  );
}
