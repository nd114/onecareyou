# International by Default

**Status:** In force. Applies to every new feature.
**Owner:** Engineering

---

## 1. The rule

OneCare is an international product that started in Nigeria. It is not a
Nigerian product with international ambitions. Those two produce different code,
and the difference shows up in defaults.

**No default may assume a market.** Where a value differs by country, the
platform picks a neutral default and the tenant sets their own.

## 2. What that means in practice

| Concern | Neutral default | Set by |
| --- | --- | --- |
| Currency | `USD` | Practice settings → Billing currency |
| Placeholder names | A mix across origins — Alex Moreau, Dr. Jane Evans, Dr. Priya Nair | — |
| Placeholder city | `City`, not a named one | — |
| Dates | ISO in storage, locale-formatted on screen | The viewer's locale |
| Units | Canonical in storage, converted for display | Existing unit preferences |
| Phone / address | No assumed format | The tenant's country |

Nigeria-specific *content* is different from a Nigeria-specific *default*. A job
listing for a role in Lagos is content and stays. A currency column defaulting to
NGN is a default and does not.

## 3. Money, specifically

Amounts are minor units as integers. **The exponent is not always 2.** JPY and
KRW have no minor unit, so ¥1,000 is stored as `1000`. KWD and TND have three, so
1.500 KWD is `1500`. Code that divides by 100 is correct for most of the world
and wrong for a tenant in Tokyo or Kuwait City.

Ask, do not assume:

- TypeScript: `minorUnitDigits(currency)`, `toMajor()`, `toMinorUnits()` in
  `src/lib/fhir/invoice.ts`. The digits come from `Intl`, so there is no second
  list to drift.
- SQL: `public.currency_minor_units(text)`.

An invoice stores its own currency and keeps it. A practice that changes currency
must not restate the value of bills it already issued.

## 4. What is deliberately not done

**No translation layer yet.** Copy is in English. Adding i18n plumbing before
there is a second language produces a large diff, a build step, and no benefit —
see `docs/language-support-plan.md`. The rule above is about defaults, which cost
nothing to get right now and are expensive to change once tenants exist.

**No currency conversion.** The platform never converts between currencies. A
practice bills in one currency; a patient with bills from two practices in two
currencies sees two totals, not a combined one. Converting would require a rate
source, a rate date, and a decision about who bears the spread — none of which
exists, and a wrong total is worse than two right ones.
