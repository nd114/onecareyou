# Hospital Profiles Plan — a public directory, published opt-in

Status: **documented, not started.** Earliest candidate of the current forward
plans to be picked up. Nothing here is scaffolded into the build yet.

---

## 1. The problem it solves

A patient can only connect to a hospital by **typing its code**. There is no way
to find a hospital by name. That is fine for someone discharged with a card in
their hand and useless for everyone else — and it is currently the single hardest
step in patient onboarding.

## 2. The boundary that governs the whole feature

Two things look similar and are not:

- **A tenant configuration** — name, code, branding, departments, members. This
  already exists, it is operational, and it is private to the tenant.
- **A directory listing** — the hospital as a discoverable public entity, with a
  page anyone can reach. This is a marketing and acquisition surface, and it does
  not exist.

The value is entirely in the second. Keeping them separate is what stops
operational tenant data from leaking onto a public page by accident, and it is
why the implementation below puts published content in its own table rather than
adding columns to `practices`.

## 3. What a profile contains

Public, no sign-in required:

- name and logo, city and country
- departments offered
- a short description
- affiliated clinicians **who have opted in**
- the connect action

Practical additions worth having: address and directions, phone, opening hours,
and whether they are accepting new patients.

## 4. Implementation

The underlying data mostly exists already. `practices` carries name, city,
country, logo, slug and tenant_type; `practice_departments` carries the
department list; `clinician_profiles` carries the staff.

1. **A `practice_profiles` table** for the public-facing fields — description,
   address, opening hours, phone, accepting-new-patients. Deliberately separate
   from `practices` so the operational tenant record is never confused with
   published marketing content, and so publishing is a distinct, deliberate act.
2. **An explicit `is_published` flag.** A hospital opts in. Nothing about a
   tenant becomes public merely because the tenant exists.
3. **A public read function** in the shape of the existing
   `public_institution_by_slug()`, which already returns name, city, country and
   logo to anonymous callers — so the pattern, and the boundary of what anonymous
   callers may read, is already set.
4. **A directory page** at `/hospitals` with search by name and city, and the
   profile at `/hospitals/<code>`. SEO-indexable, unlike the tenant subdomains,
   which are deliberately `noIndex`.
5. **Clinician visibility is opt-in per clinician**, not per hospital. A doctor's
   name appearing on a public page is their decision, not their employer's.

## 5. What it buys

- **Patient acquisition the hospital does not have to drive itself.** Someone
  searching for the hospital finds a page that explains OneCare and offers the
  connect action.
- **Removes the code-only bottleneck** in patient onboarding.
- **A credibility surface for enterprise sales.** "Here is your page" is a
  concrete thing to show a prospect.
- **SEO that accrues to the platform** rather than to each hospital separately.

## 6. Where to be careful

- **Publish nothing patient-derived.** No patient counts, no review scores, no
  outcome data. The moment a profile carries quality signals it becomes a ratings
  product with an entirely different risk profile — editorial liability, dispute
  handling, and a reason for hospitals to distrust the platform.
- **Accuracy is the hospital's to own, but the reputational cost is shared.**
  Stale opening hours on a page carrying our name is our problem too. Make the
  tenant admin the editor and date-stamp the content.
- **Clinician listing is consent, not convenience.** Opt-in, revocable, and it
  must not leak affiliations a clinician has not chosen to publish — a doctor may
  work at two hospitals and want only one of them public.
- **It interacts with tenant enumeration.** Hospital codes are 3–7 characters and
  `public_institution_by_slug` is anonymous by design, so the client list is
  already enumerable (noted in the August 2026 security review as an accepted
  risk). A published directory makes that deliberate rather than accidental,
  which is an improvement — but it should be a decision taken knowingly, not a
  side effect.

## 7. Effort

A table, a public read function, two pages and an admin editor. Roughly
comparable to the departments build.

The main open question is **editorial**: who writes the copy for each hospital,
who approves it, and who is accountable for keeping it true. That is a process
question, not an engineering one, and it should be answered before the first
profile is published rather than after.
