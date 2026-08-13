import { useEffect, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePractice } from '@/hooks/usePractice';
import { usePracticeContact, type PracticeContactInput } from '@/hooks/usePracticeContact';

const FIELDS: Array<[keyof PracticeContactInput, string, string?]> = [
  ['address', 'Street address'],
  ['city', 'City'],
  ['state', 'State / region'],
  ['zip_code', 'Postcode'],
  ['country', 'Country'],
  ['phone', 'Phone'],
  ['email', 'Contact email', 'email'],
  ['npi', 'NPI / licence number'],
];

const EMPTY = {
  address: '',
  city: '',
  state: '',
  zip_code: '',
  country: '',
  phone: '',
  email: '',
  npi: '',
};

/**
 * The tenant enters their own contact and address details during set-up and can
 * update them any time. This row is what OneCare and patients both read.
 */
export function PracticeContactCard() {
  const { currentPractice, currentMembership } = usePractice();
  const { contact, isLoading, save, isSaving } = usePracticeContact(currentPractice?.id);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!contact) return;
    setForm({
      address: contact.address ?? '',
      city: contact.city ?? '',
      state: contact.state ?? '',
      zip_code: contact.zip_code ?? '',
      country: contact.country ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      npi: contact.npi ?? '',
    });
  }, [contact]);

  if (!currentPractice) return null;

  const canEdit =
    currentMembership?.role === 'owner' || currentMembership?.role === 'admin';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Contact and address
        </CardTitle>
        <CardDescription>
          {canEdit
            ? 'Set this up once and keep it current. These details appear on your patient-facing surfaces and in your OneCare account record.'
            : 'Only an owner or admin of this practice can change these details.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map(([key, label, type]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`practice-${key}`}>{label}</Label>
                  <Input
                    id={`practice-${key}`}
                    type={type ?? 'text'}
                    value={form[key]}
                    disabled={!canEdit}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            {canEdit && (
              <Button size="sm" disabled={isSaving} onClick={() => save(form)}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save details
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
