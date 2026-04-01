import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SEOHead } from '@/components/SEOHead';
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
  Smartphone,
} from 'lucide-react';

const includedFeatures = [
  { icon: Calendar, label: 'Online booking system' },
  { icon: Users, label: 'Client CRM' },
  { icon: Zap, label: 'Team scheduling' },
  { icon: CreditCard, label: 'Automated payments & invoicing' },
  { icon: MessageSquare, label: 'Email reminders and notifications' },
  { icon: Smartphone, label: 'Mobile app access' },
  { icon: Target, label: 'Lead management & CRM' },
  { icon: BarChart3, label: 'Dashboard & analytics' },
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
    q: 'Is there a free trial?',
    a: 'Yes, get started free with no credit card required. Your first 60 days are completely free.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Absolutely. No long-term contracts. Cancel with one click from your dashboard.',
  },
  {
    q: 'Do you offer support?',
    a: 'Yes, real support from real people. We\'re here to help you succeed.',
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
];

export default function PricingPage() {
  return (
    <>
      <Seo
        title="TidyWise Pricing | Cleaning Business Software Plans"
        description="Simple, transparent pricing for cleaning business owners. Start free and scale as you grow. No hidden fees."
        canonicalPath="/pricing"
        ogImage="/images/tidywise-og.png"
        jsonLd={[
          {
            "@type": "Product",
            "name": "TidyWise Pro",
            "description": "Complete cleaning business management software",
            "brand": { "@type": "Brand", "name": "TidyWise" },
            "offers": {
              "@type": "Offer",
              "price": "50.00",
              "priceCurrency": "USD",
              "priceValidUntil": "2027-12-31",
              "availability": "https://schema.org/InStock"
            }
          },
          {
            "@type": "FAQPage",
            "mainEntity": faqs.map(({ q, a }) => ({
              "@type": "Question",
              "name": q,
              "acceptedAnswer": { "@type": "Answer", "text": a }
            }))
          }
        ]}
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
              Simple Pricing for Cleaning Business Owners
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              No confusing tiers. No surprise fees. Just straightforward pricing that grows with your business.
            </p>
          </div>
        </section>

        {/* Pricing Card */}
        <section className="px-4 sm:px-6 lg:px-8 pb-16">
          <div className="max-w-lg mx-auto">
            <Card className="border-2 border-primary/30 shadow-lg shadow-primary/5 overflow-hidden">
              <div className="bg-primary/5 px-6 py-5 flex items-end justify-between">
                <div>
                  <h2 className="text-xl font-bold text-foreground">TidyWise Pro</h2>
                  <p className="text-sm text-muted-foreground">Complete cleaning business management</p>
                </div>
                <div className="text-right">
                  <span className="text-4xl font-bold text-foreground">$50</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
              </div>
              <CardContent className="p-6 space-y-6">
                <div className="bg-success/10 border border-success/20 rounded-lg p-4 flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground text-sm">Start with 60 days free</p>
                    <p className="text-xs text-muted-foreground">No payment required during trial. Cancel anytime.</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Everything included
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
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Why TidyWise */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-border bg-muted/30">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-foreground mb-4">Why Cleaning Businesses Choose TidyWise</h2>
            <p className="text-muted-foreground">
              Most cleaning software was built for general field service companies. TidyWise was built from the ground up for cleaning businesses — by someone who runs one. Every feature was designed with your daily workflow in mind.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-border bg-secondary/20">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-foreground text-center mb-10">
              Frequently Asked Questions
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
          <h2 className="text-2xl font-bold text-foreground mb-3">Start Your Free Trial Today</h2>
          <p className="text-muted-foreground mb-6">Join cleaning companies already using TidyWise.</p>
          <Button size="lg" className="gap-2" asChild>
            <Link to="/signup">
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>

        <footer className="border-t border-border py-8 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} TidyWise. All rights reserved.
          </p>
        </footer>
      </div>
    </>
  );
}
