import { useState } from 'react';
import { Loader2, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AddonKind, PracticeAccountOverview, useAddonCheckout } from '@/hooks/usePracticeAccount';
import { AddonNotConfigured } from './shared';

type Checkout = ReturnType<typeof useAddonCheckout>;

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function AccountAddonsTab({ overview, checkout }: { overview: PracticeAccountOverview; checkout: Checkout }) {
  const { clinician, staff } = overview.seats;

  return (
    <div className="space-y-4">
      {checkout.notConfigured && <AddonNotConfigured />}

      <div className="grid gap-3 lg:grid-cols-3">
        <AddonCard
          kind="clinician_seat"
          title="Extra clinician seat"
          description="For somebody who sees patients and writes clinical records, including an owner or admin who also practises."
          price={clinician.addon_price_usd === null ? 'Price shown at checkout' : `${usd(clinician.addon_price_usd)} per seat`}
          status={`${clinician.used} of ${clinician.limit === null ? 'no limit' : clinician.limit} in use`}
          quantityLabel="Seats"
          cta="Add clinician seats"
          checkout={checkout}
        />
        <AddonCard
          kind="staff_seat"
          title="Non-clinical staff seat"
          description="Every staff member needs a seat: front desk, billing and other roles that do not see clinical records."
          price={staff.price_usd === null ? 'Price shown at checkout' : `${usd(staff.price_usd)} per seat`}
          status={`${staff.used} of ${staff.purchased} in use`}
          quantityLabel="Seats"
          cta="Add staff seats"
          checkout={checkout}
        />
        <AddonCard
          kind="scribe_pack"
          title="Scribe minutes pack"
          description="More minutes for the shared scribe pool when the practice runs short."
          price="Price shown at checkout"
          status={`${Math.round(overview.scribe.pack_minutes_remaining).toLocaleString('en-US')} min left from packs`}
          quantityLabel="Packs"
          cta="Buy minutes packs"
          checkout={checkout}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Support</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Priority support applies to Clinic and above. Other plans use the in-app assistant, the guides and
          email.
        </CardContent>
      </Card>
    </div>
  );
}

function AddonCard({
  kind,
  title,
  description,
  price,
  status,
  quantityLabel,
  cta,
  checkout,
}: {
  kind: AddonKind;
  title: string;
  description: string;
  price: string;
  status: string;
  quantityLabel: string;
  cta: string;
  checkout: Checkout;
}) {
  const [quantity, setQuantity] = useState('1');
  const parsed = Number(quantity);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 100;
  const busy = checkout.pending === kind;

  return (
    <Card data-testid={`addon-${kind}`} className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto space-y-3">
        <div>
          <p className="text-sm font-semibold">{price}</p>
          <p className="text-xs text-muted-foreground">{status}</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`qty-${kind}`} className="text-xs">
              {quantityLabel}
            </Label>
            <Input
              id={`qty-${kind}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-9 w-20"
            />
          </div>
          <Button
            size="sm"
            className="h-9 flex-1"
            disabled={!valid || checkout.pending !== null}
            onClick={() => checkout.start(kind, parsed)}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
            {cta}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
