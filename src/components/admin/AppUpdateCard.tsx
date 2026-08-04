import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCcw, Download, Check, AlertCircle, Smartphone } from 'lucide-react';
import { usePlatform } from '@/hooks/usePlatform';
import { openExternalUrl } from '@/lib/openExternalUrl';
import { APP_STORE_URL, compareVersions, fetchStoreVersion } from '@/lib/appVersion';

type Result =
  | { kind: 'update'; installed: string; store: string }
  | { kind: 'current'; installed: string }
  | { kind: 'ahead'; installed: string; store: string }
  | { kind: 'unknown'; message: string };

/**
 * "Check for updates" — native only.
 *
 * Not rendered at all on web: a refresh already loads the newest build there,
 * so a button offering to send someone to the App Store would be nonsense.
 *
 * Deliberately manual. No check on mount and none on tab open — this is a
 * network request on someone's mobile data, and nothing here is urgent enough
 * to spend it without being asked.
 */
export function AppUpdateCard() {
  const { isNative } = usePlatform();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  if (!isNative) return null;

  const check = async () => {
    setChecking(true);
    setResult(null);
    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      const installed = info.version;

      const store = await fetchStoreVersion();
      const order = compareVersions(installed, store.version);

      if (order === 'older') {
        setResult({ kind: 'update', installed, store: store.version });
      } else if (order === 'same') {
        setResult({ kind: 'current', installed });
      } else if (order === 'newer') {
        // Installed is ahead of what the store reports. Normal for a few hours
        // after a release — Apple's lookup is edge-cached — and also true on a
        // TestFlight or local build. Never an update prompt, and never
        // "up to date" either, because neither is honest here.
        setResult({ kind: 'ahead', installed, store: store.version });
      } else {
        setResult({
          kind: 'unknown',
          message: "Couldn't read the version numbers to compare them.",
        });
      }
    } catch (err) {
      // Offline, DNS failure, Apple 5xx, malformed body. Say nothing about
      // whether an update exists — claiming "you're up to date" when the check
      // never completed is the one outcome worse than showing nothing.
      console.error('[app-update] check failed:', err);
      setResult({
        kind: 'unknown',
        message: "Couldn't check right now. Try again when you're back online.",
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          App version
        </CardTitle>
        <CardDescription>
          See whether you're running the latest version of the TidyWise app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={check} disabled={checking} variant="outline" className="gap-2 min-h-[44px]">
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          {checking ? 'Checking…' : 'Check for updates'}
        </Button>

        {result?.kind === 'update' && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" />
              Version {result.store} is available
            </p>
            <p className="text-xs text-muted-foreground">You're on {result.installed}.</p>
            <Button
              size="sm"
              className="w-full gap-2 min-h-[44px]"
              onClick={() => openExternalUrl(APP_STORE_URL)}
            >
              <Download className="w-4 h-4" />
              Update in the App Store
            </Button>
          </div>
        )}

        {result?.kind === 'current' && (
          <div className="flex items-center gap-2 text-sm">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>You're up to date</span>
            <Badge variant="secondary" className="text-xs">{result.installed}</Badge>
          </div>
        )}

        {result?.kind === 'ahead' && (
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-sm font-medium">You're on {result.installed}</p>
            <p className="text-xs text-muted-foreground">
              The App Store still lists {result.store}. A new release can take a few hours to
              appear there — this isn't a problem.
            </p>
          </div>
        )}

        {result?.kind === 'unknown' && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <span>{result.message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
