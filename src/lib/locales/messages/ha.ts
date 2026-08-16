/**
 * Hausa — lower-resource; treat every string as provisional — DRAFT.
 *
 * Not native-speaker reviewed. Every key omitted here falls back to English, so
 * a partial file is safe: it degrades to English rather than to nothing.
 *
 * Deliberately limited to navigation and common controls. Clinical wording,
 * consent copy and anything legal is NOT translated here and must not be —
 * those go through a professional medical translator, because a mistranslated
 * instruction is a safety problem, not a polish problem.
 */
export const ha = {
  "common": {
    "save": "Ajiye",
    "cancel": "Soke",
    "delete": "Share",
    "edit": "Gyara",
    "add": "Ƙara",
    "close": "Rufe",
    "back": "Baya",
    "next": "Na gaba",
    "done": "An gama",
    "loading": "Ana lodawa…",
    "search": "Nema",
    "signIn": "Shiga",
    "signOut": "Fita",
    "settings": "Saituna",
    "language": "Harshe",
    "yes": "Ee",
    "no": "A'a"
  },
  "nav": {
    "today": "Yau",
    "health": "Lafiyata",
    "team": "Ƙungiyar kulawa",
    "learn": "Koyo",
    "overview": "Taƙaitawa",
    "schedule": "Jadawali",
    "medications": "Magunguna",
    "family": "Iyali",
    "messages": "Saƙonni"
  }
} as const;
