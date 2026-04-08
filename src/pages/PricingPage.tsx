import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';
import {
  CheckCircle2,
  Calendar,
  Users,
  CreditCard,
  BarChart3,
  MessageSquare,
  Target,
  Zap,
  Shield,
  Smartphone,
  Gift,
  Star,
} from 'lucide-react';

const allFeatures = [
  { icon: Calendar, label: 'Online booking system' },
  { icon: Users, label: 'Client CRM' },
  { icon: Zap, label: 'Team scheduling' },
  { icon: CreditCard, label: 'Automated payments & invoicing' },
  { icon: MessageSquare, label: 'Email & SMS notifications' },
  { icon: Smartphone, label: 'Mobile app access' },
  { icon: Target, label: 'Lead management & CRM' },
  { icon: BarChart3, label: 'Dashboard, reports & analytics' },
  { icon: Shield, label: 'Client portal with login' },
  { icon: Gift, label: 'Loyalty program management' },
  { icon: Star, label: 'AI business intelligence' },
];

export default function PricingPage() {
  return (
    <>
      <SEOHead
        title="Pricing | TidyWise – Free Cleaning Business Software"
        description="TidyWise is completely free. No credit card required. Sign up and start managing your cleaning business today."
      />

      <div className="min-h-screen bg-background">
        {/* Hero */}
        <section className="py-20 px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Free Forever
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Sign up and start managing your cleaning business today. No credit card required.
          </p>
          <Link to="/signup">
            <Button size="lg" className="text-lg px-8 py-6">
              Get Started — It's Free
            </Button>
          </Link>
        </section>

        {/* Features */}
        <section className="max-w-3xl mx-auto px-4 pb-20">
          <h2 className="text-2xl font-semibold text-foreground text-center mb-8">
            Everything included, no strings attached
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {allFeatures.map((f) => (
              <div key={f.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="text-foreground">{f.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 px-4 text-center bg-muted/30">
          <h2 className="text-2xl font-semibold text-foreground mb-4">
            Ready to grow your cleaning business?
          </h2>
          <Link to="/signup">
            <Button size="lg">Sign Up Free</Button>
          </Link>
        </section>
      </div>
    </>
  );
}
