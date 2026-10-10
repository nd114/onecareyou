import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * First-party page analytics. Records the page path (ids masked, no query
 * string) and time spent — never what anyone types. Founder pages are skipped.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function maskPath(p: string) {
  return p.replace(UUID, ':id').replace(/\/\d{3,}(?=\/|$)/g, '/:id').slice(0, 200) || '/';
}

function stableId(store: Storage, key: string) {
  try {
    let v = store.getItem(key);
    if (!v) {
      v = crypto.randomUUID();
      store.setItem(key, v);
    }
    return v;
  } catch {
    return crypto.randomUUID();
  }
}

function device() {
  const w = window.innerWidth;
  return w < 768 ? 'Phone' : w < 1100 ? 'Tablet' : 'Desktop';
}

function browser() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Other';
}

export function PageViewTracker() {
  const { pathname } = useLocation();
  const current = useRef<{ path: string; start: number } | null>(null);
  const meta = useRef<{ referrer: string | null; utm: string | null } | null>(null);

  if (!meta.current) {
    let referrer: string | null = null;
    try {
      const host = document.referrer ? new URL(document.referrer).host : '';
      referrer = host && host !== window.location.host ? host : null;
    } catch { /* ignore */ }
    const utm = new URLSearchParams(window.location.search).get('utm_source');
    meta.current = { referrer, utm: utm ? utm.slice(0, 60) : null };
  }

  useEffect(() => {
    const flush = () => {
      const c = current.current;
      if (!c) return;
      current.current = null;
      if (c.path.startsWith('/admin')) return;
      void supabase.rpc('log_page_view', {
        _session_id: stableId(sessionStorage, 'oc_sid'),
        _visitor_id: stableId(localStorage, 'oc_vid'),
        _path: c.path,
        _duration_ms: Math.round(performance.now() - c.start),
        _referrer_host: meta.current?.referrer ?? undefined,
        _utm_source: meta.current?.utm ?? undefined,
        _device: device(),
        _browser: browser(),
        _timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })(),
      });
    };

    flush();
    current.current = { path: maskPath(pathname), start: performance.now() };

    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
      else if (!current.current) current.current = { path: maskPath(pathname), start: performance.now() };
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [pathname]);

  return null;
}
