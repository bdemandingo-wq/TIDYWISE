import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { RelatedArticles, allArticles } from "@/components/blog/RelatedArticles";
import { 
  ArrowRight, Users, Target, BarChart3, Zap, CheckCircle2,
  MessageSquare, FileText, Heart, TrendingUp, Menu, X
} from "lucide-react";
import { useState } from "react";

const benefits = [
  { icon: Users, title: "Complete Client Profiles", description: "Store contact info, property details, service history, notes, and payment methods in one place." },
  { icon: Target, title: "Lead Pipeline", description: "Track leads from inquiry to booked. Never lose a potential customer with automated follow-ups." },
  { icon: MessageSquare, title: "Automated Communication", description: "Send booking confirmations, reminders, and follow-ups automatically via SMS and email." },
  { icon: BarChart3, title: "Customer Analytics", description: "Track lifetime value, booking frequency, churn risk, and revenue per client." },
  { icon: Heart, title: "Loyalty Program", description: "Reward repeat customers with points and tier-based perks. Increase retention effortlessly." },
  { icon: TrendingUp, title: "Revenue Insights", description: "See which services are most popular, which clients are most profitable, and where to grow." },
];

const features = [
  "Client database", "Lead management", "Service history tracking",
  "Automated follow-ups", "Customer notes", "Property details",
  "Lifetime value tracking", "Churn prediction", "Referral tracking",
  "Loyalty points system", "Custom tags & segments", "Bulk messaging"
];

export default function CRMSoftware() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleStartFreeTrial = () => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/auth", { state: { mode: "signup" } });
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo 
        title="CRM for Cleaning Companies | Manage Clients & Jobs"
        description="Purpose-built CRM for cleaning businesses. Track clients, manage leads, automate follow-ups, and grow revenue. Free 60-day trial, no credit card required."
        canonicalPath="/features/crm"
        ogImage="/images/tidywise-og.png"
        jsonLd={{
          "@type": "SoftwareApplication",
          "name": "TidyWise CRM",
          "applicationCategory": "BusinessApplication",
          "description": "CRM software designed for cleaning companies to manage clients, track leads, and automate communication.",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "description": "60-day free trial" }
        }}
      />

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

      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
            <Users className="h-4 w-4" />
            CRM Software
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
            CRM for Cleaning Companies<br/>
            <span className="text-primary">Manage Clients & Jobs</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Stop losing clients to spreadsheets. Track every customer, automate follow-ups, manage leads, and grow your cleaning business with a CRM built specifically for your industry. <strong>Know every client by name, not just number.</strong>
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

      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-12">Why Cleaning Companies Need a Dedicated CRM</h2>
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

      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-8">Full-Featured CRM for Your Cleaning Business</h2>
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

      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-primary/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">Ready to Know Your Clients Better?</h2>
          <p className="text-lg text-muted-foreground mb-8">Join hundreds of cleaning businesses using TidyWise CRM. Start free, no credit card required.</p>
          <Button size="lg" className="text-lg px-8 h-14" onClick={handleStartFreeTrial}>
            Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <RelatedArticles currentSlug="crm" articles={allArticles} maxArticles={3} />
        </div>
      </section>

      <footer className="border-t border-border py-8 px-4 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} TidyWise. All rights reserved.</p>
      </footer>
    </div>
  );
}
