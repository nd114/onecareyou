# Database tests

RLS is the security boundary for this product, so the rules that matter are
asserted against a real Postgres rather than inferred from the UI.

## Running

These need a Postgres with the migration history applied. Against a local
Supabase (`supabase start`):

```sh
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
  -v ON_ERROR_STOP=1 -f supabase/tests/institution_access.test.sql
```

Against a plain Postgres 16, the history replays with a small compatibility
shim (roles `anon`/`authenticated`/`service_role`, an `auth.uid()` reading
`request.jwt.claim.sub`, and stub `storage`/`realtime` schemas), plus the
grants Supabase applies by default to new objects in `public`:

```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
```

Each file runs inside a transaction and rolls back, so it leaves no fixtures
behind. A failed assertion raises and aborts; a clean run ends with
`ALL INSTITUTION ACCESS TESTS PASSED`.

## What is covered

`institution_access.test.sql` — the hospital (institution) sharing pathway:

| Rule | Source |
| --- | --- |
| A clinician assigned to a hospital-shared patient reads the shared categories | consent model §2B |
| Categories the patient withheld stay unreadable | consent model §2B |
| A colleague at the same hospital without an assignment reads nothing | consent model §2B |
| An assignment made by another tenant grants nothing | tenancy plan §2 |
| Patient identity resolves through the institution pathway, and only there | tenancy plan §2 |
| A hospital may end a share but never restart one | consent model §3 |
| Revocation stops forward access immediately | consent model §3 |
| The relationship ledger records connect / revoke / re-share | consent model §3 |

Please extend this file rather than starting a new one when the sharing rules
change, and add a row above so the coverage stays legible.
