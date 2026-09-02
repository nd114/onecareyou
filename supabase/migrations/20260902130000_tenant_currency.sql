-- Currency belongs to the tenant, and the default is international.
--
-- The invoice table shipped with a NGN default, which was a mistake of
-- perspective rather than of code: the platform is not a Nigerian product with
-- international ambitions, it is an international product that happens to have
-- started in Nigeria. A clinic in Accra, Nairobi, London or Houston should not
-- have to work around a default that assumes otherwise.
--
-- So USD is the neutral default and every tenant sets its own. An invoice still
-- stores its own currency — a practice that changes currency must not restate
-- the value of bills it already issued.

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'USD';

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_default_currency_check,
  ADD CONSTRAINT practices_default_currency_check
    CHECK (default_currency ~ '^[A-Z]{3}$');

COMMENT ON COLUMN public.practices.default_currency IS
  'ISO 4217 code this tenant bills in. Seeds the currency on new invoices; an existing '
  'invoice keeps the currency it was raised in, because changing it would restate what '
  'somebody was already asked to pay.';

ALTER TABLE public.fhir_invoices
  ALTER COLUMN currency SET DEFAULT 'USD';

COMMENT ON COLUMN public.fhir_invoices.currency IS
  'ISO 4217, copied from the practice at issue time and then fixed. Amounts elsewhere on '
  'this row are minor units of this currency — cents, kobo, pence.';

-- Minor units are not always hundredths. JPY has none, KWD has three. A caller
-- that assumes 100 will be wrong for a tenant billing in yen, so the exponent
-- is available from the database rather than guessed at each call site.
CREATE OR REPLACE FUNCTION public.currency_minor_units(_currency text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(_currency)
    -- No minor unit at all.
    WHEN 'JPY' THEN 0 WHEN 'KRW' THEN 0 WHEN 'VND' THEN 0
    WHEN 'CLP' THEN 0 WHEN 'ISK' THEN 0 WHEN 'UGX' THEN 0
    WHEN 'RWF' THEN 0 WHEN 'XOF' THEN 0 WHEN 'XAF' THEN 0
    -- Three digits.
    WHEN 'KWD' THEN 3 WHEN 'BHD' THEN 3 WHEN 'OMR' THEN 3
    WHEN 'JOD' THEN 3 WHEN 'TND' THEN 3
    ELSE 2
  END;
$$;

COMMENT ON FUNCTION public.currency_minor_units(text) IS
  'Digits after the decimal point for an ISO 4217 code. Not always two: JPY has none, KWD '
  'has three. Callers dividing by 100 are wrong for those tenants.';
