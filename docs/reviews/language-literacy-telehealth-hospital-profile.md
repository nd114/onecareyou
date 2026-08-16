# Four questions: languages, low literacy, telehealth, hospital profiles

August 2026. Written in response to four product questions. Each section says
what exists today (checked, not assumed), what it would take, and a
recommendation.

---

## 1. Languages — what "we already have it" actually amounts to

**What was there.** `src/lib/i18n.ts` had i18next wired and initialised in
`main.tsx`, a 27-key English bundle, and Spanish and French listed as "coming
soon". **Zero components called `t()`.** The library was installed; nothing in
the app was translatable.

**What that means for effort.** The wiring was maybe 5% of the job. The rest is
extraction:

| Category | Count |
| --- | --- |
| Visible text in JSX | ~1,142 |
| `placeholder` / `title` / `label` / `aria-label` props | ~375 |
| Toast and error strings | ~259 |
| **Total, across ~250 files** | **~1,780** |

So: yes, possible, and the foundation is now built and committed — registry,
12 locales, RTL, formatting, switcher, and the tab bar converted as a worked
example. But "won't take much" is not the right expectation for the whole app.
Extraction is roughly a week of mechanical work for one person; translation and
review is the longer pole.

**Staged rollout, highest value first.** Each stage is independently shippable:

1. **Navigation and common controls** — done. ~50 keys, every screen benefits.
2. **The patient journey**: onboarding, dashboard, medications, vitals, Care
   Circle, the sharing disclosure. ~400 keys. This is the slice that decides
   whether a non-English speaker can actually use the product.
3. **Clinician surfaces.** ~600 keys, lower urgency — clinical staff in these
   markets generally work in English, and the hospital's own language policy
   usually settles it.
4. **Long tail**: marketing pages, legal, help centre.

**Two things I would insist on.**

*Clinical and consent copy needs a human medical translator.* Everything shipped
here is navigation and buttons. Medication instructions, the sharing disclosure,
guidance text and legal copy must not be machine-translated: a mistranslated
instruction is a safety incident, and a mistranslated consent notice is a legal
one. Budget for professional review of that slice specifically.

*The Nigerian languages need native review before release.* Yoruba, Hausa and
Igbo are lower-resource languages; what is committed is provisional and marked
`draft`. Draft locales are hidden from the switcher in production builds, so
nothing half-finished reaches a patient by accident — flip a locale to
`released` in the registry once a native speaker has been through it.

**One question for you:** Portuguese is committed in Brazilian forms ("Salvar",
"Configurações"). If the target is Angola or Mozambique, European Portuguese
differs enough to matter ("Guardar", "Definições"). Which market?

---

## 2. Low-literacy support

This is not the same problem as translation, and solving one does not solve the
other. Someone may read no language fluently, or may read their own language but
not the register a medical app defaults to. The design goal is that **the app
works without reading**.

`/assist` (Simple Mode) already exists but is a sub-tab inside the Learn pillar —
four taps in, unfindable by the people who need it, and not persistent.

### What it should be

**A stored preference, offered at onboarding**, not a page. One question during
sign-up — "Would you like the simple version?" — sets a profile flag that changes
the default home, the type scale and the density everywhere.

**The five changes that carry most of the value:**

1. **Icon + colour + text, always together.** A pill that is round, blue and
   labelled "morning" is identifiable three ways. Never rely on text alone for a
   primary action, and never on colour alone either.
2. **Photographs of the actual medication.** The pill identifier and photo
   gallery already exist — reuse them. "Take the white round one" beats
   "Take Metformin 500mg" for a patient who cannot read either.
3. **Time as pictures.** Sun, midday sun, moon for morning/afternoon/night
   instead of "08:00 · 14:00 · 22:00". Clock times are a literacy and numeracy
   requirement most schedules do not need.
4. **Voice, in both directions.** Read-aloud on every instruction (the browser's
   speech synthesis is free and offline), and voice input for logging — dictation
   already exists on the clinician side and the patient assistant.
5. **One question per screen.** The current forms ask for several fields at once;
   simple mode should ask one thing, large, with a big yes/no or a photo choice.

**Structural rules** worth adopting whether or not simple mode is on: reading
level at roughly grade 6 for patient-facing copy; no medical jargon without a
plain-language gloss; every number paired with a comparison ("120/80 — this is
normal for you") rather than left as a bare figure.

**Who else this helps:** elderly patients, anyone on a small phone, anyone
post-discharge on sedating medication, and caregivers managing someone else's
care. It is not a niche mode.

**Sequencing:** the preference and the type/density switch first (small), then
read-aloud (small, high impact), then the photo-and-icon medication schedule
(medium), then voice logging (larger, and dependent on how the assistant is
already structured).

---

## 3. Telehealth — what exists, honestly

**Checked, not assumed.** There is no video, no WebRTC, no scheduling, and no
appointment model. The only `video` in the codebase is the camera feed for the
medication scanner. "Appointment" appears as a *guidance category label* and in
marketing copy. The platform's own copy currently says "no appointments needed
for updates".

**What does exist is asynchronous telehealth, and quite a lot of it:**

| Capability | State |
| --- | --- |
| Secure patient↔clinician messaging with attachments | Built |
| Clinician guidance with due dates and acknowledgement | Built |
| Remote vitals monitoring with per-patient alert rules | Built |
| Encounters + ambient scribe | Built (in-person documentation) |
| Private doctor share — described in the docs as "the pathway for telehealth, second opinions and private consults" | Built as a *sharing* pathway; no consult mechanics |

So the honest position: OneCare does **store-and-forward telehealth and remote
patient monitoring** today. It does not do **synchronous consults**. Those are
two different regulated products, and the gap between them is bigger than a video
widget.

### A plan, in the order I would build it

**Phase 1 — asynchronous consult, as a first-class object (small, high value).**
Today an async consult is an unstructured message thread. Make it a thing: a
patient submits a question with a category and optional photo, it enters a queue
with a response-time expectation, a clinician answers, and it closes. This is
mostly UI over existing messaging, it needs no new compliance surface, and it
matches how care in these markets actually happens.

**Phase 2 — scheduling.** An appointment object (patient, clinician or
department, time, mode, status), reminders through the existing notification
path, and hospital-side visibility so a department can see its own diary. Needed
by video, but valuable on its own for in-person visits — which the hospital tenant
will want regardless.

**Phase 3 — synchronous video.** Only after 1 and 2. The build itself is modest
if you buy the transport (Daily, Twilio Video or LiveKit — do not build WebRTC
signalling yourself). What is not modest:

- **Bandwidth reality.** Video consults in Nigeria will fail often. Audio-only
  fallback is not a nice-to-have, it is the primary path, and the flow must
  degrade to it automatically rather than failing.
- **Regulatory.** Remote prescribing rules, cross-border licensing if a doctor in
  one country consults a patient in another, and whether a consult creates a
  documented clinical encounter (it does).
- **Recording.** If a consult is recorded, it becomes a record with retention,
  consent and access rules — and the existing model says transcripts are kept and
  recordings are not. Keep that.
- **Billing.** Who pays, how, and what happens when the connection drops mid-way.

**Phase 4 — triage and routing.** Symptom intake that routes to the right
department, sitting on the department model already built.

**My recommendation:** do Phase 1 now, Phase 2 with the hospital's input, and
treat Phase 3 as a separate product decision with its own scoping — including a
conversation with the hospital about whether they want consults happening on our
platform or theirs. Async consults plus remote monitoring is a defensible
"telehealth" claim today; video without scheduling, fallback and a regulatory
answer would be a demo, not a product.

---

## 4. Hospital profile — yes, with one boundary

**The idea is sound and I would build it**, with a clear line between two things
that look similar and are not:

- **A directory listing** — the hospital as a discoverable entity, with a public
  page. This is a marketing and acquisition surface.
- **A tenant configuration** — name, code, branding, departments. This already
  exists.

The value is in the first, and it solves a real gap found in the last review:
**a patient can only connect to a hospital by typing its code.** There is no way
to find a hospital by name. That is fine for someone discharged with a card in
their hand, and useless for everyone else.

### What it would contain

Public, no sign-in: name and logo, city and country, departments offered,
a short description, affiliated clinicians who have opted in, and the connect
action. Practical additions worth having: address and directions, phone, opening
hours, and whether they accept new patients.

### How to implement it

The data mostly exists. `practices` already carries name, city, country, logo,
slug, tenant_type; `practice_departments` carries the department list;
`clinician_profiles` carries the staff.

1. **A `practice_profiles` table** for the public-facing fields (description,
   address, hours, phone, accepting-new-patients) — deliberately separate from
   `practices` so the operational tenant record is not confused with published
   marketing content, and so publishing is a distinct action.
2. **An explicit `is_published` flag.** A hospital opts in. Nothing about a
   tenant becomes public because it exists.
3. **A public read function** in the shape of the existing
   `public_institution_by_slug()` — which already returns name, city, country
   and logo to anonymous callers, so the pattern and its boundaries are set.
4. **A directory page** at `/hospitals` with search by name and city, and the
   profile at `/hospitals/<code>`. SEO-indexable, unlike the tenant subdomains
   which are deliberately `noIndex`.
5. **Clinician visibility is opt-in per clinician**, not per hospital. A doctor's
   name appearing on a public page is their decision, not their employer's.

### What it buys

- **Patient acquisition** the hospital does not have to drive itself — someone
  searching for the hospital finds a page that explains OneCare and offers the
  connect action.
- **Removes the code-only bottleneck**, which is currently the single hardest
  step in patient onboarding.
- **A credibility surface for enterprise sales.** "Here is your page" is a
  concrete thing to show a prospect.
- **SEO** that accrues to the platform rather than to each hospital separately.

### Where to be careful

- **Do not publish anything patient-related.** Patient counts, review scores,
  outcome data — none of it. The moment a profile carries quality signals it
  becomes a ratings product with a different risk profile entirely.
- **Accuracy is the hospital's to own.** Stale opening hours on a page carrying
  our name is our problem too; make the tenant admin the editor and date-stamp
  the content.
- **Clinician listing is consent, not convenience.** Opt-in, revocable, and it
  must not leak affiliations a clinician has not chosen to publish — a doctor
  may work at two hospitals and want only one of them public.

**Effort:** a table, a public function, two pages and an admin editor. Roughly
comparable to the departments build. The main open question is editorial: who
writes the copy, and who is accountable for keeping it true.

---

## Summary of what I would do next

1. Ship the language foundation (done), then extract the patient journey (stage 2).
2. Get the Nigerian-language drafts native-reviewed before enabling them.
3. Make Simple Mode a preference offered at onboarding — small change, large audience.
4. Build async consults as a first-class object; treat video as separate scoping.
5. Build hospital profiles, published opt-in, with no patient-derived data on them.
