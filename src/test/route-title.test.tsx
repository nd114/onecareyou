import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RouteTitle } from '@/components/layout/RouteTitle';
import { SEOHead } from '@/components/seo/SEOHead';

afterEach(cleanup);

function mount(path: string, page: React.ReactNode = <div>page</div>) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <RouteTitle />
        <Routes>
          <Route path="*" element={page} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('RouteTitle', () => {
  it('titles a signed-in screen that sets no title of its own', async () => {
    mount('/vitals');
    await waitFor(() => expect(document.title).toBe('Vitals | OneCare'));
  });

  it('keeps signed-in screens out of search indexes', async () => {
    mount('/health-vault');
    await waitFor(() =>
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex,nofollow',
      ),
    );
  });

  it('defers to a page that titles itself', async () => {
    mount('/dashboard', <SEOHead title="Something the page chose" />);
    await waitFor(() => expect(document.title).toBe('Something the page chose | OneCare'));
  });

  it('leaves a marketing page title alone', async () => {
    document.title = 'OneCare — Your Health, Connected';
    mount('/pricing');
    await new Promise((r) => setTimeout(r, 20));
    expect(document.title).toBe('OneCare — Your Health, Connected');
  });
});
