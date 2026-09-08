# Four questions: languages, low literacy, telehealth, hospital profiles

August 2026. Four product questions were asked; each was answered against the
codebase rather than from memory. This page records **what was found and what was
decided**. The forward plans themselves have been split out into standalone
documents so they can be picked up independently.

| Question | What exists today (checked) | Decision | Plan |
| --- | --- | --- | --- |
| **Languages** — support 11 more? | i18next wired, 27-key English bundle, **zero `t()` call sites**. ~1,780 strings to extract across ~250 files. | Keep as a plan. A foundation was built and then **reverted** — live translation machinery with no translations behind it is a liability in a codebase under parallel edit. | [`language-support-plan.md`](../language-support-plan.md) |
| **Low literacy** — what would it look like? | `/assist` existed but was a sub-tab four taps into Learn, and did not persist. | **Build the preference now**; defer the deeper surface changes. Shipped: `profiles.simple_mode`, offered at onboarding and in Settings, with an explanation of who it helps and why. | [`low-literacy-support-plan.md`](../low-literacy-support-plan.md) |
| **Telehealth** — how much do we have? | No video, no WebRTC, no scheduling, no appointment model. But messaging, guidance, remote vitals monitoring and encounters are all built. | Log the plan, revisit later. The honest claim today is **store-and-forward telehealth and remote monitoring** — not synchronous consults. | [`telehealth-plan.md`](../telehealth-plan.md) |
| **Hospital profiles** — worth having? | Tenant configuration exists; a public directory does not. Patients can only connect by typing a hospital code. | Yes, and it is the **earliest of these to start** — but not yet. Documented in full. | [`hospital-profiles-plan.md`](../hospital-profiles-plan.md) |

---

## The three findings worth carrying forward

**"We have i18n" was not true in any useful sense.** The library was installed and
initialised; nothing in the app called it. This is the general shape of a
scaffold-shaped claim, and it is worth checking the call sites before counting
anything as present.

**Language and literacy are different problems.** Translating the app does not
help someone who reads no language fluently, and simplifying it does not help
someone who reads Yoruba and not English. They are separately funded, separately
staged, and the low-literacy work has the wider audience — elderly patients,
small screens, post-discharge sedation and caregivers, not only patients who
struggle to read.

**The gap between async and synchronous telehealth is regulatory, not technical.**
Buying video transport is a modest build. Remote prescribing rules, cross-border
licensing, recording retention and mid-consult billing failures are not, and none
of them are solved by the widget.
