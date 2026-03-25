import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
    })),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    functions: { invoke: vi.fn() },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.com/img.png' } }),
      })),
    },
  },
}));

// Mock AuthContext
const mockUser = { id: 'test-user-id', email: 'test@example.com' };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    session: { access_token: 'test-token' },
    profile: { subscription_tier: 'free' },
    loading: false,
    signOut: vi.fn(),
  })),
}));

// Mock react-query
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(({ queryFn, enabled }) => ({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
    useMutation: vi.fn(({ mutationFn }) => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    })),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
  };
});

describe('useSessionTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('exports a function hook', async () => {
    const mod = await import('@/hooks/useSessionTimeout');
    expect(mod.useSessionTimeout).toBeDefined();
    expect(typeof mod.useSessionTimeout).toBe('function');
  });
});

describe('useHipaaAuditLog', () => {
  it('returns logAccess function', async () => {
    const { useHipaaAuditLog } = await import('@/hooks/useHipaaAuditLog');
    const { result } = renderHook(() => useHipaaAuditLog());
    expect(result.current.logAccess).toBeDefined();
    expect(typeof result.current.logAccess).toBe('function');
  });

  it('logAccess does not throw without user', async () => {
    const { useAuth } = await import('@/contexts/AuthContext');
    (useAuth as any).mockReturnValueOnce({ user: null });
    
    const { useHipaaAuditLog } = await import('@/hooks/useHipaaAuditLog');
    const { result } = renderHook(() => useHipaaAuditLog());
    
    await expect(result.current.logAccess({
      action: 'test',
      resource_type: 'test',
    })).resolves.toBeUndefined();
  });
});

describe('useDashboardStats', () => {
  it('returns default stats when no data', async () => {
    const { useDashboardStats } = await import('@/hooks/useDashboardStats');
    const { result } = renderHook(() => useDashboardStats());
    
    expect(result.current.stats).toEqual({
      adherenceRate: 0,
      dailyDoses: 0,
      healthMarkers: 0,
      activeProviders: 0,
      weeklyAdherence: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useFamilyMembers', () => {
  it('exports hook', async () => {
    const mod = await import('@/hooks/useFamilyMembers');
    expect(mod.useFamilyMembers).toBeDefined();
  });
});

describe('useSubscription', () => {
  it('exports hook', async () => {
    const mod = await import('@/hooks/useSubscription');
    expect(mod.useSubscription).toBeDefined();
  });
});

describe('useMedications', () => {
  it('exports hook', async () => {
    const mod = await import('@/hooks/useMedications');
    expect(mod.useMedications).toBeDefined();
  });
});

describe('useVitals', () => {
  it('exports hook', async () => {
    const mod = await import('@/hooks/useVitals');
    expect(mod.useVitals).toBeDefined();
  });
});

describe('useProviderShares', () => {
  it('exports hook', async () => {
    const mod = await import('@/hooks/useProviderShares');
    expect(mod.useProviderShares).toBeDefined();
  });
});
