-- Billing, and who may see a bill.
--
-- The rule this suite exists to protect: the person being billed can read their
-- own invoice without asking anyone. A bill you can only see on request is the
-- information asymmetry the rest of this product exists to remove.
--
-- The subtle one is the line items. Their policy leans on a subquery against
-- fhir_invoices, and whether that subquery inherits the invoice table's row
-- policies is a thing to test rather than believe.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/fhir_invoices.test.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

DO $$
DECLARE
  _patient  uuid := 'b1000000-0000-0000-0000-000000000001';
  _doctor   uuid := 'b1000000-0000-0000-0000-000000000002';
  _stranger uuid := 'b1000000-0000-0000-0000-000000000003';
  _other_pt uuid := 'b1000000-0000-0000-0000-000000000004';
  _draft    uuid;
  _issued   uuid;
  _count integer; _total bigint; _ok boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient,'inv-patient@test.local'), (_doctor,'inv-doctor@test.local'),
    (_stranger,'inv-stranger@test.local'), (_other_pt,'inv-other@test.local');

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _doctor, 'Dr Bill', 'inv-doctor@test.local', 'invtest',
          '{"vitals":true,"profile":true}'::jsonb, true);

  INSERT INTO public.fhir_invoices (patient_user_id, status, created_by, currency)
  VALUES (_patient, 'draft', _doctor, 'NGN') RETURNING id INTO _draft;

  INSERT INTO public.fhir_invoices (patient_user_id, status, created_by, currency, issued_at)
  VALUES (_patient, 'issued', _doctor, 'NGN', now()) RETURNING id INTO _issued;

  -- ==========================================================================
  -- 1. The total is the database's job
  --
  -- A client computing its own total eventually computes a different one from
  -- the line items, and a patient finds the disagreement.
  -- ==========================================================================
  INSERT INTO public.fhir_invoice_items (invoice_id, description, quantity, unit_price_minor, amount_minor)
  VALUES (_draft, 'Consultation', 1, 1500000, 1500000),
         (_draft, 'Full blood count', 1, 450000, 450000);

  SELECT total_minor INTO _total FROM public.fhir_invoices WHERE id = _draft;
  PERFORM pg_temp.assert(_total = 1950000, 'the invoice total is summed from its line items');

  DELETE FROM public.fhir_invoice_items WHERE invoice_id = _draft AND description = 'Full blood count';
  SELECT total_minor INTO _total FROM public.fhir_invoices WHERE id = _draft;
  PERFORM pg_temp.assert(_total = 1500000, 'removing a line item brings the total down with it');

  -- An issued invoice is a statement somebody has been given.
  INSERT INTO public.fhir_invoice_items (invoice_id, description, amount_minor)
  VALUES (_issued, 'Consultation', 2000000);
  UPDATE public.fhir_invoices SET total_minor = 2000000 WHERE id = _issued;

  INSERT INTO public.fhir_invoice_items (invoice_id, description, amount_minor)
  VALUES (_issued, 'Sneaky extra', 5000000);
  SELECT total_minor INTO _total FROM public.fhir_invoices WHERE id = _issued;
  PERFORM pg_temp.assert(_total = 2000000,
    'an issued invoice does not silently re-total when a line is added');

  -- ==========================================================================
  -- 2. The patient reads their own issued invoice, and not the draft
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_invoices;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'the patient sees the issued invoice');

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_invoices WHERE status = 'draft';
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0,
    'a draft stays with the practice until it is issued');

  -- ==========================================================================
  -- 3. Line items follow the invoice
  --
  -- A total with no breakdown is a demand, not a bill. And the policy leans on
  -- a subquery against fhir_invoices, so this also proves that subquery
  -- inherits the invoice policies rather than seeing every row.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_invoice_items;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 2,
    'the patient reads the lines of the issued invoice, and only those');

  -- ==========================================================================
  -- 4. Somebody else's bill is not theirs
  -- ==========================================================================
  INSERT INTO public.fhir_invoices (patient_user_id, status, created_by, issued_at)
  VALUES (_other_pt, 'issued', _doctor, now());

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_invoices;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'another patient''s invoice stays invisible');

  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_invoices;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'an unrelated clinician reads no invoices at all');

  -- ==========================================================================
  -- 5. The patient reads but does not write
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.fhir_invoices SET paid_minor = total_minor, status = 'balanced'
     WHERE id = _issued;
    GET DIAGNOSTICS _count = ROW_COUNT;
    _ok := _count > 0;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(NOT _ok, 'a patient cannot mark their own invoice paid');

  -- ==========================================================================
  -- 6. Nobody deletes an invoice
  --
  -- A bill that was raised and withdrawn is part of the record; FHIR has
  -- 'cancelled' and 'entered-in-error' for exactly that. Asserted with the
  -- privilege granted, so the refusal comes from the missing policy.
  -- ==========================================================================
  GRANT DELETE ON public.fhir_invoices TO authenticated;
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.fhir_invoices WHERE id = _issued;
  GET DIAGNOSTICS _count = ROW_COUNT;
  EXECUTE 'SET LOCAL ROLE postgres';
  REVOKE DELETE ON public.fhir_invoices FROM authenticated;
  PERFORM pg_temp.assert(_count = 0, 'no DELETE policy exists, so an invoice cannot be deleted');

  -- ==========================================================================
  -- 7. Money rules the database enforces
  -- ==========================================================================
  BEGIN
    UPDATE public.fhir_invoices SET paid_minor = 99999999 WHERE id = _issued;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'nobody can have paid more than they were billed');

  BEGIN
    UPDATE public.fhir_invoices SET total_minor = -100 WHERE id = _issued;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a total cannot be negative — a credit is its own invoice');

  BEGIN
    UPDATE public.fhir_invoices SET status = 'balanced' WHERE id = _issued;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'an invoice is not balanced until it is paid in full');

  UPDATE public.fhir_invoices SET paid_minor = total_minor, status = 'balanced' WHERE id = _issued;
  PERFORM pg_temp.assert(
    (SELECT status FROM public.fhir_invoices WHERE id = _issued) = 'balanced',
    'paying it in full does balance it');

  BEGIN
    UPDATE public.fhir_invoices SET currency = 'naira' WHERE id = _issued;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'currency must be an ISO code, not a word');

  BEGIN
    UPDATE public.fhir_invoices SET due_at = issued_at - interval '1 day' WHERE id = _issued;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'an invoice cannot be due before it is issued');

  -- ==========================================================================
  -- 8. An invoice number exists without anyone typing one
  -- ==========================================================================
  PERFORM pg_temp.assert(
    (SELECT invoice_number FROM public.fhir_invoices WHERE id = _issued) LIKE 'INV-%',
    'every invoice carries a reference the patient can quote');

  PERFORM pg_temp.assert(
    (SELECT count(DISTINCT invoice_number) FROM public.fhir_invoices) =
    (SELECT count(*) FROM public.fhir_invoices),
    'invoice references do not collide');

  RAISE NOTICE 'ALL INVOICE TESTS PASSED';
END
$$;

ROLLBACK;
