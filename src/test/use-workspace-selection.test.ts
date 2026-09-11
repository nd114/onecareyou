import { describe, it, expect, beforeEach } from 'vitest';
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
});
