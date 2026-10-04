import { useState } from 'react';
import { Handshake, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRequestPartnership, type PracticeAccountOverview } from '@/hooks/usePracticeAccount';

export function AccountPartnershipTab({ overview }: { overview: PracticeAccountOverview }) {
  const { partner } = overview;
  const request = useRequestPartnership(overview.practice.id);
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const ready = contact.trim().length > 0 && message.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Handshake className="h-4 w-4 text-primary" />
          Partnership
          {partner.status === 'requested' && <Badge variant="secondary">Requested</Badge>}
          {partner.status === 'active' && <Badge>Active</Badge>}
        </CardTitle>
        <CardDescription>
          The partner programme is for institutions that want to bring their patients onto OneCare under a
          separate agreement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {partner.status === 'active' && (
          <div className="space-y-3" data-testid="partner-active">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Revenue share</p>
                <p className="mt-0.5 text-xl font-semibold">
                  {partner.revenue_share_pct === null ? 'Per your agreement' : `${partner.revenue_share_pct}%`}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Referral slug</p>
                <p className="mt-0.5 break-all font-mono text-sm">{partner.referral_slug ?? 'Not assigned yet'}</p>
              </div>
            </div>
            <p className="text-muted-foreground">
              The sign-up link is shared by our team once the agreement is signed.
            </p>
          </div>
        )}

        {partner.status === 'requested' && (
          <p className="text-muted-foreground" data-testid="partner-requested">
            We have your request and will be in touch. The sign-up link is shared by our team once the
            agreement is signed.
          </p>
        )}

        {partner.status === 'none' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) request.mutate({ contact: contact.trim(), message: message.trim() });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="partner-contact">How should we contact you?</Label>
              <Input
                id="partner-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Name and email or phone"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="partner-message">Tell us about your institution</Label>
              <Textarea
                id="partner-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Who you are, roughly how many patients, and what you would like to do together."
              />
            </div>
            <Button type="submit" size="sm" disabled={!ready || request.isPending}>
              {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Request partnership
            </Button>
            <p className="text-xs text-muted-foreground">
              Sending this starts a conversation; it does not change your plan or your data.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
