import { describe, it, expect } from 'vitest';
import { isSearchShortcut } from '@/components/search/GlobalSearch';

/**
 * The search shortcut is global — it fires inside text boxes too — so what it
 * refuses matters as much as what it accepts. Taking a key combination that
 * belongs to something else breaks that thing for everybody on the page.
 */

const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('isSearchShortcut', () => {
  it('opens on Cmd+K and on Ctrl+K', () => {
    expect(isSearchShortcut(press({ key: 'k', metaKey: true }))).toBe(true);
    expect(isSearchShortcut(press({ key: 'k', ctrlKey: true }))).toBe(true);
  });

  it('still works with Caps Lock on', () => {
    expect(isSearchShortcut(press({ key: 'K', ctrlKey: true }))).toBe(true);
  });

  it('leaves Ctrl+Shift+K alone, which opens Firefox\'s web console', () => {
    expect(isSearchShortcut(press({ key: 'K', ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  it('leaves Alt combinations alone', () => {
    expect(isSearchShortcut(press({ key: 'k', ctrlKey: true, altKey: true }))).toBe(false);
  });

  it('does not toggle repeatedly while the keys are held down', () => {
    expect(isSearchShortcut(press({ key: 'k', metaKey: true, repeat: true }))).toBe(false);
  });

  it('ignores a bare K, so typing the letter never opens search', () => {
    expect(isSearchShortcut(press({ key: 'k' }))).toBe(false);
  });

  it('ignores other letters with the modifier', () => {
    expect(isSearchShortcut(press({ key: 'j', metaKey: true }))).toBe(false);
  });
});
