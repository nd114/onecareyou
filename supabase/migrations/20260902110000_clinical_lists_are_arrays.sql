-- Conditions and allergies are lists. Make the database say so.
--
-- profiles.health_conditions, profiles.allergies and their equivalents on
-- clinician_patient_records and family_members are plain jsonb with no
-- constraint, so a bare string is storable — and the app reads them as arrays
-- in most places. The three failure modes, all verified rather than imagined:
--
--   "Diabetes, Hypertension".length      -> 22, rendered as "22 conditions"
--   "Diabetes, Hypertension".slice(0, 3) -> "Dia", rendered as a badge
--   "Diabetes, Hypertension".map(...)    -> throws, white screen
--
-- FamilyDashboard calls .map on it. PatientSafetyStrip already defends against
-- it, which is the tell that this has been hit before rather than a worry made
-- up here.
--
-- Two halves, in order: convert whatever is there, then stop it recurring.

-- Split a loose string into the list it was always meant to be. Commas and
-- semicolons both, because the CSV import writes semicolons and hand-entered
-- text uses commas.
CREATE OR REPLACE FUNCTION public.normalise_clinical_list(_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE jsonb_typeof(_value)
    WHEN 'array'  THEN _value
    WHEN 'null'   THEN NULL
    WHEN 'string' THEN COALESCE(
      (
        SELECT jsonb_agg(entry)
        FROM (
          SELECT btrim(part) AS entry
          FROM regexp_split_to_table(_value #>> '{}', '\s*[;,]\s*') AS part
        ) parts
        WHERE entry <> ''
      ),
      '[]'::jsonb
    )
    -- An object or a number is not a list, but it is somebody's data. Keep it
    -- as the single entry it is rather than dropping it on the floor.
    ELSE jsonb_build_array(_value)
  END;
$$;

COMMENT ON FUNCTION public.normalise_clinical_list(jsonb) IS
  'Coerces a clinical free-text list to a jsonb array. Splits loose strings on commas and '
  'semicolons; wraps anything else as a single entry rather than discarding it.';

DO $$
DECLARE
  _t text;
  _c text;
  _fixed integer;
BEGIN
  FOREACH _t IN ARRAY ARRAY['profiles', 'clinician_patient_records', 'family_members'] LOOP
    FOREACH _c IN ARRAY ARRAY['health_conditions', 'allergies'] LOOP
      EXECUTE format(
        'UPDATE public.%I SET %I = public.normalise_clinical_list(%I)
          WHERE %I IS NOT NULL AND jsonb_typeof(%I) <> ''array''',
        _t, _c, _c, _c, _c);
      GET DIAGNOSTICS _fixed = ROW_COUNT;
      IF _fixed > 0 THEN
        RAISE NOTICE 'normalised % row(s) of %.%', _fixed, _t, _c;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

-- NULL stays allowed and keeps its meaning: the category was withheld, which is
-- a different thing from an empty list meaning none recorded. The UI shows them
-- differently and the constraint must not collapse them.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_health_conditions_is_array,
  ADD CONSTRAINT profiles_health_conditions_is_array
    CHECK (health_conditions IS NULL OR jsonb_typeof(health_conditions) = 'array'),
  DROP CONSTRAINT IF EXISTS profiles_allergies_is_array,
  ADD CONSTRAINT profiles_allergies_is_array
    CHECK (allergies IS NULL OR jsonb_typeof(allergies) = 'array');

ALTER TABLE public.clinician_patient_records
  DROP CONSTRAINT IF EXISTS cpr_health_conditions_is_array,
  ADD CONSTRAINT cpr_health_conditions_is_array
    CHECK (health_conditions IS NULL OR jsonb_typeof(health_conditions) = 'array'),
  DROP CONSTRAINT IF EXISTS cpr_allergies_is_array,
  ADD CONSTRAINT cpr_allergies_is_array
    CHECK (allergies IS NULL OR jsonb_typeof(allergies) = 'array');

ALTER TABLE public.family_members
  DROP CONSTRAINT IF EXISTS family_members_health_conditions_is_array,
  ADD CONSTRAINT family_members_health_conditions_is_array
    CHECK (health_conditions IS NULL OR jsonb_typeof(health_conditions) = 'array'),
  DROP CONSTRAINT IF EXISTS family_members_allergies_is_array,
  ADD CONSTRAINT family_members_allergies_is_array
    CHECK (allergies IS NULL OR jsonb_typeof(allergies) = 'array');
