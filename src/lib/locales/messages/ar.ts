/**
 * Arabic — right-to-left; layout mirrors, not just text — DRAFT.
 *
 * Not native-speaker reviewed. Every key omitted here falls back to English, so
 * a partial file is safe: it degrades to English rather than to nothing.
 *
 * Deliberately limited to navigation and common controls. Clinical wording,
 * consent copy and anything legal is NOT translated here and must not be —
 * those go through a professional medical translator, because a mistranslated
 * instruction is a safety problem, not a polish problem.
 */
export const ar = {
  "common": {
    "save": "حفظ",
    "cancel": "إلغاء",
    "delete": "حذف",
    "edit": "تعديل",
    "add": "إضافة",
    "close": "إغلاق",
    "back": "رجوع",
    "next": "التالي",
    "done": "تم",
    "loading": "جارٍ التحميل…",
    "search": "بحث",
    "signIn": "تسجيل الدخول",
    "signOut": "تسجيل الخروج",
    "settings": "الإعدادات",
    "language": "اللغة",
    "yes": "نعم",
    "no": "لا"
  },
  "nav": {
    "today": "اليوم",
    "health": "صحتي",
    "team": "فريق الرعاية",
    "learn": "تعلّم",
    "overview": "نظرة عامة",
    "schedule": "الجدول",
    "catchUp": "استدراك",
    "vitals": "العلامات الحيوية",
    "medications": "الأدوية",
    "vault": "الخزنة",
    "adherence": "الالتزام بالدواء",
    "messages": "الرسائل",
    "careCircle": "دائرة الرعاية",
    "family": "العائلة",
    "askAI": "اسأل الذكاء الاصطناعي",
    "knowledgeBase": "قاعدة المعرفة"
  }
} as const;
