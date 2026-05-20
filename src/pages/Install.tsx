import { useEffect, useState } from 'react';
import { Smartphone, Share, Plus, MoreVertical, Check, Apple } from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Platform = 'ios' | 'android' | 'desktop' | 'unknown';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/macintosh|windows|linux/.test(ua)) return 'desktop';
  return 'unknown';
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Install() {
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead
        title="Install OneCare — Add to your home screen"
        description="Install OneCare on your phone or tablet for quick, app-like access to your health data."
        canonical="/install"
      />
      <Header />

      <main className="container max-w-2xl py-12 px-4 flex-1">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary mb-4">
            <Smartphone className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="font-display text-3xl font-bold mb-2">Install OneCare</h1>
          <p className="text-muted-foreground">
            Get the OneCare app on your home screen for one-tap access — no app store needed.
          </p>
        </div>

        {installed && (
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Check className="h-5 w-5 text-primary shrink-0" />
              <p className="text-sm">OneCare is installed. You can close this tab.</p>
            </CardContent>
          </Card>
        )}

        {platform === 'android' && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Android (Chrome / Edge)</CardTitle>
                <Badge variant="secondary">Recommended</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {installPrompt ? (
                <Button onClick={triggerInstall} className="gradient-primary border-0 w-full">
                  Install OneCare
                </Button>
              ) : (
                <ol className="space-y-3 text-sm">
                  <li className="flex gap-3">
                    <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">1</span>
                    <span>Tap the <MoreVertical className="inline h-4 w-4" /> menu in your browser's top-right.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">2</span>
                    <span>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">3</span>
                    <span>Confirm — OneCare appears on your home screen.</span>
                  </li>
                </ol>
              )}
            </CardContent>
          </Card>
        )}

        {platform === 'ios' && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><Apple className="h-4 w-4" /> iPhone / iPad (Safari)</CardTitle>
                <Badge variant="secondary">Recommended</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">1</span>
                  <span>Tap the <Share className="inline h-4 w-4" /> share icon at the bottom of Safari.</span>
                </li>
                <li className="flex gap-3">
                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">2</span>
                  <span>Scroll and choose <strong>Add to Home Screen</strong> <Plus className="inline h-4 w-4" />.</span>
                </li>
                <li className="flex gap-3">
                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">3</span>
                  <span>Tap <strong>Add</strong> — OneCare will appear on your home screen like any other app.</span>
                </li>
              </ol>
              <p className="text-xs text-muted-foreground mt-4">
                Tip: OneCare must be opened in Safari, not Chrome on iOS, for "Add to Home Screen" to work.
              </p>
            </CardContent>
          </Card>
        )}

        {platform === 'desktop' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Desktop (Chrome / Edge)</CardTitle>
            </CardHeader>
            <CardContent>
              {installPrompt ? (
                <Button onClick={triggerInstall} className="gradient-primary border-0 w-full">
                  Install OneCare
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Look for the install icon in your address bar, or open the browser menu and choose <strong>Install OneCare</strong>.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground space-y-2">
            <p><strong className="text-foreground">Why install?</strong> Launches in one tap, fills your full screen, and works for entering vitals and meds even when your network drops — entries sync automatically once you're back online.</p>
            <p><strong className="text-foreground">Coming soon:</strong> Native iOS and Android apps in the App Store and Google Play.</p>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
