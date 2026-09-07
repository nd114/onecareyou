import { Lock } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import type {
  NotificationAudience,
  NotificationChannel,
} from '../../../supabase/functions/_shared/notification-catalogue';

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  email: 'Email',
  push: 'On this device',
  in_app: 'In the app',
};

/**
 * Notification settings, per thing rather than per channel.
 *
 * What this replaces was two switches — "email notifications", "push
 * notifications" — that between them governed nothing: no sender read the
 * first, and the reminder path checked the browser's permission instead of the
 * second. A person could turn both off and receive exactly what they had
 * before.
 *
 * The list is built from the catalogue, which only contains categories
 * something actually sends. Categories that cannot be switched off are shown
 * rather than hidden, with the reason: a clinician who could silence their own
 * threshold alerts by accident is worse served by a shorter list.
 */
export function NotificationPreferences({ audience }: { audience: NotificationAudience }) {
  const { categories, isEnabled, setEnabled, isSaving, isLoading } =
    useNotificationPreferences(audience);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {categories.map((category) => (
        <div key={category.key} className="rounded-lg border p-4 space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label className="text-base font-medium">{category.label}</Label>
              {category.mandatory && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Always on
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{category.description}</p>
            {category.mandatory && category.mandatoryReason && (
              <p className="text-xs text-muted-foreground">{category.mandatoryReason}</p>
            )}
          </div>

          <div className="space-y-2">
            {category.channels.map((channel) => (
              <div key={channel} className="flex items-center justify-between gap-4">
                <Label
                  htmlFor={`${category.key}-${channel}`}
                  className="text-sm font-normal text-muted-foreground"
                >
                  {CHANNEL_LABEL[channel]}
                </Label>
                <Switch
                  id={`${category.key}-${channel}`}
                  checked={isEnabled(category.key, channel)}
                  disabled={category.mandatory || isSaving}
                  onCheckedChange={(next) =>
                    void setEnabled({ category: category.key, channel, enabled: next })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
