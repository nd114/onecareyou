import { describe, it, expect, beforeEach } from 'vitest';
import {
  chatStorageKey,
  clearChatStorage,
  purgeLegacyChatStorage,
  CHAT_STORAGE_PREFIX,
} from '@/lib/chat-storage';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

describe('AI chat storage is per account', () => {
  beforeEach(() => localStorage.clear());

  it('gives two accounts different keys for the same surface', () => {
    expect(chatStorageKey('assistant', ALICE)).not.toEqual(chatStorageKey('assistant', BOB));
  });

  it('refuses to persist a conversation with no signed-in account', () => {
    expect(chatStorageKey('assistant', undefined)).toBeNull();
    expect(chatStorageKey('assistant', null)).toBeNull();
  });

  it('keeps every key under the sweepable prefix', () => {
    expect(chatStorageKey('assistant', ALICE)!.startsWith(CHAT_STORAGE_PREFIX)).toBe(true);
  });

  it('sweeps every account transcript on sign-out', () => {
    localStorage.setItem(chatStorageKey('assistant', ALICE)!, '["alice"]');
    localStorage.setItem(chatStorageKey('clinician-assistant', BOB)!, '["bob"]');
    localStorage.setItem('unrelated.key', 'keep me');

    clearChatStorage();

    expect(localStorage.getItem(chatStorageKey('assistant', ALICE)!)).toBeNull();
    expect(localStorage.getItem(chatStorageKey('clinician-assistant', BOB)!)).toBeNull();
    expect(localStorage.getItem('unrelated.key')).toBe('keep me');
  });

  it('drops transcripts left under the old unscoped keys', () => {
    // What a browser holds today: one person's chat, readable by whoever signs
    // in next. This is the leak that was found in review.
    localStorage.setItem('onecare.assistant.chat.v1', '["someone elses health chat"]');
    localStorage.setItem('onecare.clinician-assistant.v1', '["patient names"]');
    localStorage.setItem('onecare.simple-mode.chat.v1', '["more of the same"]');

    purgeLegacyChatStorage();

    expect(localStorage.getItem('onecare.assistant.chat.v1')).toBeNull();
    expect(localStorage.getItem('onecare.clinician-assistant.v1')).toBeNull();
    expect(localStorage.getItem('onecare.simple-mode.chat.v1')).toBeNull();
  });
});
