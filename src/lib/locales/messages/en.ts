/**
 * English is the source of truth. Every other locale is a subset of these keys;
 * anything missing falls back here, so a partial translation degrades to
 * English rather than to a blank screen.
 *
 * Keys are grouped by surface. Keep them semantic ("nav.today"), never literal
 * ("nav.Today"), so re-wording English does not invalidate every translation.
 */
export const en = {
  common: {
    appName: 'OneCare',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    loading: 'Loading…',
    search: 'Search',
    signIn: 'Sign in',
    signOut: 'Sign out',
    settings: 'Settings',
    language: 'Language',
    yes: 'Yes',
    no: 'No',
  },
  nav: {
    // Keys match the pillar keys in nav-ia.ts, which is what the tab bar looks up.
    today: 'Today',
    health: 'My Health',
    team: 'Care Team',
    learn: 'Learn',
    // Clinician pillars
    patients: 'Patients',
    communicate: 'Communicate',
    practice: 'Practice',
    overview: 'Overview',
    schedule: 'Schedule',
    catchUp: 'Catch-up',
    vitals: 'Vitals',
    medications: 'Medications',
    vault: 'Vault',
    adherence: 'Adherence',
    messages: 'Messages',
    careCircle: 'Care Circle',
    family: 'Family',
    askAI: 'Ask AI',
    knowledgeBase: 'Knowledge Base',
  },
  settings: {
    languageTitle: 'Language',
    languageDescription: 'Choose the language you would like to use OneCare in.',
    languageNeedsReview: 'In progress — some text will still appear in English.',
  },
} as const;

export type Messages = typeof en;
