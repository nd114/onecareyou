/**
 * Igbo — lower-resource; treat every string as provisional — DRAFT.
 *
 * Not native-speaker reviewed. Every key omitted here falls back to English, so
 * a partial file is safe: it degrades to English rather than to nothing.
 *
 * Deliberately limited to navigation and common controls. Clinical wording,
 * consent copy and anything legal is NOT translated here and must not be —
 * those go through a professional medical translator, because a mistranslated
 * instruction is a safety problem, not a polish problem.
 */
export const ig = {
  "common": {
    "save": "Chekwaa",
    "cancel": "Kagbuo",
    "delete": "Hichapụ",
    "edit": "Dezie",
    "add": "Tinye",
    "close": "Mechie",
    "back": "Azụ",
    "next": "Osote",
    "done": "Emechaala",
    "loading": "Na-ebu…",
    "search": "Chọọ",
    "signIn": "Banye",
    "signOut": "Pụọ",
    "settings": "Ntọala",
    "language": "Asụsụ",
    "yes": "Ee",
    "no": "Mba"
  },
  "nav": {
    "today": "Taa",
    "health": "Ahụike m",
    "team": "Otu nlekọta",
    "learn": "Mụta",
    "overview": "Nchịkọta",
    "schedule": "Usoro",
    "medications": "Ọgwụ",
    "family": "Ezinụlọ",
    "messages": "Ozi"
  }
} as const;
