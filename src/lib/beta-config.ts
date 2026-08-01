export const BETA = {
  whatsappUrl:
    'https://chat.whatsapp.com/GrZnHztezsm3s4AlDK4xRt?s=cl&p=a&ilr=1',
  callLengthMinutes: 30,
  discountMonths: 6,
  /**
   * Onboarding-call slots we are opening for the beta cohort.
   * Stored as absolute UTC instants — 10:00 EST/EDT on each date.
   * (August is EDT, UTC-4, so 10:00 local = 14:00 UTC.)
   */
  fixedSlots: [
    '2026-08-08T14:00:00Z',
    '2026-08-15T14:00:00Z',
    '2026-08-22T14:00:00Z',
  ] as const,
} as const;
