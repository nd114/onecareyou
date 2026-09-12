import { Loader2, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminDigest } from '@/hooks/useAdminToday';
import { formatDayTime } from '@/lib/format-date';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Morning brief settings: on or off, what hour, and a copy on demand. */
export function AdminDigestCard() {
  const { preference, isLoading, save, isSaving, sendTest, isSending } = useAdminDigest();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Morning brief
        </CardTitle>
        <CardDescription>
          One email a day: yesterday's movement, what needs you, and anything that broke.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="digest-enabled" className="text-sm font-normal">
                Send it to me
              </Label>
              <Switch
                id="digest-enabled"
                checked={preference.enabled}
                disabled={isSaving}
                onCheckedChange={(enabled) => save({ enabled })}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="digest-hour" className="text-sm font-normal">
                Send hour (UTC)
              </Label>
              <Select
                value={String(preference.send_hour)}
                onValueChange={(v) => save({ send_hour: Number(v) })}
              >
                <SelectTrigger id="digest-hour" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, '0')}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                {preference.last_sent_at
                  ? `Last sent ${formatDayTime(preference.last_sent_at)}`
                  : 'Not sent yet'}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={isSending}
                onClick={() => sendTest()}
              >
                {isSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send me one now
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
