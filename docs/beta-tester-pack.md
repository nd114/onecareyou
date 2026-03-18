# OneCare Founding Tester Pack

> **Testing Window:** [INSERT DATES]
> **Platform:** https://onecareyou.lovable.app
> **Support:** hello@onecare.you
> **Bug Reporting:** Use the in-app 🐛 button (bottom-right corner on every page)
> **Feedback Form:** [INSERT GOOGLE FORM LINK]

---

## Kickoff Meeting Agenda

These topics will be covered verbally in the first meeting — no need to read up beforehand:

1. What OneCare is and our pre-launch goals
2. The five feedback dimensions (bugs, UX, nomenclature, trust, regional fit)
3. How to write a good bug report (what you did → what happened → device/browser)
4. Walkthrough of the in-app bug reporter and Google Form
5. Demo account usage rules (don't delete data; add to it or use your own account)
6. Q&A and testing timeline

---

## Account Setup

**Step 1 — Fresh Sign-Up:** Register at https://onecareyou.lovable.app/sign-up with your real email. Note your first impressions (confirmation email speed, onboarding clarity, empty dashboard).

**Step 2 — Demo Account:** After completing sign-up, switch to the pre-loaded demo account for deeper testing:

| Role | Email | Password |
|------|-------|----------|
| Patient | `demo-patient-1@onecare.you` | `Demo123!` |
| Clinician | `demo-clinician-1@onecare.you` | `Demo123!` |

> Multiple testers share demo accounts — please don't delete demo data.

---

## Role 1: Patient Testers

You're testing as someone managing their own health — medications, vitals, documents, and provider sharing.

### Checklist (Fresh Account)

1. Visit the landing page — is it clear what OneCare does?
2. Sign up with your email — note confirmation email timing
3. Complete onboarding — are the steps logical and non-invasive?
4. Review the empty dashboard — do you know what to do next?

### Checklist (Demo Account)

5. **Medications** → Add a medication you actually take
6. **Schedule** → Mark doses as taken, missed, or skipped
7. **Vitals** → Log a blood pressure, glucose, or weight reading
8. **Health Vault** → Upload any document (PDF, photo of a prescription)
9. **Care Circle** → Review family member management
10. **Settings** → Check profile, notifications, and provider sharing options
11. **Knowledge Base** → Browse help topics
12. **Pricing** → Review tiers — are they clear and fair for your region?
13. **Privacy Policy & Terms** → Do these build trust?
14. Would you recommend this app to someone you know? What's the #1 thing holding you back?

---

## Role 2: Clinician Testers

You're testing as a healthcare provider who monitors patients remotely — their adherence, vitals, and documents.

### Checklist (Fresh Account)

1. Visit the Clinician Portal page (`/clinician`) — does it communicate value?
2. Visit Clinician Pricing — are tiers appropriate for different practice sizes?
3. Sign up as a clinician (`/clinician/sign-up`) — are the fields relevant?
4. Complete clinician onboarding — does the guided setup make sense?

### Checklist (Demo Account)

5. **Dashboard** → Can you quickly identify which patients need attention?
6. **Patients** → Click into a patient detail view — is the data organized usefully?
7. **Send Guidance** → Create a clinical instruction for a patient
8. **Set Alert Thresholds** → Configure vital alerts (e.g., BP above 140/90)
9. **Shared Documents** → Review patient-uploaded documents
10. **Settings** → Check practice settings and notification preferences
11. Review nomenclature: "Vitals," "Adherence," "Guidance," "Care Circle," "Health Vault," "Provider Share" — are these terms appropriate?
12. Does the platform feel professional and compliant enough for real patient use?
13. Does it work for healthcare in your country? What would need to change?
14. Would you use this in your practice? What's the biggest barrier?

---

## Role 3: QA + Specialist Testers

You're testing for bugs, edge cases, clinical accuracy, and cross-device compatibility.

### Functional Testing

1. **Form validation** → Submit empty forms, long inputs, special characters (é, ñ, 中文), negative numbers, extreme dates
2. **Navigation** → Use back/forward buttons, bookmark pages, deep-link to inner pages
3. **Auth edge cases** → Access protected pages without login, switch accounts, test password reset
4. **Data operations** → Add then immediately edit/delete a medication, log boundary vitals (BP 300/200, glucose 0)

### Cross-Device & Browser

5. Test on **mobile** (iOS Safari, Android Chrome) — layout, touch targets, feature access
6. Test on **desktop** (Chrome, Firefox, Safari, Edge) — browser-specific rendering
7. Test on **slow connection** (DevTools → Slow 3G) — loading states, usability
8. Test at **320px width** — overflow, readability, tappability

### Accessibility & Performance

9. **Keyboard only** (Tab, Enter, Escape) — can you reach everything?
10. **Error recovery** → Disconnect internet during a save, then reconnect
11. **Performance** → Navigate rapidly through heavy pages (Vitals charts, Dashboard)

### Clinical Accuracy (Specialists)

12. **Medication database** → Search by brand and generic names, check international names (Panadol vs Tylenol)
13. **Drug Interaction Checker** → Verify accuracy of warnings and severity levels
14. **Medication Info pages** → Is the drug information accurate and patient-appropriate?
15. **Health Vault AI summaries** → Upload a lab/radiology report — does the AI capture key findings?

---

## Reporting

- **Bugs:** Use the in-app 🐛 button on any page. It auto-captures your URL and browser info.
- **Feedback:** Complete the Google Form after your testing session: [INSERT LINK]
- **Urgent issues:** Email hello@onecare.you

---

*Thank you for shaping OneCare before launch. Your honest feedback makes a real difference.*

*— The OneCare Team*
