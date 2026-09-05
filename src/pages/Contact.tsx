import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

import { SEOHead } from '@/components/seo/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MarketingHero } from '@/components/home/marketing';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { edgeFunctionError } from '@/lib/edge-function-error';
import { describeSubmissionError } from '@/lib/submission-errors';
import {
  validateContactDraft,
  firstContactError,
  type ContactField,
} from '@/lib/contact-form';

/**
 * The contact form.
 *
 * It used to wait 1.5 seconds and tell the sender their message had been sent.
 * Nothing was sent and nothing was stored. It now writes a row and asks the
 * notify function to email both sides, following the same shape as the
 * enterprise inquiry form: the client writes, the function reads the row back
 * with the service role and sends from what was actually stored.
 */

/** Must match the inquiry types the database will accept. */
const INQUIRY_TYPES = [
  { value: 'general', label: 'General enquiry' },
  { value: 'support', label: 'Technical support' },
  { value: 'billing', label: 'Billing question' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'other', label: 'Other' },
] as const;

const EMPTY = {
  name: '',
  email: '',
  inquiryType: 'general',
  subject: '',
  message: '',
};

const Contact = () => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [formData, setFormData] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const found = validateContactDraft(formData, INQUIRY_TYPES.map((t) => t.value));
    setErrors(found);
    const first = firstContactError(found);
    if (first) {
      document.getElementById(first === 'inquiryType' ? 'inquiry-type' : first)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // The function writes the row; the browser no longer can. Inserting
      // here and asking the function to email it made the pair an open mail
      // relay — anybody could store any text addressed to any inbox and then
      // ask us to send it from our own domain.
      const { error } = await supabase.functions.invoke('notify-contact-submission', {
        body: {
          contact_name: formData.name.trim(),
          contact_email: formData.email.trim(),
          inquiry_type: formData.inquiryType,
          subject: formData.subject.trim(),
          message: formData.message.trim(),
        },
      });
      if (error) {
        // The reason the function gave, not "non-2xx status code" — a rate
        // limit and a bad address are different problems and the sender can
        // act on both.
        const { message } = await edgeFunctionError(error);
        throw new Error(message);
      }

      setSent(true);
      setFormData(EMPTY);
      setErrors({});
    } catch (error) {
      console.error('Error sending contact message:', error);
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'We could not send that. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SEOHead
        title="Contact OneCare"
        description="Questions about your record, your account, or working with us. Reach the OneCare team directly."
        canonical="/contact"
      />
      <Header />

      <MarketingHero
        eyebrow="Talk to us"
        title={
          <>
            A real person
            <br />
            <span className="text-primary">reads these</span>
            <span className="text-[hsl(var(--gold))]">.</span>
          </>
        }
        lede="Questions about your record, trouble getting in, or a conversation about bringing a practice across. Tell us which and we will route it properly."
      />

      <section className="border-t border-primary/10 bg-[hsl(var(--secondary))]/40">
        <div className="mx-auto max-w-2xl px-6 py-16 sm:py-20">
          {sent ? (
            <Panel>
              <PanelHeader eyebrow="Message sent" />
              <PanelBody className="py-10 text-center">
                <p className="font-display text-xl leading-snug">
                  It is with us, and a copy is in your inbox.
                </p>
                <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                  If your question is clinical and urgent, please contact your care provider
                  directly rather than waiting on a reply here.
                </p>
                <Button variant="outline" className="mt-7" onClick={() => setSent(false)}>
                  Send another
                </Button>
              </PanelBody>
            </Panel>
          ) : (
            <Panel>
              <PanelHeader
                eyebrow="Send a message"
                description="We answer in the order they arrive."
              />
              <PanelBody className="py-6">
                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Your name</Label>
                      <Input
                        id="name"
                        placeholder="Alex Moreau"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        maxLength={200}
                        aria-invalid={!!errors.name}
                        aria-describedby={errors.name ? 'name-error' : undefined}
                        className={errors.name ? 'border-destructive' : undefined}
                      />
                      {errors.name && (
                        <p id="name-error" className="text-sm text-destructive">
                          {errors.name}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="alex@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        maxLength={320}
                        aria-invalid={!!errors.email}
                        aria-describedby={errors.email ? 'email-error' : undefined}
                        className={errors.email ? 'border-destructive' : undefined}
                      />
                      {errors.email && (
                        <p id="email-error" className="text-sm text-destructive">
                          {errors.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="inquiry-type">What is it about</Label>
                    <Select
                      value={formData.inquiryType}
                      onValueChange={(value) => setFormData({ ...formData, inquiryType: value })}
                    >
                      <SelectTrigger
                        id="inquiry-type"
                        aria-invalid={!!errors.inquiryType}
                        aria-describedby={errors.inquiryType ? 'inquiry-type-error' : undefined}
                        className={errors.inquiryType ? 'border-destructive' : undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INQUIRY_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.inquiryType && (
                      <p id="inquiry-type-error" className="text-sm text-destructive">
                        {errors.inquiryType}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="In one line"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      maxLength={300}
                      aria-invalid={!!errors.subject}
                      aria-describedby={errors.subject ? 'subject-error' : undefined}
                      className={errors.subject ? 'border-destructive' : undefined}
                    />
                    {errors.subject && (
                      <p id="subject-error" className="text-sm text-destructive">
                        {errors.subject}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="What is going on?"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      rows={6}
                      maxLength={10000}
                      aria-invalid={!!errors.message}
                      aria-describedby={errors.message ? 'message-error' : undefined}
                      className={errors.message ? 'border-destructive' : undefined}
                    />
                    {errors.message && (
                      <p id="message-error" className="text-sm text-destructive">
                        {errors.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full border-0 gradient-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send message
                      </>
                    )}
                  </Button>

                  <p className="text-center text-xs leading-relaxed text-muted-foreground">
                    Do not put clinical details you would not want in an email here. For anything
                    urgent, contact your care provider. By sending you agree to our{' '}
                    <Link to="/privacy" className="underline hover:text-foreground">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </form>
              </PanelBody>
            </Panel>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Contact;
