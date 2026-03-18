import { useState, lazy, Suspense, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight,
  Menu,
  X,
  Check,
} from "lucide-react";
import { Seo } from "@/components/Seo";
import { TermsOfServiceDialog } from "@/components/legal/TermsOfServiceDialog";

const AIBusinessTools = lazy(() => import("@/components/landing/AIBusinessTools").then(m => ({ default: m.AIBusinessTools })));
const CompetitorComparison = lazy(() => import("@/components/landing/CompetitorComparison").then(m => ({ default: m.CompetitorComparison })));
const BlogSection = lazy(() => import("@/components/landing/BlogSection").then(m => ({ default: m.BlogSection })));
const InteractiveDemo = lazy(() => import("@/components/landing/InteractiveDemo").then(m => ({ default: m.InteractiveDemo })));

const SectionSkeleton = () => (
  <div className="py-24 px-4">
    <div className="max-w-5xl mx-auto">
      <div className="h-6 w-48 bg-muted rounded mx-auto mb-4" />
      <div className="h-4 w-80 bg-muted rounded mx-auto mb-16" />
      <div className="grid md:grid-cols-3 gap-px bg-border rounded-lg overflow-hidden">
        {[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted" />)}
      </div>
    </div>
  </div>
);

const features = [
  {
    title: "Scheduling",
    desc: "Auto-assign by location, skills, availability. Customers book online 24/7.",
  },
  {
    title: "Client Portal",
    desc: "Self-service bookings, cancellations, loyalty tracking. Tier-based policies.",
  },
  {
    title: "Payments",
    desc: "Stripe-powered invoicing, deposits, tips, and instant quote generation.",
  },
  {
    title: "Analytics",
    desc: "Churn predictions, revenue forecasting, engagement tracking. AI-powered.",
  },
  {
    title: "Mobile + GPS",
    desc: "Staff check-ins, on-my-way texts, photo documentation, real-time updates.",
  },
  {
    title: "Campaigns",
    desc: "Loyalty tiers, automated review requests, win-back sequences.",
  },
];

const capabilities = [
  "Online booking form", "Recurring bookings", "Staff portal & app", "Client portal",
  "GPS check-ins", "Quote generator", "Lead management", "Photo documentation",
  "Review requests", "Loyalty tiers", "P&L reports", "Revenue forecasting",
  "Multi-location", "SMS inbox", "Inventory tracking", "AI intelligence",
];

const testimonials = [
  {
    quote: "Bookings increased 40% in the first month. This platform transformed how we run our cleaning business.",
    author: "Sarah M.",
    role: "Sparkle Clean Co.",
  },
  {
    quote: "My team manages their own schedules and I can track everything in real-time. The staff portal is incredible.",
    author: "Michael R.",
    role: "Fresh Start Services",
  },
  {
    quote: "The automated invoicing alone saves me hours every week. Finally, software that understands cleaning businesses.",
    author: "Jennifer L.",
    role: "Elite Home Care",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobileMenuOpen]);

  const goSignup = () => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/signup");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo 
        title="Cleaning Business Software | TIDYWISE"
        description="Smart scheduling, automated payroll, CRM, GPS tracking & online booking for cleaning businesses. Start your 60-day free trial today."
        canonicalPath="/"
        ogImage="/images/tidywise-og.png"
        jsonLd={[
          {
            "@type": "Organization",
            "name": "TIDYWISE",
            "url": "https://www.jointidywise.com",
            "logo": "https://www.jointidywise.com/images/tidywise-logo.png",
            "sameAs": []
          },
          {
            "@type": "SoftwareApplication",
            "name": "TIDYWISE",
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "Web, iOS, Android",
            "offers": {
              "@type": "Offer",
              "price": "50.00",
              "priceCurrency": "USD",
              "priceValidUntil": "2027-12-31"
            },
            "description": "All-in-one cleaning business management software with scheduling, CRM, payments, and staff management."
          }
        ]}
      />

      {/* ── Nav ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] transition-colors duration-200 ${
        isScrolled ? 'bg-background/90 backdrop-blur-md border-b border-border' : ''
      }`}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="flex justify-between items-center h-14">
            <span className="font-semibold text-[15px] tracking-tight text-foreground">TIDYWISE</span>

            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#testimonials" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Customers</a>
              <button onClick={() => navigate("/pricing")} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Pricing</button>
              <button onClick={() => navigate("/portal")} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Client Portal</button>
              <button onClick={() => navigate("/staff/login")} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Staff Portal</button>
              <button onClick={() => navigate("/login")} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Log in</button>
              <button
                onClick={goSignup}
                className="h-8 px-3 rounded-md bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition-colors"
              >
                Start trial
              </button>
            </div>

            <button className="md:hidden p-1.5" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Menu">
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
              <button type="button" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={closeMobileMenu} aria-label="Close" />
              <div className="absolute left-4 right-4 top-[calc(3.75rem+env(safe-area-inset-top))] rounded-lg border border-border bg-background shadow-lg">
                <div className="flex flex-col p-1.5">
                  {[
                    { label: "Features", action: () => { closeMobileMenu(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); } },
                    { label: "Customers", action: () => { closeMobileMenu(); document.getElementById('testimonials')?.scrollIntoView({ behavior: 'smooth' }); } },
                    { label: "Pricing", action: () => { closeMobileMenu(); navigate("/pricing"); } },
                    { label: "Client Portal", action: () => { closeMobileMenu(); navigate("/portal"); } },
                    { label: "Staff Portal", action: () => { closeMobileMenu(); navigate("/staff/login"); } },
                    { label: "Log in", action: () => { closeMobileMenu(); navigate("/login"); } },
                  ].map(item => (
                    <button key={item.label} onClick={item.action} className="text-left px-3 py-2.5 text-[14px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors">
                      {item.label}
                    </button>
                  ))}
                  <div className="border-t border-border mt-1 pt-1.5 px-1.5 pb-1.5">
                    <button
                      onClick={() => { closeMobileMenu(); goSignup(); }}
                      className="w-full h-9 rounded-md bg-foreground text-background text-[14px] font-medium hover:bg-foreground/90 transition-colors"
                    >
                      Start free trial
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-[calc(7rem+env(safe-area-inset-top))] md:pt-[calc(11rem+env(safe-area-inset-top))] pb-20 md:pb-32 px-5 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-[2.25rem] sm:text-[3rem] lg:text-[3.75rem] font-bold leading-[1.08] tracking-[-0.03em] text-foreground mb-5">
            The operating system for your cleaning business
          </h1>
          
          <p className="text-[1.05rem] sm:text-[1.15rem] text-muted-foreground leading-relaxed max-w-xl mx-auto mb-8">
            Scheduling, payments, CRM, staff management, and client portal — purpose-built for cleaning companies. Not another generic tool.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={goSignup}
              className="h-11 px-6 rounded-lg bg-foreground text-background text-[14px] font-medium hover:bg-foreground/90 transition-colors inline-flex items-center justify-center gap-2"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
              className="h-11 px-6 rounded-lg border border-border text-foreground text-[14px] font-medium hover:bg-muted/50 transition-colors"
            >
              See how it works
            </button>
          </div>
          
          <p className="text-[13px] text-muted-foreground mt-5">
            60-day free trial · No credit card · $50/mo after
          </p>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="border-t border-border" />

      {/* ── Features ── */}
      <section id="features" className="py-20 md:py-28 px-5 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl mb-14">
            <h2 className="text-[1.75rem] sm:text-[2.25rem] font-bold tracking-[-0.02em] text-foreground mb-3">
              Everything in one place
            </h2>
            <p className="text-muted-foreground text-[15px] leading-relaxed">
              Replace your entire stack — booking widgets, invoicing apps, CRM, staff scheduling, GPS tracking — with one platform.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-lg overflow-hidden">
            {features.map((f) => (
              <div key={f.title} className="bg-background p-6 md:p-8">
                <h3 className="text-[15px] font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Capabilities grid */}
          <div className="mt-14 border border-border rounded-lg p-6 md:p-8">
            <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider mb-5">Included in every plan</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2.5">
              {capabilities.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-[13px] text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="border-t border-border" />

      {/* Interactive Demo */}
      <Suspense fallback={<SectionSkeleton />}>
        <InteractiveDemo />
      </Suspense>

      <div className="border-t border-border" />

      {/* Competitor Comparison */}
      <Suspense fallback={<SectionSkeleton />}>
        <CompetitorComparison />
      </Suspense>

      <div className="border-t border-border" />

      {/* AI Business Tools */}
      <Suspense fallback={<SectionSkeleton />}>
        <AIBusinessTools />
      </Suspense>

      <div className="border-t border-border" />

      {/* ── Scale section ── */}
      <section className="py-20 md:py-28 px-5 sm:px-6">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr,1fr] gap-16 items-start">
          <div>
            <h2 className="text-[1.75rem] sm:text-[2.25rem] font-bold tracking-[-0.02em] text-foreground mb-4">
              Built to scale with you
            </h2>
            <p className="text-muted-foreground text-[15px] leading-relaxed mb-8">
              From solo operator to a team of 50 — the same tools that power multi-million dollar cleaning operations.
            </p>
            <div className="space-y-3.5">
              {[
                "Online booking that runs itself",
                "Route optimization cuts 30% travel time",
                "Automated review collection for Google",
                "Professional quotes and invoices in seconds",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <div className="w-1 h-1 rounded-full bg-foreground mt-2 flex-shrink-0" />
                  <span className="text-[14px] text-foreground leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden">
            {[
              { value: '24/7', label: 'Online booking' },
              { value: '60 days', label: 'Free trial' },
              { value: '$50', label: 'Per month' },
              { value: 'Unlimited', label: 'Bookings' },
            ].map((stat) => (
              <div key={stat.label} className="bg-background p-6 text-center">
                <p className="text-2xl lg:text-3xl font-bold text-foreground mb-0.5 tracking-tight">{stat.value}</p>
                <p className="text-[13px] text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="border-t border-border" />

      {/* ── Testimonials ── */}
      <section id="testimonials" className="py-20 md:py-28 px-5 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl mb-14">
            <h2 className="text-[1.75rem] sm:text-[2.25rem] font-bold tracking-[-0.02em] text-foreground mb-3">
              Trusted by cleaning businesses
            </h2>
            <p className="text-muted-foreground text-[15px]">
              Real feedback from owners who switched to TIDYWISE.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-px bg-border rounded-lg overflow-hidden">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-background p-6 md:p-8 flex flex-col">
                <p className="text-[14px] text-foreground leading-relaxed flex-1 mb-6">"{t.quote}"</p>
                <div>
                  <p className="text-[13px] font-medium text-foreground">{t.author}</p>
                  <p className="text-[12px] text-muted-foreground">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="border-t border-border" />

      {/* Blog */}
      <Suspense fallback={<SectionSkeleton />}>
        <BlogSection />
      </Suspense>

      <div className="border-t border-border" />

      {/* ── CTA ── */}
      <section className="py-20 md:py-28 px-5 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-[1.75rem] sm:text-[2.25rem] font-bold tracking-[-0.02em] text-foreground mb-4">
            Start running your business, not chasing it
          </h2>
          <p className="text-muted-foreground text-[15px] mb-8">
            60-day free trial. No credit card required.
          </p>
          <button
            onClick={goSignup}
            className="h-11 px-6 rounded-lg bg-foreground text-background text-[14px] font-medium hover:bg-foreground/90 transition-colors inline-flex items-center justify-center gap-2"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-10 px-5 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <span className="text-[14px] font-semibold text-foreground block mb-3">TIDYWISE</span>
              <p className="text-[13px] text-muted-foreground leading-relaxed max-w-xs">
                Software for cleaning businesses that want to operate like real companies.
              </p>
            </div>
            <div>
              <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Product</p>
              <ul className="space-y-2">
                <li><a href="#features" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
                <li><button onClick={() => navigate("/pricing")} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Pricing</button></li>
                <li><a href="#testimonials" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Customers</a></li>
              </ul>
            </div>
            <div>
              <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Company</p>
              <ul className="space-y-2">
                <li><a href="mailto:support@tidywisecleaning.com" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Contact</a></li>
                <li><Link to="/privacy-policy" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Privacy</Link></li>
                <li><TermsOfServiceDialog><button className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Terms</button></TermsOfServiceDialog></li>
                <li><Link to="/delete-account" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Delete Account</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Compare</p>
              <ul className="space-y-2">
                <li><Link to="/compare/jobber" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">vs Jobber</Link></li>
                <li><Link to="/compare/booking-koala" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">vs Booking Koala</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-6 text-[12px] text-muted-foreground">
            © {new Date().getFullYear()} TIDYWISE
          </div>
        </div>
      </footer>
    </div>
  );
}
