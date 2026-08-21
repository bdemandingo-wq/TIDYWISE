import { useSyncExternalStore, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Apple, Check, Download, Loader2, Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SiteFooter } from '@/components/SiteFooter';
import { SEOHead } from '@/components/SEOHead';
import { AddToDockDiagram } from '@/components/AddToDockDiagram';
import { APP_STORE_URL } from '@/lib/appVersion';
import { openExternalUrl } from '@/lib/openExternalUrl';
import {
  getInstallSnapshot,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt,
} from '@/lib/installPrompt';

/**
 * Where TidyWise can be installed, and a button that actually installs it.
 *
 * Its own page rather than a homepage section, because installing is a
 * POST-signup action: the manifest's start_url is /dashboard, so an
 * unauthenticated visitor who installs gets a shortcut to a login screen for an
 * account they do not have. The audience is existing customers adding a second
 * device, and this is a link you can send them.
 *
 * Android is deliberately absent. The platform does not exist yet, and a Play
 * Store link to nothing is worse than an omission — someone searching and
 * finding nothing reads as a dead product.
 */

type Platform = 'ios' | 'mac' | 'windows' | 'other';

/**
 * By user agent, NOT the usePlatform hook — that reads Capacitor.getPlatform(),
 * which returns 'web' for every browser including mobile Safari and so cannot
 * tell an iPhone from a Mac.
 *
 * iPadOS 13+ reports itself as a Mac; maxTouchPoints is what separates them.
 */
function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  const isTouchMac = /Mac/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || isTouchMac) return 'ios';
  if (/Mac/.test(ua)) return 'mac';
  if (/Win/.test(ua)) return 'windows';
  return 'other';
}

/** Safari never fires beforeinstallprompt, so it gets an instruction instead. */
function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
}

function DesktopAction({ platform }: { platform: Platform }) {
  const { canInstall, isInstalled } = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallSnapshot,
    getInstallSnapshot,
  );
  const [busy, setBusy] = useState(false);

  if (isInstalled) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-success" />
        Already installed on this device.
      </p>
    );
  }

  // The button appears only when the browser has actually offered an install.
  // Chrome fires beforeinstallprompt exclusively when the app is genuinely
  // installable, which makes the event itself the honest signal — better than
  // guessing from the user agent and rendering a button that does nothing.
  if (canInstall) {
    return (
      <Button
        className="gap-2"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await promptInstall();
          setBusy(false);
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Install TidyWise
      </Button>
    );
  }

  if (isSafari()) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">
          In Safari, choose <span className="font-medium text-foreground">File → Add to Dock</span>.
          Requires macOS Sonoma or later.
        </p>
        {/*
          Safari only — Chrome and Edge have the Install button above and never
          reach this branch. Narrowed to 'mac' on top of that, because this
          card is visible on every device: mobile Safari also passes
          isSafari(), and a picture of a macOS menu bar is noise on a phone
          that has no menu bar to look at. The sentence above still shows
          there, and it already says "macOS Sonoma or later", so nothing is
          lost by keeping the drawing off it.
        */}
        {platform === 'mac' && <AddToDockDiagram />}
      </div>
    );
  }

  // Chromium browser, no prompt captured: either already installed through the
  // browser menu, or the criteria were not met. Saying "open it in Chrome" to
  // someone already in Chrome would be nonsense, so this stays vague rather
  // than wrong.
  return (
    <p className="text-sm text-muted-foreground">
      Your browser hasn't offered an install for this site. Chrome and Edge on macOS
      and Windows support it — look for the install icon in the address bar.
    </p>
  );
}

function PlatformCard({
  icon, title, blurb, children, highlighted,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  children: React.ReactNode;
  highlighted: boolean;
}) {
  return (
    <Card className={highlighted ? 'border-primary shadow-lg' : undefined}>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-muted">{icon}</div>
          <div>
            <h2 className="font-semibold">{title}</h2>
            {highlighted && (
              <p className="text-xs text-primary font-medium">You're on this now</p>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{blurb}</p>
        <div className="pt-1">{children}</div>
      </CardContent>
    </Card>
  );
}

export default function GetTheAppPage() {
  // Read once per mount. Nothing here changes without a navigation, and
  // re-deriving it on every render would only invite inconsistency.
  const [platform] = useState<Platform>(detectPlatform);
  const [standalone] = useState<boolean>(isStandalone);

  /*
    The visitor's own platform leads, but every option stays visible and in the
    same order regardless — people install on a different device than the one
    they are browsing on, and the whole point of this page is that it can be
    sent to a phone.
  */
  const cards = [
    {
      key: 'ios',
      match: platform === 'ios',
      node: (
        <PlatformCard
          icon={<Smartphone className="h-5 w-5" />}
          title="iPhone & iPad"
          blurb="The TidyWise app on the App Store. Jobs, schedule and customers in your pocket."
          highlighted={platform === 'ios'}
        >
          <Button asChild variant={platform === 'ios' ? 'default' : 'outline'} className="gap-2">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                /*
                  Still an anchor, not a button. `target="_blank"` is silently
                  ignored inside the iOS WKWebView — no window, no error, the
                  control just looks dead (the exact failure openExternalUrl
                  exists to fix), so native has to go through the Capacitor
                  Browser plugin. But on the web the anchor already works, and
                  an anchor is what this page is FOR: cmd-click, open in new
                  tab, and copy-link-address all matter on a page whose job is
                  handing someone a link. So intercept only where the default
                  is broken, and leave the browser alone everywhere else.
                */
                if (!Capacitor.isNativePlatform()) return;
                e.preventDefault();
                void openExternalUrl(APP_STORE_URL);
              }}
            >
              <Apple className="h-4 w-4" />
              Get it on the App Store
            </a>
          </Button>
        </PlatformCard>
      ),
    },
    {
      key: 'desktop',
      match: platform === 'mac' || platform === 'windows',
      node: (
        <PlatformCard
          icon={<Monitor className="h-5 w-5" />}
          title="Mac & Windows"
          blurb="Install TidyWise as a desktop app — its own window and dock icon, no browser tabs."
          highlighted={platform === 'mac' || platform === 'windows'}
        >
          <DesktopAction platform={platform} />
        </PlatformCard>
      ),
    },
    {
      key: 'web',
      match: platform === 'other',
      node: (
        <PlatformCard
          icon={<Check className="h-5 w-5" />}
          title="Any browser"
          blurb="TidyWise runs in the browser with nothing to install. Everything works the same."
          highlighted={platform === 'other'}
        >
          <p className="text-sm text-muted-foreground">
            {standalone
              ? "You're using the installed app right now."
              : 'Nothing to do — you’re already using it.'}
          </p>
        </PlatformCard>
      ),
    },
  ];

  const ordered = [...cards].sort((a, b) => Number(b.match) - Number(a.match));

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <SEOHead
        title="Get the TidyWise app | iPhone, iPad, Mac & Windows"
        description="Install TidyWise on your iPhone, iPad, Mac or Windows desktop. Scheduling, CRM, payroll and invoicing for cleaning businesses."
        canonical="/get-the-app"
      />

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-16 sm:py-24">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Get TidyWise</h1>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            Same account, same data, on whichever device you're working from.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {ordered.map((c) => <div key={c.key}>{c.node}</div>)}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-10">
          You'll need a TidyWise account to sign in. Installing does not create one.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
