import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  Loader2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { BRAND } from '@/lib/brand-constants';
import { BETA } from '@/lib/beta-config';
import { NDA_VERSION } from '@/lib/beta-nda';
import { NdaBody } from '@/pages/BetaNDA';
import { trackBetaEvent } from '@/lib/beta-analytics';
import { supabase } from '@/integrations/supabase/client';

type SlotMap = Record<string, { start: string }[]>;

interface Confirmation {
  start: string;
  meetingUrl?: string | null;
  signatureId: string;
  signedAt: string;
}

const FUNCTIONS_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

export default function BetaBooking() {
  const { toast } = useToast();
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );

  const [slots, setSlots] = useState<SlotMap>({});
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [clinicianRole, setClinicianRole] = useState('');
  const [practiceName, setPracticeName] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');

  const [signedName, setSignedName] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [ndaOpen, setNdaOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    void trackBetaEvent('beta_booking_page_view', {}, 'beta-booking');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${FUNCTIONS_URL}/beta-slots?timeZone=${encodeURIComponent(timeZone)}&days=21`,
          {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not load available times');
        if (cancelled) return;
        const data: SlotMap = json.slots ?? {};
        setSlots(data);
        const firstDay = Object.keys(data).find((d) => (data[d]?.length ?? 0) > 0) ?? null;
        setSelectedDay(firstDay);
      } catch (e) {
        if (!cancelled) setSlotError((e as Error).message);
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeZone]);

  const days = Object.keys(slots).filter((d) => (slots[d]?.length ?? 0) > 0);
  const detailsValid = fullName.trim().length > 1 && /\S+@\S+\.\S+/.test(email);
  const signatureValid =
    affirmed &&
    signedName.trim().toLowerCase().replace(/\s+/g, ' ') ===
      fullName.trim().toLowerCase().replace(/\s+/g, ' ');
  const canSubmit = !!selectedSlot && detailsValid && signatureValid && !submitting;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatDay = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  const handleSubmit = async () => {
    if (!canSubmit || !selectedSlot) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('beta-book', {
        body: {
          fullName: fullName.trim(),
          email: email.trim(),
          clinicianRole: clinicianRole.trim() || undefined,
          practiceName: practiceName.trim() || undefined,
          country: country.trim() || undefined,
          slotStart: selectedSlot,
          timeZone,
          ndaVersion: NDA_VERSION,
          signedName: signedName.trim(),
          affirmed: true,
          notes: notes.trim() || undefined,
        },
      });

      if (error) {
        const details =
          'context' in error && error.context
            ? await (error.context as Response).text()
            : error.message;
        let message = 'We could not confirm that slot. Please try another time.';
        try {
          const parsed = JSON.parse(details);
          if (parsed?.error) message = parsed.error;
        } catch {
          /* keep default */
        }
        throw new Error(message);
      }

      setConfirmation(data as Confirmation);
      void trackBetaEvent('beta_nda_signed_and_booked', {}, 'beta-booking');
    } catch (e) {
      toast({
        title: 'Booking not completed',
        description: (e as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SEOHead title="Beta call confirmed" noIndex />
        <div className="mx-auto max-w-2xl px-6 py-16">
          <CheckCircle2 className="h-10 w-10 text-[hsl(var(--gold))] mb-6" strokeWidth={1.5} />
          <h1 className="font-serif-display text-3xl font-bold text-primary mb-4">
            You're booked in.
          </h1>
          <p className="text-foreground/75 mb-6">
            {new Date(confirmation.start).toLocaleString('en-GB', {
              timeZone,
              dateStyle: 'full',
              timeStyle: 'short',
            })}{' '}
            ({timeZone})
          </p>
          <div className="border border-primary/15 p-6 space-y-2 text-sm text-foreground/75">
            <p>
              A calendar invite and confirmation email are on their way to{' '}
              <strong className="text-foreground">{email}</strong>, with reminders 24
              hours and 1 hour before the call.
            </p>
            {confirmation.meetingUrl && (
              <p>
                Join link:{' '}
                <a
                  href={confirmation.meetingUrl}
                  className="text-primary underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {confirmation.meetingUrl}
                </a>
              </p>
            )}
            <p className="pt-2 border-t border-primary/10">
              NDA v{NDA_VERSION} signed as <strong>{signedName}</strong> on{' '}
              {new Date(confirmation.signedAt).toUTCString()}. Reference{' '}
              <span className="font-mono text-xs">{confirmation.signatureId}</span>.{' '}
              <Link to="/beta/nda" className="underline">
                Read the agreement
              </Link>
              .
            </p>
          </div>
          <a
            href={BETA.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void trackBetaEvent('beta_whatsapp_cta_click', { placement: 'confirmation' })}
            className="mt-8 inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold"
          >
            Join the Beta Community
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Book your beta onboarding call"
        description={`Pick a time for your ${BETA.callLengthMinutes}-minute ${BRAND.name} beta onboarding call and sign the mutual NDA.`}
        noIndex
      />

      <header className="border-b border-primary/10">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/beta" className="inline-flex items-center gap-2 text-sm text-foreground/60 hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Beta programme
          </Link>
          <ThemeToggle />
        </div>
      </header>


      <div className="mx-auto max-w-2xl px-6 py-10 space-y-12">
        <div>
          <span className="eyebrow text-[hsl(var(--gold))]">
            {BETA.callLengthMinutes}-minute onboarding call
          </span>
          <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-primary mt-3">
            Book your onboarding call
          </h1>
          <p className="text-sm text-foreground/70 mt-3">
            Pick a time, add your details, then sign the mutual NDA. Your slot is only
            confirmed once the NDA is signed.
          </p>
        </div>

        {/* 1. SLOTS */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="h-px w-8 bg-[hsl(var(--gold))]" aria-hidden />
            <span className="eyebrow text-[hsl(var(--gold))]">01 · Choose a time</span>
          </div>

          {loadingSlots && (
            <div className="flex items-center gap-2 text-sm text-foreground/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading available times…
            </div>
          )}

          {slotError && (
            <p className="text-sm text-destructive">
              {slotError}. Please refresh, or email {BRAND.emails.hello}.
            </p>
          )}

          {!loadingSlots && !slotError && days.length === 0 && (
            <p className="text-sm text-foreground/70">
              No times are open right now. Email {BRAND.emails.hello} and we'll find a slot.
            </p>
          )}

          {days.length > 0 && (
            <>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {days.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setSelectedDay(day);
                      setSelectedSlot(null);
                    }}
                    className={`shrink-0 px-4 py-3 text-sm border transition-colors ${
                      selectedDay === day
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-primary/20 text-foreground hover:border-primary'
                    }`}
                  >
                    {formatDay(day)}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-4">
                {(selectedDay ? slots[selectedDay] ?? [] : []).map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => setSelectedSlot(slot.start)}
                    className={`py-3 text-sm border transition-colors ${
                      selectedSlot === slot.start
                        ? 'border-[hsl(var(--gold))] bg-[hsl(var(--gold))] text-primary font-semibold'
                        : 'border-primary/20 hover:border-primary'
                    }`}
                  >
                    {formatTime(slot.start)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">Times shown in {timeZone}.</p>
            </>
          )}
        </section>

        {/* 2. DETAILS */}
        <section className={selectedSlot ? '' : 'opacity-50 pointer-events-none'}>
          <div className="flex items-center gap-3 mb-4">
            <span className="h-px w-8 bg-[hsl(var(--gold))]" aria-hidden />
            <span className="eyebrow text-[hsl(var(--gold))]">02 · Your details</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="fullName">Full legal name *</Label>
              <Input
                id="fullName"
                value={fullName}
                maxLength={120}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Jane Evans"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="email">Work email *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                maxLength={255}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@practice.com"
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Input
                id="role"
                value={clinicianRole}
                maxLength={80}
                onChange={(e) => setClinicianRole(e.target.value)}
                placeholder="GP, nurse, cardiologist…"
              />
            </div>
            <div>
              <Label htmlFor="practice">Practice / hospital</Label>
              <Input
                id="practice"
                value={practiceName}
                maxLength={160}
                onChange={(e) => setPracticeName(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={country}
                maxLength={80}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Anything you'd like us to cover?</Label>
              <Textarea
                id="notes"
                value={notes}
                maxLength={1000}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </section>

        {/* 3. NDA */}
        <section className={detailsValid && selectedSlot ? '' : 'opacity-50 pointer-events-none'}>
          <div className="flex items-center gap-3 mb-4">
            <span className="h-px w-8 bg-[hsl(var(--gold))]" aria-hidden />
            <span className="eyebrow text-[hsl(var(--gold))]">03 · Sign the mutual NDA</span>
          </div>

          <div className="border border-primary/15">
            <div className="flex items-center justify-between px-5 py-4 border-b border-primary/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <ShieldCheck className="h-4 w-4" />
                Mutual NDA
              </div>
              <button
                type="button"
                onClick={() => setNdaOpen((o) => !o)}
                className="text-xs underline text-foreground/60 hover:text-primary"
              >
                {ndaOpen ? 'Collapse' : 'Expand'}
              </button>
            </div>

            <ScrollArea className={ndaOpen ? 'h-[420px]' : 'h-52'}>
              <div className="p-5">
                <NdaBody />
              </div>
            </ScrollArea>

            <div className="p-5 border-t border-primary/10 space-y-4">
              <div>
                <Label htmlFor="signedName">Type your full name to sign *</Label>
                <Input
                  id="signedName"
                  value={signedName}
                  maxLength={120}
                  onChange={(e) => setSignedName(e.target.value)}
                  placeholder={fullName || 'Your full legal name'}
                  className="font-serif-display text-lg"
                />
                {signedName && !signatureValid && affirmed && (
                  <p className="text-xs text-destructive mt-1">
                    The signature must match your full name exactly.
                  </p>
                )}
              </div>

              <label className="flex items-start gap-3 text-sm text-foreground/75 cursor-pointer">
                <Checkbox
                  checked={affirmed}
                  onCheckedChange={(v) => setAffirmed(v === true)}
                  className="mt-0.5"
                />
                <span>
                  I have read the agreement above and I intend this typed name to be my
                  electronic signature. I understand my name, the NDA version, the
                  signing timestamp and my IP address will be recorded.
                </span>
              </label>

              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                Your slot is not confirmed until this is signed.
              </p>
            </div>
          </div>
        </section>

        <div className="pb-16">
          <Button
            size="lg"
            className="w-full"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Confirming your slot…
              </>
            ) : (
              <>
                <CalendarCheck className="h-4 w-4 mr-2" /> Sign & confirm booking
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
