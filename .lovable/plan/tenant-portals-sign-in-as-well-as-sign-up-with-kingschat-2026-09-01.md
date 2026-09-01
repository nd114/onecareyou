# Tenant portals: sign in as well as sign up, with KingsChat

Today a hospital address like `lmc.onecare.you` only offers account creation: `/` is patient intake, `/staff` is clinician registration, and both show Google + email only. Anyone who already has an account has to leave the hospital's branded page for the generic OneCare sign-in, which loses the hospital's logo and colours, and KingsChat isn't offered there at all.

The fix is one reusable branded auth surface that every tenant gets automatically — nothing per-hospital to configure, since the tenant is already resolved from the hostname.

## What changes for people

Patient front door (`lmc.onecare.you/`)
- Two tabs at the top of the card: **Create account** and **Sign in**, with Create account first (it stays the primary purpose of the intake link).
- Both tabs offer Google and KingsChat, plus email/password.
- Sign in includes a "Forgot password?" link.
- After sign-in, the person lands where their account belongs: patients on their dashboard, clinicians on their clinician Today page — so a doctor who uses the patient link isn't dumped into a patient view.

Staff front door (`lmc.onecare.you/staff`)
- Same two tabs, same providers, same role-aware landing.
- Staff sign-up keeps its existing allowlist/affiliation behaviour untouched.

Branding
- Sign in is rendered inside the same branded panel as sign-up: hospital logo, name, city, primary/accent colours. No jump to an unbranded page.

Applies to every tenant
- Because the hospital is resolved from the address, any current or future tenant with a hospital code gets this the moment their subdomain resolves. Unknown subdomains keep falling back to the marketing site and the generic clinician sign-up, exactly as now.

## Technical notes

- Extract the branded shell (gradient panel, logo, highlights, theme toggle, SEO head, loading state) out of `src/pages/InstitutionSignUp.tsx` into `src/components/tenant/TenantAuthShell.tsx`, so patient and staff pages share one layout instead of two near-copies.
- Add a `mode: 'sign-up' | 'sign-in'` tab state to `InstitutionSignUp.tsx` and `InstitutionStaffSignUp.tsx`. The sign-in branch reuses `useAuth().signIn` and the existing `GoogleSignInButton` / `KingsChatSignInButton` components — no new auth logic, no schema or database changes.
- Pass a tenant-aware `redirectTo` to `KingsChatSignInButton` (it already accepts one) and resolve the post-sign-in destination with the existing clinician-profile check so patients and clinicians diverge correctly.
- Keep OAuth `redirect_uri` on the tenant's own origin (`window.location.origin`) so Google and KingsChat return to the hospital address rather than the apex domain. KingsChat needs each tenant origin registered in its developer console; note that for `lmc.onecare.you` when it goes live.
- On a tenant host, route `/sign-in` and `/clinician/sign-in` to the branded surface (via `TenantHome`), falling through to the existing generic pages off tenant hosts. `/i/:slug` legacy redirect is unchanged.
- Keep the pages `noIndex`, as they are today.
