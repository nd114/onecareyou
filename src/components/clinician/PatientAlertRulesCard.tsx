import { Bell, BellOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AlertRule } from '@/hooks/useAlertRules';

const VITAL_LABELS: Record<string, string> = {
  blood_pressure: 'Blood pressure',
  systolic: 'Systolic',
  diastolic: 'Diastolic',
  heart_rate: 'Heart rate',
  glucose: 'Glucose',
  weight: 'Weight',
  temperature: 'Temperature',
  oxygen_saturation: 'Oxygen saturation',
};

const METHOD_LABELS: Record<string, string> = {
  push: 'Push',
  email: 'Email',
  sms: 'SMS',
};

function describe(rule: AlertRule): string {
  const vital = VITAL_LABELS[rule.vital_type] ?? rule.vital_type.replace(/_/g, ' ');
  if (rule.condition === 'outside_range' && rule.threshold_secondary !== null) {
    return `${vital} outside ${rule.threshold_value}–${rule.threshold_secondary}`;
  }
  return `${vital} ${rule.condition === 'above' ? 'above' : 'below'} ${rule.threshold_value}`;
}

/**
 * The alert rules this clinician has set for this patient.
 *
 * The patient record previously showed a count of active alerts and nothing
 * else, so a clinician looking at someone could see that three rules existed
 * without being able to see what they were — they had to leave for the alert
 * rules page to find out. A threshold is part of how you are managing a
 * patient; it belongs on their record.
 */
export function PatientAlertRulesCard({
  rules,
  action,
}: {
  rules: AlertRule[];
  action?: React.ReactNode;
}) {
  const active = rules.filter((r) => r.is_active);
  const paused = rules.filter((r) => !r.is_active);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-amber-500" />
              Alerts for this patient
            </CardTitle>
            <CardDescription>
              {active.length === 0
                ? 'No thresholds set — you will not be told when their readings move.'
                : `You are told when ${active.length === 1 ? 'this happens' : 'any of these happen'}.`}
            </CardDescription>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? null : (
          <ul className="space-y-2">
            {[...active, ...paused].map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {rule.is_active ? (
                    <Bell className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  ) : (
                    <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={`text-sm truncate ${rule.is_active ? '' : 'text-muted-foreground line-through'}`}
                  >
                    {describe(rule)}
                  </span>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {METHOD_LABELS[rule.alert_method] ?? rule.alert_method}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
