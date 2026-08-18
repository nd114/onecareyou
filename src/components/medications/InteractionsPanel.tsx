import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, CheckCircle, Info, Shield, ExternalLink, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Medication } from '@/hooks/useMedications';
import { useDrugInteractions, DrugInteraction } from '@/hooks/useDrugInteractions';
import { findOfflineInteractions } from '@/lib/offline-interactions';
import { buildInteractionVerdict } from '@/lib/interaction-verdict';

/**
 * The single interaction verdict for a patient's medications.
 *
 * This replaces two panels that used to sit one above the other — the NIH
 * RxNorm checker and the offline reference — each rendering its own conclusion.
 * They consulted different sources, so they could and did contradict each
 * other: "No interactions found, your medications appear safe to take
 * together", with a Lisinopril + Metformin warning immediately underneath.
 *
 * Both sources still run. Only one answer is shown, and it errs toward caution:
 * "safe" appears only when both sources were consulted and both were silent.
 */
export function InteractionsPanel({ medications }: { medications: Medication[] }) {
  const { getInteractions, isLoading, error } = useDrugInteractions();
  const [rxnorm, setRxnorm] = useState<DrugInteraction[]>([]);
  const [checked, setChecked] = useState(false);

  const activeMedNames = useMemo(
    () => medications.filter((m) => m.is_active).map((m) => m.name),
    [medications],
  );

  const offline = useMemo(() => findOfflineInteractions(medications), [medications]);

  useEffect(() => {
    if (activeMedNames.length >= 2) {
      void runCheck();
    } else {
      setRxnorm([]);
      setChecked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMedNames.join(',')]);

  const runCheck = async () => {
    const results = await getInteractions(activeMedNames);
    setRxnorm(results);
    setChecked(true);
  };

  const verdict = buildInteractionVerdict({
    rxnorm,
    offline,
    rxnormChecked: checked,
    rxnormFailed: Boolean(error),
  });

  const severityColors = {
    high: 'bg-severity-high/10 text-severity-high border-severity-high/20',
    moderate: 'bg-severity-moderate/10 text-severity-moderate border-severity-moderate/20',
    low: 'bg-severity-low/10 text-severity-low border-severity-low/20',
  } as const;

  const severityIcons = { high: AlertTriangle, moderate: Info, low: Shield } as const;

  if (activeMedNames.length < 2) {
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

  // Only show the spinner while nothing is known. Once the offline table has
  // flagged something, showing it beats showing a spinner.
  if (isLoading && verdict.interactions.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground">Checking for interactions…</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (verdict.isClear) {
    return (
      <Card className="border-status-success/30 bg-status-success/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-status-success/10 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-status-success" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-status-success">No interactions found</h4>
              <p className="text-sm text-muted-foreground">
                Checked your {activeMedNames.length} active medications against the NIH RxNorm
                database and our offline reference. Neither found a known interaction.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={runCheck}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Recheck
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Nothing flagged, but the live lookup failed — say so rather than implying
  // everything is fine. An unreachable database is not a clean result.
  if (verdict.interactions.length === 0) {
    return (
      <Card className="border-severity-moderate/30 bg-severity-moderate/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-severity-moderate/10 flex items-center justify-center">
              <WifiOff className="h-6 w-6 text-severity-moderate" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold">Interaction check incomplete</h4>
              <p className="text-sm text-muted-foreground">
                The NIH RxNorm database could not be reached, so only our smaller offline reference
                was checked. It found nothing — but that is not a full check. Try again when you are
                back online.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={runCheck}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
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
          <Button variant="outline" size="sm" onClick={runCheck}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Recheck
          </Button>
        </div>
        <CardDescription>
          Found {verdict.interactions.length} potential interaction
          {verdict.interactions.length !== 1 ? 's' : ''} across your {activeMedNames.length} active
          medications. Talk to your doctor or pharmacist before changing anything.
        </CardDescription>
        {verdict.isPartial && (
          <p className="text-xs text-severity-moderate pt-1">
            The NIH RxNorm database could not be reached, so this list may be incomplete.
          </p>
        )}
        <div className="flex gap-2 pt-2 flex-wrap">
          {verdict.counts.high > 0 && (
            <Badge variant="outline" className={severityColors.high}>
              {verdict.counts.high} High Risk
            </Badge>
          )}
          {verdict.counts.moderate > 0 && (
            <Badge variant="outline" className={severityColors.moderate}>
              {verdict.counts.moderate} Moderate
            </Badge>
          )}
          {verdict.counts.low > 0 && (
            <Badge variant="outline" className={severityColors.low}>
              {verdict.counts.low} Low Risk
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-[500px] overflow-y-auto">
          {verdict.interactions.map((interaction, index) => {
            const Icon = severityIcons[interaction.severity];
            return (
              <div
                key={`${interaction.drug1}-${interaction.drug2}-${index}`}
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
                    {interaction.recommendation && (
                      <p className="text-sm font-medium mb-2">{interaction.recommendation}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Source: {interaction.sourceLabel}</span>
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
          ⚠️ Checked against the NIH RxNorm database and our offline reference. This is not a
          complete list of all possible interactions. Always consult your healthcare provider or
          pharmacist for personalised advice.
        </p>
      </CardContent>
    </Card>
  );
}
