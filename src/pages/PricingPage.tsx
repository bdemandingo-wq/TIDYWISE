import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SEOHead } from '@/components/SEOHead';
import { SiteFooter } from '@/components/SiteFooter';
import { useAuth } from '@/hooks/useAuth';
import { useLifetimeCounter } from '@/hooks/useLifetimeCounter';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Check,
  Sparkles,
  Zap,
  Crown,
  Settings as SettingsIcon,
  Megaphone,
  Loader2,
} from 'lucide-react';

type Interval = 'monthly' | 'yearly';

interface Tier {
  id: 'basic' | 'pro' | 'custom';
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyPrice: number;
  highlight?: boolean;
  features: string[];
}

const TIERS: Tier[] = [
  {
    id: 'basic',
    name: 'Basic',
    tagline: 'Run jobs, get paid, keep customers organized.',
    monthlyPrice: 49,
    yearlyPrice: 490,
    features: [
      'Online booking system',
      'Unlimited customers + CRM',
      'Smart team scheduler',
      'Estimates, invoices, Stripe payments',
      'Recurring bookings + jobs',
      'Staff management',
      'In-app messaging',
      'Works on any phone (web)',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Everything in Basic, plus the growth toolkit.',
    monthlyPrice: 97,
    yearlyPrice: 970,
    highlight: true,
    features: [
      'Everything in Basic',
      'Automations (reviews, reminders, win-back, promos)',
      'Email marketing campaigns',
      'AI Intelligence + Copilot',
      'Advanced reports + benchmarks',
      'GPS tracking + operations dashboard',
      'Payroll for cleaners',
      'Inventory + expenses',
      'Client portal',
      'Data import from other CRMs',
      'Lead pipeline',
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    tagline: 'Pro features + we do the heavy lifting for you.',
    monthlyPrice: 197,
    yearlyPrice: 1970,
    features: [
      'Everything in Pro',
      '1 done-for-you request per month',
      '• Build me a website + connect to TidyWise',
      '• Set up my SMS + email marketing',
      '• Import my customers from another CRM',
      '• Scripts & documents pack',
      '• Or request anything custom',
      'Priority support',
    ],
  },
];


function priceFor(tier: Tier, interval: Interval): { display: string; sub: string } {
  if (interval === 'yearly') {
    const monthlyEquivalent = Math.round((tier.yearlyPrice / 12) * 100) / 100;
    return {
      display: `$${monthlyEquivalent.toFixed(2).replace(/\.00$/, '')}`,
      sub: `/mo, billed $${tier.yearlyPrice}/yr · 2 months free`,
    };
  }
  return {
    display: `$${tier.monthlyPrice}`,
    sub: '/mo',
  };
}

export default function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [interval, setInterval] = useState<Interval>('monthly');
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const lifetime = useLifetimeCounter();
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [highlightedPlan, setHighlightedPlan] = useState<Tier['id'] | null>(null);
  const tierRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const spotsLeft = lifetime.spotsLeft;

  // Restore selected plan + interval after a return trip to Stripe
  // Checkout (cancel) or from /signup. We persist this in sessionStorage
  // so the user lands back on the same plan they were considering rather
  // than starting over from monthly/Basic.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('tw_pending_plan');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { plan?: string; interval?: string };
      if (parsed.interval === 'yearly' || parsed.interval === 'monthly') {
        setInterval(parsed.interval);
      }
      if (parsed.plan && ['basic', 'pro', 'custom'].includes(parsed.plan)) {
        const id = parsed.plan as Tier['id'];
        setHighlightedPlan(id);
        // Scroll the tier into view + clear the highlight after a moment.
        requestAnimationFrame(() => {
          tierRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        window.setTimeout(() => setHighlightedPlan(null), 2400);
      }
      sessionStorage.removeItem('tw_pending_plan');
    } catch {
      // sessionStorage unavailable — silent no-op.
    }
  }, []);


  // Iframe-safe navigation to Stripe Checkout. Stripe sends
  // X-Frame-Options: DENY, so a plain `window.location.href` inside an
  // embedded preview (Lovable iframe, in-app webview, etc.) blanks the
  // frame instead of navigating. Always try to break out to top first.
  function goToCheckout(url: string) {
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = url;
        return;
      }
    } catch {
      // Cross-origin top access blocked — fall through.
    }
    try {
      window.open(url, '_top');
      return;
    } catch {
      // ignore
    }
    window.location.href = url;
  }

  async function startSubscriptionCheckout(planId: Tier['id']) {
    // Persist the choice so that if the user cancels at Stripe or
    // bounces off /signup, the next /pricing render restores their
    // selection (interval + scroll-into-view of the same tier).
    try {
      sessionStorage.setItem(
        'tw_pending_plan',
        JSON.stringify({ plan: planId, interval }),
      );
    } catch {
      // sessionStorage unavailable — silent no-op.
    }
    if (!user) {
      navigate(`/signup?plan=${planId}&interval=${interval}`);
      return;
    }
    setCheckoutBusy(planId);
    try {
      const { data, error } = await supabase.functions.invoke('create-subscription', {
        body: { plan: planId, interval },
      });
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error('Checkout URL missing');
      goToCheckout(url);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not start checkout. Try again.',
      );
      setCheckoutBusy(null);
    }
  }


  async function startLifetimeCheckout() {
    if (!user) {
      navigate('/signup?plan=lifetime');
      return;
    }
    setCheckoutBusy('lifetime');
    try {
      const { data, error } = await supabase.functions.invoke('buy-lifetime', {
        body: {},
      });
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error('Checkout URL missing');
      goToCheckout(url);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Could not start the lifetime checkout. Try again.',
      );
      setCheckoutBusy(null);
    }
  }

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;
    try {
      const { error } = await (supabase as any)
        .from('lifetime_waitlist')
        .insert({ email: waitlistEmail.trim().toLowerCase() });
      if (error && !error.message.toLowerCase().includes('duplicate')) {
        throw error;
      }
      setWaitlistSubmitted(true);
      toast.success("You're on the list. We'll email you if a spot opens up.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join the waitlist.');
    }
  }

  return (
    <>
      <SEOHead
        title="Pricing | TidyWise — Cleaning Business Software"
        description="Four plans for cleaning businesses of every size. Basic $49, Pro $97, Custom $197, or a one-time Lifetime deal at $300 (50 spots only)."
        canonical="/pricing"
      />

      <main className="min-h-screen bg-background">
        <header className="border-b border-border/60">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link to="/" className="font-serif text-2xl tracking-tight">
              TIDYWISE
            </Link>
            <div className="flex items-center gap-2">
              {user ? (
                <Button asChild variant="ghost" size="sm">
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/login">Log in</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link to="/signup">Start free</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        <section className="max-w-4xl mx-auto px-4 pt-16 pb-10 text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Pricing
          </p>
          <h1 className="font-serif text-5xl md:text-6xl text-foreground mb-4">
            Pick the plan that fits your business.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Built for cleaning operators — solo, growing, or scaling. Switch any time.
            No setup fees. Every plan includes Stripe payments, mobile-friendly web access,
            and real human support.
          </p>

          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setInterval('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition ${
                interval === 'monthly'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval('yearly')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition flex items-center gap-2 ${
                interval === 'yearly'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Yearly
              <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                2 mo free
              </span>
            </button>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 pb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TIERS.map((tier) => {
              const price = priceFor(tier, interval);
              const isBusy = checkoutBusy === tier.id;
              return (
                <Card
                  key={tier.id}
                  ref={(el) => { tierRefs.current[tier.id] = el; }}
                  className={`p-7 flex flex-col transition-shadow ${
                    tier.highlight
                      ? 'border-primary/60 shadow-lg shadow-primary/10 relative'
                      : ''
                  } ${
                    highlightedPlan === tier.id
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : ''
                  }`}
                >

                  {tier.highlight && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 uppercase tracking-wider text-[10px]">
                      Most popular
                    </Badge>
                  )}

                  <div className="flex items-center gap-2 mb-1">
                    {tier.id === 'basic' && (
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                    )}
                    {tier.id === 'pro' && <Zap className="h-4 w-4 text-primary" />}
                    {tier.id === 'custom' && (
                      <SettingsIcon className="h-4 w-4 text-foreground" />
                    )}
                    <h3 className="font-serif text-2xl">{tier.name}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-5">{tier.tagline}</p>

                  <div className="mb-6">
                    <span className="text-4xl font-semibold tracking-tight">
                      {price.display}
                    </span>
                    <span className="text-sm text-muted-foreground ml-1">
                      {price.sub}
                    </span>
                  </div>

                  <Button
                    onClick={() => startSubscriptionCheckout(tier.id)}
                    disabled={isBusy}
                    variant={tier.highlight ? 'default' : 'outline'}
                    size="lg"
                    className="w-full mb-6"
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : user ? (
                      `Choose ${tier.name}`
                    ) : (
                      `Start ${tier.name}`
                    )}
                  </Button>

                  <ul className="space-y-2.5 text-sm">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        {feature.startsWith('•') ? (
                          <span className="text-muted-foreground pl-4">{feature}</span>
                        ) : (
                          <>
                            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span>{feature}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 py-16">
          <Card className="p-8 md:p-12 border-2 border-amber-500/40 bg-gradient-to-br from-amber-50/40 to-transparent dark:from-amber-950/20 relative overflow-hidden">
            <div className="absolute top-6 right-6">
              <Crown className="h-8 w-8 text-amber-500/60" />
            </div>

            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 mb-4 uppercase tracking-wider text-[10px]">
              Founding offer · 50 spots only
            </Badge>

            <h2 className="font-serif text-4xl md:text-5xl mb-3">
              Pay once. Use TidyWise forever.
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mb-8">
              One $300 payment locks in lifetime access to every Pro feature — including
              everything we ship in the future. No recurring bill, ever. Only 50 spots
              at launch.
            </p>

            <div className="grid md:grid-cols-2 gap-8 items-start">
              <div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-5xl font-bold tracking-tight">$300</span>
                    <span className="text-muted-foreground">one-time</span>
                  </div>
                  {lifetime.loading ? (
                    <p className="text-sm text-muted-foreground">Loading spots...</p>
                  ) : lifetime.soldOut ? (
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                      SOLD OUT — thank you. Waitlist below.
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-foreground">
                      <span className="text-amber-700 dark:text-amber-400 font-bold">
                        {spotsLeft} of {lifetime.total}
                      </span>{' '}
                      spots remaining
                    </p>
                  )}
                  {!lifetime.loading && !lifetime.soldOut && (
                    <div className="mt-3 h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all"
                        style={{
                          width: `${Math.min(100, (lifetime.sold / lifetime.total) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>

                {lifetime.soldOut ? (
                  waitlistSubmitted ? (
                    <p className="text-sm text-foreground">
                      ✓ You're on the waitlist.
                    </p>
                  ) : (
                    <form onSubmit={joinWaitlist} className="flex gap-2">
                      <Input
                        type="email"
                        required
                        placeholder="you@business.com"
                        value={waitlistEmail}
                        onChange={(e) => setWaitlistEmail(e.target.value)}
                        className="bg-background"
                      />
                      <Button type="submit">Join waitlist</Button>
                    </form>
                  )
                ) : (
                  <Button
                    onClick={startLifetimeCheckout}
                    disabled={checkoutBusy === 'lifetime'}
                    size="lg"
                    className="w-full md:w-auto bg-amber-600 hover:bg-amber-700"
                  >
                    {checkoutBusy === 'lifetime' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Crown className="h-4 w-4 mr-2" /> Claim a lifetime spot
                      </>
                    )}
                  </Button>
                )}
              </div>

              <ul className="space-y-2.5 text-sm">
                {[
                  'Every Pro feature, forever',
                  'All future features included free',
                  'No recurring bill — ever',
                  'Works on any device (web)',
                  'Email support',
                  'Excludes the Custom plan done-for-you requests',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </section>

        <section className="max-w-5xl mx-auto px-4 pb-16">
          <Card className="p-8 md:p-12 bg-muted/30 border-muted">
            <div className="flex items-start gap-4 mb-6">
              <div className="h-12 w-12 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0">
                <Megaphone className="h-6 w-6" />
              </div>
              <div>
                <Badge variant="secondary" className="mb-2">
                  Add-on · any paid plan
                </Badge>
                <h2 className="font-serif text-3xl mb-1">Ad management</h2>
                <p className="text-muted-foreground">
                  We run your ads. You take the calls. Bookings flow straight into
                  TidyWise.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  name: 'Google Search Ads',
                  body:
                    'Capture "house cleaner near me" searches in your zip code. We build the campaign, write the ads, monitor performance.',
                  guarantee: null,
                },
                {
                  name: 'Google Local Services Ads',
                  body:
                    'Top of Google with the green checkmark. We handle license verification, lead scoring, and weekly optimization.',
                  guarantee: null,
                },
                {
                  name: 'Facebook Ads',
                  body:
                    'Retargeting and lookalike audiences from your customer list. We write the copy, design the creative, run the campaign.',
                  guarantee: '10 leads in 30 days',
                },
              ].map((p) => (
                <div
                  key={p.name}
                  className={`rounded-lg bg-background p-5 border relative ${
                    p.guarantee ? 'border-emerald-500/50 shadow-sm shadow-emerald-500/10' : ''
                  }`}
                >
                  {p.guarantee && (
                    <Badge className="absolute -top-3 left-4 bg-emerald-600 text-white border-0 uppercase tracking-wider text-[10px]">
                      Guaranteed
                    </Badge>
                  )}
                  <h3 className="font-medium mb-2">{p.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{p.body}</p>
                  <p className="text-2xl font-semibold mb-2">
                    $400
                    <span className="text-sm font-normal text-muted-foreground">
                      /mo
                    </span>
                  </p>
                  {p.guarantee && (
                    <div className="mt-3 pt-3 border-t border-emerald-500/20">
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                          <strong>{p.guarantee}</strong> — or your next month is on us.
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-2 text-xs text-muted-foreground">
              <p>
                <strong className="text-foreground">About the Facebook guarantee:</strong>{' '}
                A "lead" = a form fill, phone call, or direct message from someone in your
                service area. Requires a minimum $500/mo ad budget paid to Facebook on your
                card. If we don't deliver 10 in your first 30 days, your second month of
                ad management is free while we tune.
              </p>
              <p>
                Auto-cancels if you cancel your TidyWise subscription. Ad spend (what you
                pay Google/Facebook) is separate and billed to your card on file with them.
              </p>
            </div>
          </Card>
        </section>

        <section className="max-w-3xl mx-auto px-4 pb-20">
          <h2 className="font-serif text-3xl mb-8 text-center">Common questions</h2>
          <div className="space-y-6">
            {[
              {
                q: 'Can I switch plans later?',
                a: 'Yes. Upgrade any time and the new features unlock instantly. Downgrade and the new plan kicks in at the end of your current billing month — no partial refunds, but no lost access either.',
              },
              {
                q: 'Is there a free trial?',
                a: 'No trial — you pay from day one, but you can cancel any time and you keep access until the end of the month you paid for.',
              },
              {
                q: 'What happens at the end of my paid month if I cancel?',
                a: 'You keep using TidyWise until the day your last paid month ends. After that your account drops to a free read-only state — your data stays, you can come back any time by resubscribing.',
              },
              {
                q: 'Does the lifetime plan include future features?',
                a: "Yes. Anything we ship later is included free, forever. The only thing the lifetime plan does NOT include is the Custom plan's done-for-you requests — those are a Custom-tier benefit.",
              },
              {
                q: 'Can I buy ad management without TidyWise?',
                a: 'No — ad management is only available to TidyWise subscribers because the leads, jobs, and follow-ups all flow through the CRM.',
              },
            ].map((item) => (
              <div key={item.q}>
                <h3 className="font-medium mb-1.5">{item.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <SiteFooter />
      </main>
    </>
  );
}
