/**
 * Said wherever a patient connects to a clinician or accepts a record a
 * clinician made. A clinician profile is self-made and nothing checks a
 * licence yet, so the app must not let "clinician" read as vetted. One
 * sentence, in one place, so every screen says the same thing.
 */
export const CLINICIAN_VERIFICATION_NOTICE =
  "OneCare doesn't verify clinicians' credentials, so only connect with people you know and trust.";

/** Where a patient adds a family member or caregiver: missed-dose alert contacts. */
export const CAREGIVER_CONTACTS_PATH = '/settings#alerts';
