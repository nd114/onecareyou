import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, X, Settings, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link } from 'react-router-dom';

const COOKIE_CONSENT_KEY = 'onecare_cookie_consent';

export interface CookiePreferences {
  necessary: boolean; // Always true, cannot be disabled
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
}

const defaultPreferences: CookiePreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  functional: true,
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

function writeCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function readConsent(): CookiePreferences | null {
  if (typeof window === 'undefined') return null;
  // Try localStorage first, then cookie fallback (preview iframes / strict
  // tracking-prevention browsers may wipe localStorage between visits).
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (raw) return JSON.parse(raw) as CookiePreferences;
  } catch {
    // ignore
  }
  try {
    const raw = readCookie(COOKIE_CONSENT_KEY);
    if (raw) return JSON.parse(raw) as CookiePreferences;
  } catch {
    // ignore
  }
  return null;
}

export function CookieConsentBanner() {
  // Lazy initial state from localStorage so the banner never re-appears after Accept,
  // and never flashes for users who already chose.
  const [preferences, setPreferences] = useState<CookiePreferences>(
    () => readConsent() ?? defaultPreferences
  );
  const [showBanner, setShowBanner] = useState<boolean>(() => readConsent() === null);
  const [showPreferences, setShowPreferences] = useState(false);

  // Keep multiple tabs in sync — if user accepts in one tab, hide everywhere.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== COOKIE_CONSENT_KEY) return;
      const next = readConsent();
      if (next) {
        setPreferences(next);
        setShowBanner(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const savePreferences = (prefs: CookiePreferences) => {
    const serialized = JSON.stringify(prefs);
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, serialized);
    } catch {
      // localStorage may be unavailable (private mode, partitioned storage)
    }
    // Cookie fallback so consent survives even if localStorage is wiped.
    writeCookie(COOKIE_CONSENT_KEY, serialized);
    setPreferences(prefs);
    setShowBanner(false);
    setShowPreferences(false);
  };

  const acceptAll = () => {
    savePreferences({
      necessary: true,
      analytics: true,
      marketing: true,
      functional: true,
    });
  };

  const acceptNecessary = () => {
    savePreferences({
      necessary: true,
      analytics: false,
      marketing: false,
      functional: true,
    });
  };

  const saveCustomPreferences = () => {
    savePreferences(preferences);
  };

  if (!showBanner && !showPreferences) return null;

  return (
    <>
      <AnimatePresence>
        {showBanner && !showPreferences && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[100] p-4 md:p-6"
          >
            <div className="mx-auto max-w-4xl">
              <div className="rounded-xl border border-border bg-card p-4 md:p-6 shadow-xl">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Cookie className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-foreground">We value your privacy</h3>
                      <p className="text-sm text-muted-foreground max-w-xl">
                        We use cookies to enhance your experience, analyze site traffic, and personalize content. 
                        You can customize your preferences or accept all cookies.{' '}
                        <Link to="/privacy" className="text-primary hover:underline">
                          Privacy Policy
                        </Link>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreferences(true)}
                      className="gap-1.5"
                    >
                      <Settings className="h-4 w-4" />
                      Customize
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={acceptNecessary}
                    >
                      Necessary Only
                    </Button>
                    <Button
                      size="sm"
                      onClick={acceptAll}
                      className="gradient-primary border-0 gap-1.5"
                    >
                      <Check className="h-4 w-4" />
                      Accept All
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={showPreferences} onOpenChange={setShowPreferences}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cookie className="h-5 w-5 text-primary" />
              Cookie Preferences
            </DialogTitle>
            <DialogDescription>
              Manage your cookie preferences. Some cookies are necessary for the site to function properly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Necessary Cookies - Always enabled */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="font-medium">Necessary Cookies</Label>
                <p className="text-xs text-muted-foreground">
                  Required for the site to function. Cannot be disabled.
                </p>
              </div>
              <Switch checked disabled className="data-[state=checked]:bg-primary" />
            </div>

            {/* Functional Cookies */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="font-medium">Functional Cookies</Label>
                <p className="text-xs text-muted-foreground">
                  Enable personalized features like saved preferences.
                </p>
              </div>
              <Switch
                checked={preferences.functional}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({ ...prev, functional: checked }))
                }
              />
            </div>

            {/* Analytics Cookies */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="font-medium">Analytics Cookies</Label>
                <p className="text-xs text-muted-foreground">
                  Help us understand how visitors interact with our site.
                </p>
              </div>
              <Switch
                checked={preferences.analytics}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({ ...prev, analytics: checked }))
                }
              />
            </div>

            {/* Marketing Cookies */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="font-medium">Marketing Cookies</Label>
                <p className="text-xs text-muted-foreground">
                  Used to deliver relevant advertisements to you.
                </p>
              </div>
              <Switch
                checked={preferences.marketing}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({ ...prev, marketing: checked }))
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPreferences(false)}>
              Cancel
            </Button>
            <Button onClick={saveCustomPreferences} className="gradient-primary border-0">
              Save Preferences
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Hook to check cookie consent status
export function useCookieConsent(): CookiePreferences | null {
  const [consent, setConsent] = useState<CookiePreferences | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (saved) {
      try {
        setConsent(JSON.parse(saved));
      } catch {
        setConsent(null);
      }
    }
  }, []);

  return consent;
}
