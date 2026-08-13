# OneCare Handbook (internal)

The operational documentation for OneCare. Not published — it is served in-app only to platform
admins at `/admin/docs`, and lives in the repository under `docs/handbook/`.

| Document | Who it is for | What it covers |
| --- | --- | --- |
| [Patient guide](./patient-guide.md) | Support + onboarding | Every patient-facing feature, step by step |
| [Clinician guide](./clinician-guide.md) | Clinical partners, sales engineers | Clinician and practice workflows |
| [Admin guide](./admin-guide.md) | OneCare staff | Platform admin console, tenants, invitations, careers |
| [Data model](./data-model.md) | Engineers, technical reviewers | Tables, access helpers, storage accounting |
| [Operations runbook](./operations-runbook.md) | On-call | Deploys, incidents, common failures, escalation |

Companion strategy and architecture references stay in [`docs/`](../): `roadmap.md`,
`platform-documentation.md`, `sharing-access-consent-model.md`,
`enterprise-hospital-tenancy-plan.md`, `pricing-roadmap.md`, `qhin-integration-plan.md`,
`whatsapp-integration-plan.md`.

## Conventions used in this handbook

- Names of screens match the in-app labels exactly, so support can read instructions aloud.
- "Institution" means a hospital or clinic tenant; "practice" means the smaller tenant of the same
  object. Both are rows in `practices`.
- Anything not yet built is written as **(coming soon)** and never described in the present tense.
