import { describe, expect, it } from 'vitest';

import {
  AI_CLINICAL_NOTICE,
  AI_DISCLOSURE,
  stripModelDisclaimer,
} from '@/lib/ai-disclosure';

/**
 * The disclosure used to live in the chat's empty state and in a line the system
 * prompt asked the model to append. The first was on screen only while there
 * were no answers to disclaim; the second was the model's to remember. Neither
 * was a guarantee, which is what a medical disclaimer has to be.
 */
describe('what the app says about its assistant', () => {
  it('names the answer as AI and points at a licensed practitioner', () => {
    expect(AI_DISCLOSURE).toMatch(/AI-generated/);
    expect(AI_DISCLOSURE).toMatch(/not medical advice/i);
    expect(AI_DISCLOSURE).toMatch(/licensed practitioner/i);
  });

  it('says the same on a reply built from a drug label', () => {
    expect(AI_CLINICAL_NOTICE).toMatch(/AI-generated/);
    expect(AI_CLINICAL_NOTICE).toMatch(/doctor or pharmacist/i);
  });
});

describe('not saying it twice', () => {
  it('removes the sign-off the model was asked to add', () => {
    const reply =
      'Lisinopril can cause a dry cough.\n\n⚠️ General information, not medical advice — check with your healthcare provider.';
    expect(stripModelDisclaimer(reply)).toBe('Lisinopril can cause a dry cough.');
  });

  it('leaves a reply that never carried one alone', () => {
    expect(stripModelDisclaimer('Your next dose is at 8pm.')).toBe('Your next dose is at 8pm.');
  });

  it('does not eat the answer when the sign-off is the whole message', () => {
    // A reply that is nothing but the disclaimer would render as an empty
    // bubble; the caller needs to see that it emptied.
    expect(stripModelDisclaimer('⚠️ General information, not medical advice.')).toBe('');
  });

  it('closes the gap it leaves behind', () => {
    const reply = 'Line one.\n\n⚠️ General information, not medical advice.\n\nLine two.';
    expect(stripModelDisclaimer(reply)).toBe('Line one.\n\nLine two.');
  });
});
