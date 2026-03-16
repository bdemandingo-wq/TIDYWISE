import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { RelatedArticles, allArticles } from "@/components/blog/RelatedArticles";
import { 
  ArrowRight, Calendar, Globe, Users, Zap, CheckCircle2,
  Clock, Smartphone, Bell, MousePointer, Menu, X
} from "lucide-react";
import { useState } from "react";

const benefits = [
  { icon: Globe, title: "Online Booking Portal", description: "Let clients book 24/7 from your branded booking page. Embed on your website or share the link." },
  { icon: Calendar, title: "Smart Scheduling", description: "Avoid double-bookings with real-time availability checks. Auto-assign cleaners based on location and skills." },
  { icon: Bell, title: "Instant Notifications", description: "Automatic confirmation emails and SMS when bookings are made, changed, or cancelled." },
  { icon: Smartphone, title: "Mobile-First Design", description: "Your booking page looks perfect on phones, tablets, and desktops. No app download required for clients." },
  { icon: Clock, title: "Buffer Time Management", description: "Set travel time between jobs. Never overlap appointments or leave your team rushing between locations." },
  { icon: MousePointer, title: "One-Click Rebooking", description: "Recurring clients rebook in seconds. Build loyalty with frictionless repeat scheduling." },
];

const features = [
  "Branded booking page", "Real-time availability", "Automatic confirmations",
  "Recurring bookings", "Buffer time settings", "Custom service menu",
  "Deposit collection", "Client self-service portal", "Team assignment",
  "Multi-location support", "Cancellation policies", "Waitlist management"
];

export default function BookingSoftware() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleStartFreeTrial = () => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/auth", { state: { mode: "signup" } });
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo 
        title="Online Booking Software for Cleaning Businesses"
        description="Let clients book online 24/7. Smart scheduling, automatic confirmations, and recurring bookings for cleaning companies. Start your free trial today."
        canonicalPath="/features/booking"
        ogImage="/images/tidywise-og.png"
        jsonLd={{
          "@type": "SoftwareApplication",
          "name": "TidyWise Booking Software",
          "applicationCategory": "BusinessApplication",
          "description": "Online booking software designed for cleaning businesses with smart scheduling and automated confirmations.",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "description": "60-day free trial" }
        }}
      />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <a href="/" className="flex items-center gap-2">
              <span className="font-bold text-xl text-foreground">TIDYWISE</span>
            </a>
            <div className="hidden md:flex items-center gap-8">
              <a href="/#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
              <a href="/blog" className="text-muted-foreground hover:text-foreground transition-colors">Blog</a>
              <Button variant="ghost" onClick={() => navigate("/login")}>Log In</Button>
              <Button onClick={handleStartFreeTrial}>Start Free Trial</Button>
            </div>
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-border">
              <div className="flex flex-col gap-4">
                <a href="/#features" className="text-muted-foreground hover:text-foreground">Features</a>
                <a href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</a>
                <a href="/blog" className="text-muted-foreground hover:text-foreground">Blog</a>
                <Button variant="ghost" className="justify-start" onClick={() => navigate("/login")}>Log In</Button>
                <Button onClick={handleStartFreeTrial}>Start Free Trial</Button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
            <Calendar className="h-4 w-4" />
            Booking Software
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
            Online Booking Software<br/>
            <span className="text-primary">for Cleaning Businesses</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Let your clients book online 24/7. Smart scheduling prevents double-bookings, automatic confirmations reduce no-shows, and recurring booking keeps regulars coming back. <strong>Fill your calendar without lifting the phone.</strong>
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-lg px-8 h-14" onClick={handleStartFreeTrial}>
              Start Free 60-Day Trial <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 h-14" onClick={() => navigate("/pricing")}>
              See Pricing
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-4">No credit card required · Free for 60 days</p>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-12">Why Cleaning Businesses Choose TidyWise for Booking</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((b, i) => (
              <div key={i} className="bg-card rounded-xl p-6 border border-border">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <b.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{b.title}</h3>
                <p className="text-muted-foreground">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Checklist */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-8">Everything You Need to Manage Bookings</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-left">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="text-foreground">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-primary/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">Ready to Fill Your Calendar?</h2>
          <p className="text-lg text-muted-foreground mb-8">Join hundreds of cleaning businesses using TidyWise to manage bookings. Start free, no credit card required.</p>
          <Button size="lg" className="text-lg px-8 h-14" onClick={handleStartFreeTrial}>
            Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Related Articles */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <RelatedArticles currentSlug="booking" articles={allArticles} />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} TidyWise. All rights reserved.</p>
      </footer>
    </div>
  );
}
