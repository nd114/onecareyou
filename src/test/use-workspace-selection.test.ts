import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaceSelection } from '@/hooks/useWorkspaceSelection';

describe('useWorkspaceSelection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with nothing selected for a user who has never chosen', () => {
    const { result } = renderHook(() => useWorkspaceSelection('user-1'));
    expect(result.current.selectedWorkspaceId).toBeNull();
  });

  it('remembers a choice across a fresh mount, for that user', () => {
    const { result, rerender } = renderHook(({ userId }) => useWorkspaceSelection(userId), {
      initialProps: { userId: 'user-1' },
    });

    act(() => result.current.selectWorkspace('practice-a'));
    expect(result.current.selectedWorkspaceId).toBe('practice-a');

    // A later mount for the same user — the point of persisting at all.
    const { result: second } = renderHook(() => useWorkspaceSelection('user-1'));
    expect(second.current.selectedWorkspaceId).toBe('practice-a');

    rerender({ userId: 'user-1' });
  });

  it('never shows one account a different account\'s choice', () => {
    const { result: userA } = renderHook(() => useWorkspaceSelection('user-a'));
    act(() => userA.current.selectWorkspace('practice-a'));

    const { result: userB } = renderHook(() => useWorkspaceSelection('user-b'));
    expect(userB.current.selectedWorkspaceId).toBeNull();
  });

  it('has nothing to remember with no signed-in user', () => {
    const { result } = renderHook(() => useWorkspaceSelection(undefined));
    expect(result.current.selectedWorkspaceId).toBeNull();
    // Selecting with no user is a no-op, not a throw.
    expect(() => act(() => result.current.selectWorkspace('practice-a'))).not.toThrow();
  });

  it('reaches every mounted reader when one of them switches', () => {
    // The live shape: usePractice, useClinicianProfile and
    // useClinicianCapabilities each call this hook. Each used to hold its own
    // copy, so a switch through the selector updated the screens and left
    // `can(...)` answering for the workspace just left.
    const { result: selector } = renderHook(() => useWorkspaceSelection('user-1'));
    const { result: capabilities } = renderHook(() => useWorkspaceSelection('user-1'));

    act(() => selector.current.selectWorkspace('hospital'));
    expect(capabilities.current.selectedWorkspaceId).toBe('hospital');

    act(() => capabilities.current.selectWorkspace('own-practice'));
    expect(selector.current.selectedWorkspaceId).toBe('own-practice');
  });

  it('does not move another account when one account switches', () => {
    const { result: mine } = renderHook(() => useWorkspaceSelection('user-a'));
    const { result: theirs } = renderHook(() => useWorkspaceSelection('user-b'));
    act(() => mine.current.selectWorkspace('practice-a'));
    expect(theirs.current.selectedWorkspaceId).toBeNull();
  });

  it('answers on the first render, with no tick of "nothing chosen"', () => {
    localStorage.setItem('onecare:workspace:user-1', 'hospital');
    const seen: (string | null)[] = [];
    renderHook(() => {
      const { selectedWorkspaceId } = useWorkspaceSelection('user-1');
      seen.push(selectedWorkspaceId);
      return selectedWorkspaceId;
    });
    // Every render saw the stored choice — including the very first.
    expect(seen[0]).toBe('hospital');
    expect(seen.every((value) => value === 'hospital')).toBe(true);
  });
});

describe('useWorkspaceSelection when storage refuses writes', () => {
  it('still switches when reads work but writes throw', () => {
    // A full quota, or a private window that answers getItem and throws on
    // setItem. The switch landed in the memory fallback, but reads went to
    // storage first and kept answering with the workspace just left.
    localStorage.setItem('onecare:workspace:user-q', 'own-practice');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      const { result } = renderHook(() => useWorkspaceSelection('user-q'));
      act(() => result.current.selectWorkspace('hospital'));
      expect(result.current.selectedWorkspaceId).toBe('hospital');
    } finally {
      setItem.mockRestore();
    }
  });
});