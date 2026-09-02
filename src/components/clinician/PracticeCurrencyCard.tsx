import { useEffect, useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePractice } from "@/hooks/usePractice";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DEFAULT_CURRENCY, formatMoney, toMinorUnits, type CurrencyCode } from "@/lib/fhir/invoice";

/**
 * The currency this practice bills in.
 *
 * A short list of common ones rather than all 180: a picker nobody can scroll
 * is worse than one that covers the cases and takes a request for the rest.
 * Names are the currency's, not a country's, because several of these are used
 * in more than one.
 */
const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "Pound Sterling" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "AED", label: "UAE Dirham" },
  { code: "SAR", label: "Saudi Riyal" },
  { code: "INR", label: "Indian Rupee" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "ZAR", label: "South African Rand" },
  { code: "NGN", label: "Nigerian Naira" },
  { code: "GHS", label: "Ghanaian Cedi" },
  { code: "KES", label: "Kenyan Shilling" },
  { code: "EGP", label: "Egyptian Pound" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "BRL", label: "Brazilian Real" },
];

export function PracticeCurrencyCard() {
  const { currentPractice } = usePractice();
  const practiceId = currentPractice?.id;
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [saved, setSaved] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!practiceId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("practices")
        .select("default_currency")
        .eq("id", practiceId)
        .maybeSingle();
      if (cancelled) return;
      const value = (data?.default_currency as CurrencyCode) ?? DEFAULT_CURRENCY;
      setCurrency(value);
      setSaved(value);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [practiceId]);

  const save = async () => {
    if (!practiceId) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("practices")
      .update({ default_currency: currency })
      .eq("id", practiceId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSaved(currency);
    toast.success("Billing currency updated");
  };

  if (!practiceId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" /> Billing currency
        </CardTitle>
        <CardDescription>
          New invoices are raised in this currency. Invoices already issued keep the currency
          they were raised in — changing this never restates what someone was asked to pay.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Currency</Label>
          <Select
            value={currency}
            onValueChange={(v) => setCurrency(v as CurrencyCode)}
            disabled={loading}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground">
          An invoice for one thousand shows as{" "}
          <span className="font-medium text-foreground">
            {formatMoney(toMinorUnits(1000, currency), currency)}
          </span>
          .
        </p>

        <Button size="sm" onClick={save} disabled={saving || loading || currency === saved}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
