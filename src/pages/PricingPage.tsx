import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Seo } from '@/components/Seo';
import {
  CheckCircle2,
  ArrowRight,
  Calendar,
  Users,
  CreditCard,
  BarChart3,
  MessageSquare,
  Target,
  Zap,
  Shield,
  Clock,
  Sparkles,
  Gift,
  Star,
} from 'lucide-react';

const includedFeatures = [
  { icon: Calendar, label: 'Unlimited bookings & scheduling' },
  { icon: Users, label: 'Team & staff management' },
  { icon: CreditCard, label: 'Payment processing & invoicing' },
  { icon: MessageSquare, label: 'SMS & email notifications' },
  { icon: Target, label: 'Lead management & CRM' },
  { icon: BarChart3, label: 'Dashboard & analytics' },
  { icon: Zap, label: 'Automated dispatching' },
  { icon: Shield, label: 'Client portal with login' },
];

const premiumFeatures = [
  { icon: BarChart3, label: 'Advanced reports & finance' },
  { icon: MessageSquare, label: 'SMS campaign automation' },
  { icon: Gift, label: 'Loyalty program management' },
  { icon: CreditCard, label: 'Payroll & expense tracking' },
  { icon: Star, label: 'AI business intelligence' },
  { icon: Shield, label: 'Priority support' },
];

const faqs = [
  {
    q: 'What happens after my free trial?',
    a: 'After 60 days, your plan converts to $50/month. You can cancel anytime before that—no charge.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel with one click from your dashboard. No contracts, no hidden fees.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit cards through Stripe. Your payment information is securely encrypted.',
  },
  {
    q: 'Is there a setup fee?',
    a: 'No. Sign up, import your pricing, and start booking in minutes—completely free for 60 days.',
  },
  {
    q: 'Do I need a credit card to start?',
    a: 'No credit card is required to start your trial. You only enter payment details when you choose to subscribe.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'TIDYWISE currently offers one all-inclusive plan so every business gets the full toolkit. We are working on additional tiers - stay tuned.',
  },
];

export default function PricingPage() {
  return (
    <>
      <Seo
        title="Pricing - TIDYWISE | $50/mo Cleaning Business Software"
        description="Simple, transparent pricing. Start free for 60 days. $50/month for unlimited bookings, team management, payments, and more."
      />

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <Link to="/" className="font-bold text-lg text-foreground">TIDYWISE</Link>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/signup">Start Free Trial</Link>
              </Button>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-3xl mx-auto">
            <Badge variant="secondary" className="mb-4 gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              60-day free trial · No credit card required
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 tracking-tight">
              One plan. Everything included.
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              No tiers to compare, no features locked behind upsells. Every cleaning business gets the full toolkit.
            </p>
          </div>
        </section>

        {/* Pricing Card */}
        <section className="px-4 sm:px-6 lg:px-8 pb-16">
          <div className="max-w-lg mx-auto">
            <Card className="border-2 border-primary/30 shadow-lg shadow-primary/5 overflow-hidden">
              <div className="bg-primary/5 px-6 py-5 flex items-end justify-between">
                <div>
                  <h2 className="text-xl font-bold text-foreground">TIDYWISE Pro</h2>
                  <p className="text-sm text-muted-foreground">Complete cleaning business management</p>
                </div>
                <div className="text-right">
                  <span className="text-4xl font-bold text-foreground">$50</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
              </div>
              <CardContent className="p-6 space-y-6">
                {/* Trial callout */}
                <div className="bg-success/10 border border-success/20 rounded-lg p-4 flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground text-sm">Start with 60 days free</p>
                    <p className="text-xs text-muted-foreground">No payment required during trial. Cancel anytime.</p>
                  </div>
                </div>

                {/* Core features */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Included from day one
                  </p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {includedFeatures.map(({ icon: Icon, label }) => (
                      <div key={label} className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm text-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Premium unlock */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Unlocked with subscription
                  </p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {premiumFeatures.map(({ icon: Icon, label }) => (
                      <div key={label} className="flex items-center gap-2.5">
                        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                        <span className="text-sm text-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Button size="lg" className="w-full gap-2" asChild>
                  <Link to="/signup">
                    Start Free Trial <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-border bg-secondary/20">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-foreground text-center mb-10">
              Frequently asked questions
            </h2>
            <div className="space-y-6">
              {faqs.map(({ q, a }) => (
                <div key={q}>
                  <h3 className="font-semibold text-foreground mb-1">{q}</h3>
                  <p className="text-sm text-muted-foreground">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 text-center border-t border-border">
          <h2 className="text-2xl font-bold text-foreground mb-3">Ready to streamline your cleaning business?</h2>
          <p className="text-muted-foreground mb-6">Join hundreds of cleaning companies already using TIDYWISE.</p>
          <Button size="lg" className="gap-2" asChild>
            <Link to="/signup">
              Start Your 60-Day Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>

        {/* Footer */}
        <footer className="border-t border-border py-8 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} TIDYWISE. All rights reserved.
          </p>
        </footer>
      </div>
    </>
  );
}
