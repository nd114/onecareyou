import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { createSupabaseMock } from './support/supabase-mock';

/**
 * Every page component mounts without throwing.
 *
 * The cheapest test in the suite and the one most likely to catch what a manual
 * pass misses: a crash on a page nobody thought to open. The 906 assertions
 * before this covered logic and mounted nothing, so a component that throws on
 * first render — a hook called conditionally, `.map` on something that arrives
 * undefined, an import that moved — was invisible to all of them.
 *
 * Deliberately shallow: it asserts the page mounts, not that it is right.
 * Breadth here, depth in the journey tests.
 *
 * Pages are rendered directly rather than through the router. Mounting the
 * whole App per route spent its time in auth bootstrapping and route guards and
 * reported their timeouts as page failures, which is a slow way to test
 * something else.
 */

const { mock } = vi.hoisted(() => ({
  mock: { current: null as null | { client: unknown } },
}));

vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mock.current?.client;
  },
}));

const pages = import.meta.glob('../pages/*.tsx');

beforeEach(() => {
  mock.current = createSupabaseMock();
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds = [];
  });
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function Providers({ children }: { children: React.ReactNode }) {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { MemoryRouter } = await import('react-router-dom');
  const { HelmetProvider } = await import('react-helmet-async');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  // The real providers, not stubs: a page that crashes because a context is
  // shaped differently from what it expects is exactly the failure worth
  // catching, and a hand-written fake context would hide it.
  const { AuthProvider } = await import('@/contexts/AuthContext');
  const { ThemeProvider } = await import('@/contexts/ThemeContext');
  const { FamilyProvider } = await import('@/contexts/FamilyContext');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <MemoryRouter>
            <AuthProvider>
              <FamilyProvider>
                <TooltipProvider>{children}</TooltipProvider>
              </FamilyProvider>
            </AuthProvider>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

describe('every page component mounts', () => {
  for (const [path, load] of Object.entries(pages)) {
    const name = path.split('/').pop()!.replace('.tsx', '');

    it(`${name} renders without throwing`, async () => {
      const mod = (await load()) as { default?: React.ComponentType };
      const Page = mod.default;
      expect(Page, `${name} has no default export`).toBeTruthy();

      const Wrapper = await Providers({ children: <Page /> });
      // A page that throws on mount fails here; one that renders an error
      // boundary's fallback does not, which is the correct distinction.
      expect(() => render(Wrapper)).not.toThrow();
    });
  }
});
