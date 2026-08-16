/**
 * Yoruba — lower-resource; treat every string as provisional — DRAFT.
 *
 * Not native-speaker reviewed. Every key omitted here falls back to English, so
 * a partial file is safe: it degrades to English rather than to nothing.
 *
 * Deliberately limited to navigation and common controls. Clinical wording,
 * consent copy and anything legal is NOT translated here and must not be —
 * those go through a professional medical translator, because a mistranslated
 * instruction is a safety problem, not a polish problem.
 */
export const yo = {
  "common": {
    "save": "Fi pamọ́",
    "cancel": "Fagilé",
    "delete": "Paarẹ́",
    "edit": "Ṣàtúnṣe",
    "add": "Fi kún",
    "close": "Tì",
    "back": "Padà",
    "next": "Tókàn",
    "done": "Ó ti parí",
    "loading": "Ń gbé wọlé…",
    "search": "Wá",
    "signIn": "Wọlé",
    "signOut": "Jáde",
    "settings": "Ètò",
    "language": "Èdè",
    "yes": "Bẹ́ẹ̀ni",
    "no": "Bẹ́ẹ̀kọ́"
  },
  "nav": {
    "today": "Òní",
    "health": "Ìlera mi",
    "team": "Ẹgbẹ́ ìtọ́jú",
    "learn": "Kọ́",
    "overview": "Àkópọ̀",
    "schedule": "Ìtòlẹ́sẹẹsẹ",
    "medications": "Òògùn",
    "family": "Ìdílé",
    "messages": "Ìránṣẹ́"
  }
} as const;
