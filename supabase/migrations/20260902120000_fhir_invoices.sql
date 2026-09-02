-- Billing, as a FHIR Invoice, visible to the person being billed.
--
-- The reason this exists in a patient-controlled product: a bill a patient can
-- only see by asking is the same information asymmetry the rest of the platform
-- exists to remove. Everything below is built so the patient reads their own
-- invoice by default, not on request.
--
-- Shape follows fhir_appointments: queried fields promoted to columns, the whole
-- resource in `resource` jsonb, one module writing both.
--
-- Money is stored in minor units as bigint — kobo, cents — never as a float.
-- 0.1 + 0.2 is not 0.3 in binary floating point, and a rounding error in a
-- balance is a bug somebody has to be refunded for.

CREATE TABLE IF NOT EXISTS public.fhir_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  practice_id  uuid REFERENCES public.practices(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL,
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,

  -- FHIR Invoice.status.
  status text NOT NULL DEFAULT 'draft',

  -- A human reference the patient can quote on the phone. Generated, not typed.
  invoice_number text NOT NULL DEFAULT ('INV-' || upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 8))),

  issued_at timestamptz,
  due_at    timestamptz,

  -- Minor units. NGN is stored in kobo, USD in cents.
  currency      text NOT NULL DEFAULT 'NGN',
  total_minor   bigint NOT NULL DEFAULT 0,
  paid_minor    bigint NOT NULL DEFAULT 0,

  -- What the platform takes, recorded per invoice rather than derived at read
  -- time: the rate can change, and an old invoice must keep the rate it was
  -- raised under. Nothing collects this yet — see docs/billing-and-payments.md.
  platform_fee_minor bigint NOT NULL DEFAULT 0,

  note text,

  resource jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fhir_invoices_status_check CHECK (status IN (
    'draft', 'issued', 'balanced', 'cancelled', 'entered-in-error'
  )),
  -- Money cannot be negative, and nobody can have paid more than they were
  -- asked for. A credit is a separate invoice, not a negative one.
  CONSTRAINT fhir_invoices_amounts_sane CHECK (
    total_minor >= 0 AND paid_minor >= 0 AND platform_fee_minor >= 0
    AND paid_minor <= total_minor
  ),
  CONSTRAINT fhir_invoices_currency_check CHECK (currency ~ '^[A-Z]{3}$')
);

-- Line items. A FHIR Invoice carries lineItem inside the resource; they are a
-- table as well because a practice needs to sum and report on them, and jsonb
-- aggregation for money is a way to get the wrong number quietly.
CREATE TABLE IF NOT EXISTS public.fhir_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.fhir_invoices(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 1,
  description text NOT NULL,
  -- The service code, if the practice uses one. No code is invented here; see
  -- docs/loinc-and-coding-policy.md for why.
  code text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price_minor bigint NOT NULL DEFAULT 0,
  amount_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fhir_invoice_items_sane CHECK (
    quantity > 0 AND unit_price_minor >= 0 AND amount_minor >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_fhir_invoices_patient
  ON public.fhir_invoices (patient_user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_fhir_invoices_practice
  ON public.fhir_invoices (practice_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_fhir_invoice_items_invoice
  ON public.fhir_invoice_items (invoice_id, sequence);

COMMENT ON TABLE public.fhir_invoices IS
  'FHIR R4 Invoice. Amounts are minor units (kobo/cents) as bigint, never floats. The patient '
  'reads their own invoices by default — a bill you can only see by asking is the asymmetry '
  'this product exists to remove.';

COMMENT ON COLUMN public.fhir_invoices.platform_fee_minor IS
  'Recorded per invoice, not derived at read time, so an old invoice keeps the rate it was '
  'raised under. Nothing collects payments yet: see docs/billing-and-payments.md.';

-- ---------------------------------------------------------------------------
-- The total is the database''s job, not the caller''s
--
-- A client that computes its own total will eventually compute a different one
-- from the line items, and the disagreement will be found by a patient.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_invoice_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _invoice uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  UPDATE public.fhir_invoices i
     SET total_minor = COALESCE((
           SELECT sum(amount_minor) FROM public.fhir_invoice_items WHERE invoice_id = _invoice
         ), 0),
         updated_at = now()
   WHERE i.id = _invoice
     -- An issued invoice is a statement someone has been given. Editing its
     -- lines silently would change what they owe after the fact.
     AND i.status = 'draft';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_invoice_total ON public.fhir_invoice_items;
CREATE TRIGGER trg_recalculate_invoice_total
  AFTER INSERT OR UPDATE OR DELETE ON public.fhir_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_invoice_total();

CREATE OR REPLACE FUNCTION public.validate_fhir_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- An issued invoice must say when it was issued; that date is what a payment
  -- term counts from.
  IF NEW.status IN ('issued', 'balanced') AND NEW.issued_at IS NULL THEN
    NEW.issued_at := now();
  END IF;

  IF NEW.due_at IS NOT NULL AND NEW.issued_at IS NOT NULL AND NEW.due_at < NEW.issued_at THEN
    RAISE EXCEPTION 'An invoice cannot be due before it is issued'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Fully paid is what 'balanced' means in FHIR, so keep the two from drifting.
  IF NEW.status = 'balanced' AND NEW.paid_minor < NEW.total_minor THEN
    RAISE EXCEPTION 'An invoice is not balanced until it is paid in full'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_fhir_invoice ON public.fhir_invoices;
CREATE TRIGGER trg_validate_fhir_invoice
  BEFORE INSERT OR UPDATE ON public.fhir_invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_fhir_invoice();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
ALTER TABLE public.fhir_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fhir_invoice_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.fhir_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fhir_invoice_items TO authenticated;

-- Supabase's default privileges grant the full set on every new table in public,
-- so withholding DELETE requires revoking it. Verified, not assumed.
REVOKE DELETE, TRUNCATE ON public.fhir_invoices FROM anon, authenticated;
REVOKE ALL ON public.fhir_invoices FROM anon;
REVOKE ALL ON public.fhir_invoice_items FROM anon;

-- The patient reads their own invoices, but only once issued. A draft is the
-- practice still working out what to charge; showing it would mean a patient
-- watching a number change and being unable to ask about any version of it.
DROP POLICY IF EXISTS "Patients read their issued invoices" ON public.fhir_invoices;
CREATE POLICY "Patients read their issued invoices"
  ON public.fhir_invoices FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    AND status <> 'draft'
  );

DROP POLICY IF EXISTS "Practice staff read invoices they raised" ON public.fhir_invoices;
CREATE POLICY "Practice staff read invoices they raised"
  ON public.fhir_invoices FOR SELECT TO authenticated
  USING (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_patient_access(patient_user_id)
  );

DROP POLICY IF EXISTS "Practice staff raise invoices" ON public.fhir_invoices;
CREATE POLICY "Practice staff raise invoices"
  ON public.fhir_invoices FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.clinician_has_patient_access(patient_user_id)
      OR public.institution_has_patient_access(patient_user_id)
    )
  );

DROP POLICY IF EXISTS "Practice staff amend invoices" ON public.fhir_invoices;
CREATE POLICY "Practice staff amend invoices"
  ON public.fhir_invoices FOR UPDATE TO authenticated
  USING (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_patient_access(patient_user_id)
  )
  WITH CHECK (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_patient_access(patient_user_id)
  );

-- Line items follow their invoice. A patient who can read the invoice can read
-- what it is made of — a total with no breakdown is not a bill, it is a demand.
DROP POLICY IF EXISTS "Read line items of a readable invoice" ON public.fhir_invoice_items;
CREATE POLICY "Read line items of a readable invoice"
  ON public.fhir_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fhir_invoices i WHERE i.id = invoice_id));

DROP POLICY IF EXISTS "Practice staff write line items" ON public.fhir_invoice_items;
CREATE POLICY "Practice staff write line items"
  ON public.fhir_invoice_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fhir_invoices i
     WHERE i.id = invoice_id
       AND (public.clinician_has_patient_access(i.patient_user_id)
            OR public.institution_has_patient_access(i.patient_user_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fhir_invoices i
     WHERE i.id = invoice_id
       AND (public.clinician_has_patient_access(i.patient_user_id)
            OR public.institution_has_patient_access(i.patient_user_id))
  ));

COMMENT ON POLICY "Patients read their issued invoices" ON public.fhir_invoices IS
  'Drafts are excluded deliberately: a draft is the practice still deciding, and a patient '
  'watching a number change cannot usefully query any version of it. Once issued it is theirs '
  'to see without asking.';
