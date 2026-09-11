# Workspace cleanup + clinician pricing rebuild

Two pieces of work before the investor review: remove the confusing second practice on the demo clinician account, and rebuild the clinician pricing so the numbers match what the platform actually does now.

## 1. Retire the empty second practice

Checked the live data: `Mitchell's Private Care` on demo-clinician-1 has 0 patients, 0 shared records, 0 departments and 1 member (the clinician). `OneCare Demo Hospital` holds everything real (2 shared patients, 6 assignments, 12 staff, 1 department).

- Mark `Mitchell's Private Care` inactive rather than deleting it — nothing clinical is attached, and the no-hard-delete rule stays intact.
- Filter inactive practices out of the practice list, so the clinician sees one workspace and the switcher disappears on its own.
- Remove the workspace switcher from the clinician top navigation entirely and surface it on the Practice overview page instead, for the rare account that genuinely has more than one. Multi-workspace stays supported in code; it just stops occupying prime navigation.
- Roadmap note: personal-practice-alongside-hospital remains a deferred item, unchanged.

## 2. Clinician pricing — recommendation

Current ladder (Solo $79 / Pro $149 / Enterprise $399) prices a mini EHR like a reminder app. Recommended ladder:

| Plan | Price | For | Patients |
| --- | --- | --- | --- |
| Community | $0 | Volunteer and community health workers, single-handed clinics | 25 |
| Individual | $99/mo | Independent practitioner | 150 |
| Practice | $299/mo | Small practice or clinic, up to 5 clinicians | 1,000 |
| Enterprise | from $2,500/mo | Hospitals and groups, scoped per agreement | Unlimited |

Reasoning: $99 sits under SimplePractice/Elation while offering more on the patient side; $299 for a whole small practice is still a fraction of per-seat EHR pricing; $2,500 is the honest floor for a multi-department deployment with BAA, tenancy, storage and onboarding, and leaves room to quote up. Annual stays at two months free. The $2,500 onboarding fee stays as-is for enterprise.

The Community tier is the accessibility answer: everything a lone clinician needs to actually track patients (patients, vitals, alerts, messaging, adherence), capped by patient count rather than crippled by feature removal, with OneCare branding retained and no BAA.

### Tier gating

Gate on three axes, not a long feature checklist:

- **Volume** — patient cap and document storage per plan (Community 1 GB, Individual 10 GB, Practice 100 GB, Enterprise negotiated).
- **Team** — seats and role range. Community and Individual are single-user, no staff roles. Practice unlocks staff invitations and the non-clinical roles (nurse, front desk, billing, read-only). Enterprise unlocks departments, patient routing, sub-admins and tenant ownership.
- **Depth** — the tools that cost real money to run or carry compliance weight: ambient scribe and AI assistant actions (metered on Individual, generous on Practice, negotiated on Enterprise), compliance exports and audit export, practice branding, EHR/FHIR connections, BAA, and revenue/invoicing. Community gets the assistant read-only, no scribe.

Enterprise cards will say plainly that the listed capabilities are scoped in the agreement, so nothing on the page over-promises at the $2,500 entry point.

## Technical notes

- Update `src/lib/pricing-constants.ts` (single source of truth) with the new ladder, storage allowances and the rebased `ENTERPRISE_TIERS` starting at $2,500; rename the `pro` key's display name to `Practice` and keep the key stable so existing subscriptions and Stripe metadata still resolve.
- New Stripe prices are needed for the changed amounts; existing subscribers keep their current price (grandfathered) since Stripe bills per subscription price, not per constant.
- `useClinicianSubscription.ts` gains the `community` tier and updated caps; `check-clinician-subscription` and `create-clinician-checkout` patient-limit maps updated to match.
- `ClinicianPricing.tsx`: four cards, Practice highlighted, Enterprise as "from" with a scoped-features note; comparison table and `EnterpriseInquiry.tsx` updated from the same constants.
- Practice list filtering in `usePractice.ts` excludes inactive practices; `WorkspaceSelector` moves from `ClinicianHeader.tsx` to the Practice overview.
- Existing tier-gate call sites are audited so the new caps are actually enforced server-side, not only shown on the page.
