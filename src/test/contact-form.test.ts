import { describe, it, expect } from 'vitest';
import {
  validateContactDraft,
  firstContactError,
  CONTACT_LIMITS,
  type ContactDraft,
} from '@/lib/contact-form';

const TYPES = ['general', 'support', 'clinician'];

const good: ContactDraft = {
  name: 'Alex Moreau',
  email: 'alex@example.com',
  inquiryType: 'general',
  subject: 'A question about sharing',
  message: 'How do I stop sharing with a clinician I no longer see?',
};

describe('validateContactDraft', () => {
  it('passes a filled-in form', () => {
    expect(validateContactDraft(good, TYPES)).toEqual({});
  });

  it('asks for every empty field at once, not one at a time', () => {
    const errors = validateContactDraft(
      { name: '  ', email: '', inquiryType: '', subject: ' ', message: '' },
      TYPES,
    );
    expect(Object.keys(errors).sort()).toEqual([
      'email',
      'inquiryType',
      'message',
      'name',
      'subject',
    ]);
  });

  it('catches the select the browser cannot check', () => {
    // "What is it about" is a Radix listbox, so `required` never applied.
    expect(validateContactDraft({ ...good, inquiryType: '' }, TYPES).inquiryType).toBeTruthy();
    expect(validateContactDraft({ ...good, inquiryType: 'made-up' }, TYPES).inquiryType).toBeTruthy();
  });

  it('rejects an address that is not one', () => {
    expect(validateContactDraft({ ...good, email: 'alex' }, TYPES).email).toBeTruthy();
    expect(validateContactDraft({ ...good, email: 'alex@example' }, TYPES).email).toBeTruthy();
    expect(validateContactDraft({ ...good, email: 'a@b.co' }, TYPES).email).toBeUndefined();
  });

  it('accepts the addresses people actually have', () => {
    for (const email of [
      'alex+onecare@example.com',
      'a.b-c_d@sub.domain.example.co.uk',
      "o'neill@example.org",
    ]) {
      expect(validateContactDraft({ ...good, email }, TYPES).email, email).toBeUndefined();
    }
  });

  it('holds the line the edge function holds', () => {
    const over = 'x'.repeat(CONTACT_LIMITS.message + 1);
    expect(validateContactDraft({ ...good, message: over }, TYPES).message).toBeTruthy();
  });
});

describe('firstContactError', () => {
  it('points at the topmost problem so the page scrolls up, not down', () => {
    const errors = validateContactDraft(
      { ...good, name: '', email: 'nope', subject: '' },
      TYPES,
    );
    expect(firstContactError(errors)).toBe('name');
  });

  it('is null when there is nothing wrong', () => {
    expect(firstContactError({})).toBeNull();
  });
});
