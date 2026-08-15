-- Why practice_members.can_view_all_patients still defaults to true.
--
-- The August 2026 review found that this default (inherited from the original
-- single-practice model) lets every clinician at a hospital tenant read every
-- institution-shared patient without an assignment, which is broader than the
-- sharing model's description of the institution pathway.
--
-- Decision: keep it, deliberately, for now. The people who would route access —
-- department sub-admins — are not onboarded yet. Restricting access before that
-- workflow has anyone running it would block care with no working mechanism to
-- unblock it. Access is audited, so this is a stated trade-off, not an oversight.
--
-- Revisit trigger: once departments have sub-admins onboarded and trained,
-- switch to assignment-first access — a clinician sees the patients assigned to
-- them, and the practice-wide view becomes an administrative right. That change
-- is prepared on branch claude/oclmc-panel-scope-option-a-assignment-first.
--
-- Recorded as a column comment so it travels with the schema rather than living
-- only in a review document.

COMMENT ON COLUMN public.practice_members.can_view_all_patients IS
  'Grants a tenant-wide view of institution-shared patients, bypassing per-patient assignment. '
  'Defaults to true deliberately (Aug 2026): department sub-admins who would route access are not '
  'onboarded yet, and access is audited. Revisit when sub-admins are live — the target is '
  'assignment-first, with this becoming an owner/admin right. See '
  'docs/reviews/oc-lmc-review-aug-2026.md (C2).';