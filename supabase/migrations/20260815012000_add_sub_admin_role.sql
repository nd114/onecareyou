-- The Sub-Admin role, on its own so the new enum value is committed before the
-- next migration references it (Postgres will not let a value added in one
-- transaction be used in that same transaction).
--
-- A Sub-Admin is a hospital's delegated administrator. Their authority is not
-- tenant-wide: it is scoped to the departments they lead, which is what the
-- next migration adds. They run the assignment desk for their department —
-- routing patients to clinicians, seeing their department's roster and audit —
-- without gaining team management, billing, branding or the hospital code.

ALTER TYPE public.practice_role ADD VALUE IF NOT EXISTS 'sub_admin';
