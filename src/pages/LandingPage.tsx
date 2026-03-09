import { useState, lazy, Suspense, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Calendar, 
  Users, 
  CreditCard, 
  BarChart3, 
  Smartphone, 
  Bell, 
  Shield, 
  Zap,
  CheckCircle2,
  ArrowRight,
  Star,
  Sparkles,
  Menu,
  X,
  Play,
  ChevronRight,
  XCircle,
  Bot,
  MessageSquare,
  ClipboardList,
  TrendingUp,
  UserCheck,
  Globe,
  Clock,
  DollarSign,
} from "lucide-react";
import { Seo } from "@/components/Seo";
import { TermsOfServiceDialog } from "@/components/legal/TermsOfServiceDialog";

// Lazy load below-the-fold heavy components for better LCP
const CompetitorComparison = lazy(() => import("@/components/landing/CompetitorComparison").then(m => ({ default: m.CompetitorComparison })));
const BlogSection = lazy(() => import("@/components/landing/BlogSection").then(m => ({ default: m.BlogSection })));
const InteractiveDemo = lazy(() => import("@/components/landing/InteractiveDemo").then(m => ({ default: m.InteractiveDemo })));

// Lightweight skeleton for lazy sections
const SectionSkeleton = () => (
  <div className="py-16 px-4 animate-pulse">
    <div className="max-w-7xl mx-auto">
      <div className="h-8 w-64 bg-muted rounded-lg mx-auto mb-4" />
      <div className="h-4 w-96 bg-muted rounded mx-auto mb-12" />
      <div className="grid md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-48 bg-muted rounded-2xl" />
        ))}
      </div>
    </div>
  </div>
);

// Scroll reveal hook
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

const testimonials = [
  {
    quote: "This platform transformed how we run our cleaning business. Bookings increased 40% in the first month!",
    author: "Sarah M.",
    role: "Owner, Sparkle Clean Co.",
    rating: 5,
    avatar: "SM"
  },
  {
    quote: "The staff portal is amazing. My team can manage their own schedules and I can track everything in real-time.",
    author: "Michael R.",
    role: "Founder, Fresh Start Services",
    rating: 5,
    avatar: "MR"
  },
  {
    quote: "Finally, a platform that understands cleaning businesses. The automated invoicing alone saves me hours every week.",
    author: "Jennifer L.",
    role: "CEO, Elite Home Care",
    rating: 5,
    avatar: "JL"
  },
  {
    quote: "The client portal is a game changer. My customers love being able to see their upcoming cleans and pay online. It feels so professional.",
    author: "Amanda K.",
    role: "Owner, Fresh & Clean LLC",
    rating: 5,
    avatar: "AK"
  },
  {
    quote: "I was using 4 different apps before. Now it's just TIDYWISE. My admin time went from 10 hours a week to under 2.",
    author: "Daniel P.",
    role: "Founder, PristineHome",
    rating: 5,
    avatar: "DP"
  },
];

const painPoints = [
  "Juggling texts, calls, and DMs to schedule cleaners",
  "Chasing clients for payment after every job",
  "Not knowing which jobs are profitable vs. losing money",
  "No-shows and last-minute cancellations killing your day",
];

const solutionFeatures = [
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "Drag-and-drop calendar with real-time cleaner availability. No double-bookings, ever.",
    link: "/features/scheduling-software",
  },
  {
    icon: CreditCard,
    title: "Instant Payments",
    description: "Stripe-powered invoicing sent automatically after every job. Get paid faster.",
    link: "/features/payment-processing",
  },
  {
    icon: Users,
    title: "Staff Portal",
    description: "Cleaners see their jobs, check in/out, upload photos, and manage availability from their phone.",
    link: "/features/automated-dispatching",
  },
  {
    icon: Bot,
    title: "AI Business Intelligence",
    description: "Know which services are most profitable, which clients are at churn risk, and where to grow.",
    link: "/features/quote-software",
  },
  {
    icon: MessageSquare,
    title: "SMS & Email Automation",
    description: "Booking confirmations, reminders, review requests — all sent automatically.",
    link: "/features/sms-notifications",
  },
  {
    icon: TrendingUp,
    title: "Full CRM & Lead Pipeline",
    description: "Track leads from first inquiry to loyal recurring client. Never let a lead slip away.",
    link: "/features/invoicing-software",
  },
];

const featureChecklist = [
  "Online booking form", "Recurring bookings", "Staff portal & app",
  "Client portal", "GPS check-ins", "Quote generator",
  "Lead management", "Photo documentation", "Review requests",
  "Loyalty tiers & rewards", "P&L reports", "Revenue forecasting",
  "Multi-location", "Demo/Test Mode", "In-App SMS inbox",
  "Inventory tracking", "Client self-cancellation", "Activity analytics", "AI intelligence"
];

// Mini revenue chart using inline SVG for lightweight hero
function MiniRevenueChart() {
  const bars = [35, 52, 44, 68, 58, 78, 72];
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <div className="flex items-end gap-1.5 h-16">
      {bars.map((h, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <div
            className="w-full rounded-t bg-gradient-to-t from-primary to-primary/60 transition-all duration-500"
            style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }}
          />
          <span className="text-[10px] text-muted-foreground">{days[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [showExitPopup, setShowExitPopup] = useState(false);
  const [testimonialIdx, setTestimonialIdx] = useState(0);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Scroll reveal refs
  const problemReveal = useScrollReveal();
  const solutionReveal = useScrollReveal();
  const statsReveal = useScrollReveal();
  const testimonialsReveal = useScrollReveal();

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setIsScrolled(y > 20);
      setShowStickyHeader(y > 600);
      
      // Scroll-triggered popup at 70%
      const scrollPercent = y / (document.documentElement.scrollHeight - window.innerHeight);
      if (scrollPercent > 0.7 && !sessionStorage.getItem('exitPopupDismissed')) {
        setShowExitPopup(true);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Prevent the page behind the mobile menu from scrolling
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileMenuOpen]);

  const handleGetStarted = useCallback(() => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/signup");
  }, [navigate]);

  const dismissExitPopup = () => {
    setShowExitPopup(false);
    sessionStorage.setItem('exitPopupDismissed', 'true');
  };

  // Testimonial auto-rotate
  useEffect(() => {
    const timer = setInterval(() => {
      setTestimonialIdx(prev => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Seo 
        title="Cleaning Business Software | TIDYWISE"
        description="Run your entire cleaning business from one app. Smart scheduling, automated payments, CRM, staff portal & AI insights. Free for 60 days."
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
            "url": "https://www.jointidywise.com",
            "description": "Complete business management software for cleaning companies. Includes scheduling, payments, CRM, staff management, and AI insights.",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD",
              "description": "60-day free trial, then $50/month"
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.9",
              "reviewCount": "100",
              "bestRating": "5"
            },
            "author": {
              "@type": "Organization",
              "name": "TIDYWISE",
              "url": "https://www.jointidywise.com"
            }
          }
        ]}
      />

      {/* ========== STICKY HEADER CTA (appears on scroll) ========== */}
      <div className={`fixed top-0 left-0 right-0 z-[70] bg-primary text-primary-foreground transition-all duration-300 ${
        showStickyHeader && !mobileMenuOpen ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}>
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <span className="font-bold text-sm">TIDYWISE</span>
          <span className="hidden sm:block text-sm text-primary-foreground/80">Run your cleaning business smarter.</span>
          <Button size="sm" variant="secondary" onClick={handleGetStarted} className="text-xs font-semibold">
            Start Free Trial <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* ========== NAVIGATION ========== */}
      <nav className={`fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] transition-all duration-300 ${
        isScrolled 
          ? 'bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm' 
          : 'bg-transparent'
      } ${showStickyHeader ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 md:h-18">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl md:text-2xl text-foreground tracking-tight">TIDYWISE</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6 lg:gap-8">
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">Features</a>
              <a href="#blog" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">Blog</a>
              <a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">Testimonials</a>
              <Button variant="ghost" onClick={() => navigate("/pricing")} className="text-sm">Pricing</Button>
              <Button variant="ghost" onClick={() => navigate("/portal")} className="text-sm">Client Portal</Button>
              <Button variant="ghost" onClick={() => navigate("/staff/login")} className="text-sm">Staff Portal</Button>
              <Button variant="ghost" onClick={() => navigate("/login")} className="text-sm">Log In</Button>
              <Button variant="premium" onClick={() => navigate("/signup")} className="text-sm">
                Start Free Trial
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            {/* Mobile menu button */}
            <button 
              className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen ? (
            <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Mobile menu">
              <button type="button" className="absolute inset-0 bg-background/60 backdrop-blur-sm" aria-label="Close menu" onClick={closeMobileMenu} />
              <div className="absolute left-3 right-3 top-[calc(4.25rem+env(safe-area-inset-top))]">
                <div className="rounded-2xl border border-border bg-background shadow-lg">
                  <div className="flex flex-col gap-1 p-2">
                    <a href="#features" onClick={closeMobileMenu} className="px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all">Features</a>
                    <a href="#blog" onClick={closeMobileMenu} className="px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all">Blog</a>
                    <a href="#testimonials" onClick={closeMobileMenu} className="px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all">Testimonials</a>
                    <Button variant="ghost" className="justify-start" onClick={() => { closeMobileMenu(); navigate("/pricing"); }}>Pricing</Button>
                    <Button variant="ghost" className="justify-start" onClick={() => { closeMobileMenu(); navigate("/portal"); }}>Client Portal</Button>
                    <Button variant="ghost" className="justify-start" onClick={() => { closeMobileMenu(); navigate("/staff/login"); }}>Staff Portal</Button>
                    <Button variant="ghost" className="justify-start" onClick={() => { closeMobileMenu(); navigate("/login"); }}>Log In</Button>
                    <Button variant="premium" className="mt-1" onClick={() => { closeMobileMenu(); navigate("/signup"); }}>
                      Start Free Trial <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </nav>

      {/* ========== HERO SECTION ========== */}
      <section className="relative pt-[calc(6.5rem+env(safe-area-inset-top))] md:pt-[calc(8.5rem+env(safe-area-inset-top))] pb-8 md:pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Animated gradient background */}
        <div className="hero-gradient-bg" />
        <div className="absolute top-40 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />

        <div className="max-w-7xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left column */}
            <div className="text-center lg:text-left animate-fade-up">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 backdrop-blur-sm rounded-full text-primary text-sm font-medium mb-5 border border-primary/20">
                <span>🧹</span>
                <span>Built for Cleaning Businesses</span>
                <ChevronRight className="h-4 w-4" />
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-foreground leading-[1.1] mb-6 tracking-tight">
                Run Your Entire Cleaning Business{" "}
                <span className="text-gradient-hero">From One App</span>
              </h1>
              
              <p className="text-lg sm:text-xl text-muted-foreground mb-6 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Stop juggling spreadsheets, group chats, and paper invoices. TIDYWISE gives your cleaning company a complete operating system — bookings, staff, payments, and AI insights in one place.
              </p>

              {/* Social proof line */}
              <div className="flex items-center gap-2 justify-center lg:justify-start mb-6">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">Trusted by 100+ cleaning businesses across the US</span>
              </div>

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto lg:mx-0">
                <Button 
                  size="xl" 
                  variant="premium"
                  onClick={handleGetStarted}
                  className="group flex-1 sm:flex-none"
                >
                  Start Free — 60 Days No Credit Card
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button 
                  size="xl" 
                  variant="outline"
                  onClick={() => {
                    const demoSection = document.getElementById('demo');
                    if (demoSection) demoSection.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="gap-2"
                >
                  <Play className="h-5 w-5" />
                  Watch 2-Min Demo
                </Button>
              </div>
              
              {/* Trust signals */}
              <div className="flex flex-wrap items-center gap-4 mt-5 justify-center lg:justify-start text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  No credit card required
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  60-day free trial
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Cancel anytime
                </span>
              </div>
            </div>

            {/* Right column — Dashboard mockup */}
            <div className="relative animate-fade-up" style={{ animationDelay: '0.2s' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-3xl blur-2xl transform scale-95" />
              
              <Card variant="glass" className="relative rounded-2xl overflow-hidden border-white/10">
                {/* Browser chrome */}
                <div className="bg-sidebar/95 backdrop-blur-sm p-4 flex items-center gap-3 border-b border-white/10">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-destructive/80" />
                    <div className="w-3 h-3 rounded-full bg-warning/80" />
                    <div className="w-3 h-3 rounded-full bg-success/80" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-sidebar-accent/50 rounded-lg px-4 py-1.5 text-sidebar-foreground/50 text-sm">
                      app.tidywise.com/dashboard
                    </div>
                  </div>
                </div>
                
                {/* Dashboard content */}
                <div className="p-6 space-y-4 bg-card/95 backdrop-blur-sm">
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Today's Bookings", value: "12", color: 'text-foreground' },
                      { label: 'Revenue', value: '$2,450', color: 'text-success' },
                      { label: 'Cleaners', value: '8', color: 'text-accent' },
                    ].map((stat, i) => (
                      <div key={i} className="bg-secondary/80 rounded-xl p-4">
                        <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                        <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Mini booking card */}
                  <div className="flex items-center gap-3 bg-secondary/50 rounded-xl p-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">Deep Clean — Sarah M.</p>
                      <p className="text-xs text-muted-foreground">2:00 PM · 123 Main St</p>
                    </div>
                    <div className="px-2.5 py-1 rounded-full bg-success/10 text-success text-xs font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Confirmed
                    </div>
                  </div>

                  {/* Mini revenue chart */}
                  <div className="bg-secondary/50 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-medium text-foreground">Weekly Revenue</span>
                      <span className="text-xs text-success font-medium">+18% ↑</span>
                    </div>
                    <MiniRevenueChart />
                  </div>
                </div>
              </Card>

              {/* Floating elements */}
              <div className="absolute -right-4 top-1/4 bg-success text-success-foreground px-4 py-2 rounded-xl shadow-lg text-sm font-medium animate-float" style={{ animationDelay: '-2s' }}>
                +$450 Today ✨
              </div>
              <div className="absolute -left-4 bottom-1/4 bg-card border border-border px-4 py-2 rounded-xl shadow-lg text-sm flex items-center gap-2 animate-float" style={{ animationDelay: '-4s' }}>
                <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                New booking!
              </div>

              {/* Quote below card */}
              <p className="text-center text-sm text-muted-foreground mt-4 italic">
                "Bookings increased 40% in our first month" — Sarah M., Sparkle Clean Co.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========== URGENCY BAR ========== */}
      <div className="bg-gradient-to-r from-primary via-primary to-accent py-3 px-4 text-center">
        <p className="text-primary-foreground text-sm sm:text-base font-medium">
          🔥 Limited Time: Free 60-Day Trial · No Credit Card · Cancel Anytime
        </p>
      </div>

      {/* ========== THE PROBLEM SECTION (dark bg) ========== */}
      <section
        ref={problemReveal.ref}
        className={`py-16 md:py-24 px-4 sm:px-6 lg:px-8 bg-sidebar text-sidebar-foreground transition-all duration-700 ${
          problemReveal.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-12 tracking-tight">
            Running a Cleaning Business{" "}
            <span className="text-destructive">Shouldn't Feel Like This</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {painPoints.map((point, i) => (
              <Card key={i} className="bg-sidebar-accent border-sidebar-border p-5 flex items-start gap-3 text-left">
                <XCircle className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sidebar-foreground">{point}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ========== THE SOLUTION SECTION ========== */}
      <section
        id="features"
        ref={solutionReveal.ref}
        className={`py-16 md:py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${
          solutionReveal.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 rounded-full text-accent text-sm font-medium mb-4">
              <Zap className="h-4 w-4" />
              The Solution
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 tracking-tight">
              TIDYWISE Handles It All —{" "}
              <span className="text-gradient-hero">So You Can Focus on Growing</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {solutionFeatures.map((feature, index) => (
              <Card 
                key={feature.title}
                variant="feature"
                className="p-6 animate-stagger-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                  <feature.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed mb-3">{feature.description}</p>
                <Link to={feature.link} className="text-primary text-sm font-medium inline-flex items-center gap-1 hover:gap-2 transition-all">
                  Learn more <ArrowRight className="h-3 w-3" />
                </Link>
              </Card>
            ))}
          </div>

          {/* Features checklist */}
          <Card variant="glass" className="mt-12 p-8">
            <h3 className="text-xl font-semibold text-foreground mb-6 text-center">
              Built specifically for cleaning businesses...
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {featureChecklist.map((item, i) => (
                <div 
                  key={item} 
                  className="flex items-center gap-2 group animate-stagger-in"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 group-hover:scale-110 transition-transform" />
                  <span className="text-foreground text-sm">{item}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* ========== FEATURE DEEP-DIVE TABS ========== */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 tracking-tight">
              Built for Everyone on Your Team
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Every role gets a purpose-built experience.
            </p>
          </div>

          <Tabs defaultValue="owners" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8">
              <TabsTrigger value="owners">For Business Owners</TabsTrigger>
              <TabsTrigger value="cleaners">For Your Cleaners</TabsTrigger>
              <TabsTrigger value="clients">For Your Clients</TabsTrigger>
            </TabsList>

            <TabsContent value="owners">
              <Card className="p-6 md:p-8">
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h3 className="text-2xl font-bold text-foreground mb-4">Your Command Center</h3>
                    <ul className="space-y-3">
                      {[
                        "Real-time dashboard with today's revenue, bookings & staff activity",
                        "AI-powered insights: churn prediction, revenue forecasting, lead scoring",
                        "Automated payroll with hourly/per-job wage calculation",
                        "P&L reports, expense tracking & profit margin analysis",
                        "Drag-and-drop scheduler with conflict detection",
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-secondary rounded-2xl p-6 flex items-center justify-center min-h-[200px]">
                    <div className="text-center space-y-3">
                      <BarChart3 className="h-16 w-16 text-primary mx-auto" />
                      <p className="text-sm text-muted-foreground">Dashboard & Reports</p>
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="cleaners">
              <Card className="p-6 md:p-8">
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h3 className="text-2xl font-bold text-foreground mb-4">Their Job Hub</h3>
                    <ul className="space-y-3">
                      {[
                        "Mobile-first app with GPS check-in and on-my-way texts",
                        "Job checklists with photo documentation requirements",
                        "Earnings tracker with tips, wages & pay history",
                        "Set availability and claim open jobs",
                        "Push notifications for new assignments and schedule changes",
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-secondary rounded-2xl p-6 flex items-center justify-center min-h-[200px]">
                    <div className="text-center space-y-3">
                      <Smartphone className="h-16 w-16 text-primary mx-auto" />
                      <p className="text-sm text-muted-foreground">Staff Mobile App</p>
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="clients">
              <Card className="p-6 md:p-8">
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h3 className="text-2xl font-bold text-foreground mb-4">Their Self-Service Portal</h3>
                    <ul className="space-y-3">
                      {[
                        "Online booking form embedded on your website",
                        "Client portal to view upcoming cleans, invoices & receipts",
                        "One-click invoice payment with saved cards",
                        "Automated review requests after each job",
                        "Loyalty tier tracking with earned rewards & benefits",
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-secondary rounded-2xl p-6 flex items-center justify-center min-h-[200px]">
                    <div className="text-center space-y-3">
                      <Globe className="h-16 w-16 text-primary mx-auto" />
                      <p className="text-sm text-muted-foreground">Client Portal</p>
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Interactive Demo Section - Lazy loaded */}
      <Suspense fallback={<SectionSkeleton />}>
        <InteractiveDemo />
      </Suspense>

      {/* Competitor Comparison Section - Lazy loaded */}
      <Suspense fallback={<SectionSkeleton />}>
        <CompetitorComparison />
      </Suspense>

      {/* ========== STATS BAR ========== */}
      <section
        ref={statsReveal.ref}
        className={`py-16 px-4 sm:px-6 lg:px-8 bg-secondary/20 transition-all duration-700 ${
          statsReveal.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {[
              { value: '100+', label: 'Cleaning Businesses' },
              { value: '$2M+', label: 'Revenue Processed' },
              { value: '50,000+', label: 'Bookings Managed' },
              { value: '4.9★', label: 'Average Rating' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gradient-hero mb-1">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== TESTIMONIALS CAROUSEL ========== */}
      <section 
        id="testimonials" 
        ref={testimonialsReveal.ref}
        className={`py-20 md:py-28 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${
          testimonialsReveal.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-warning/10 rounded-full text-warning text-sm font-medium mb-4">
              <Star className="h-4 w-4 fill-current" />
              Customer Stories
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 tracking-tight">
              Loved by cleaning businesses{" "}
              <span className="text-gradient-hero">everywhere</span>
            </h2>
          </div>

          {/* Horizontally scrollable carousel */}
          <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4">
            {testimonials.map((testimonial, index) => (
              <Card 
                key={index}
                variant="elevated"
                className="p-6 min-w-[300px] sm:min-w-[350px] flex-shrink-0 snap-center"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-warning text-warning" />
                  ))}
                </div>
                <p className="text-foreground mb-6 leading-relaxed">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-semibold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{testimonial.author}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Blog Section - Lazy loaded */}
      <Suspense fallback={<SectionSkeleton />}>
        <BlogSection />
      </Suspense>

      {/* ========== FINAL CTA ========== */}
      <section className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary-glow)/0.3)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsl(var(--accent-glow)/0.2)_0%,transparent_50%)]" />
        
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary-foreground mb-6 tracking-tight">
            Ready to grow your cleaning business?
          </h2>
          <p className="text-lg sm:text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto">
            Join 100+ cleaning companies that trust TIDYWISE to manage their operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="xl" 
              variant="secondary"
              onClick={handleGetStarted}
              className="group shadow-2xl"
            >
              Start Free Trial
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <div className="flex items-center gap-3 text-primary-foreground/90">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-lg font-medium">First 60 days free</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer className="py-10 px-4 sm:px-6 lg:px-8 border-t border-border bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div className="md:col-span-1">
              <span className="font-bold text-xl text-foreground mb-4 block">TIDYWISE</span>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The complete platform to grow your cleaning business.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
                <li><Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link></li>
                <li><a href="#blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Testimonials</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-3">
                <li>
                  <a href="mailto:support@jointidywise.com" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Contact
                  </a>
                </li>
                <li>
                  <Link to="/privacy-policy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link to="/delete-account" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Delete Account
                  </Link>
                </li>
                <li>
                  <TermsOfServiceDialog>
                    <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</button>
                  </TermsOfServiceDialog>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Compare</h4>
              <ul className="space-y-3">
                <li><Link to="/compare/jobber" className="text-sm text-muted-foreground hover:text-foreground transition-colors">vs Jobber</Link></li>
                <li><Link to="/compare/booking-koala" className="text-sm text-muted-foreground hover:text-foreground transition-colors">vs Booking Koala</Link></li>
                <li><Link to="/compare/housecall-pro" className="text-sm text-muted-foreground hover:text-foreground transition-colors">vs Housecall Pro</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} TIDYWISE. All rights reserved.
          </div>
        </div>
      </footer>

      {/* ========== EXIT-INTENT / SCROLL-TRIGGERED POPUP ========== */}
      {showExitPopup && (
        <div className="fixed bottom-0 left-0 right-0 z-[80] p-4 animate-slide-up">
          <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl shadow-2xl p-6 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 text-center sm:text-left">
              <p className="font-semibold text-foreground mb-1">Before you go — your 60-day free trial is waiting.</p>
              <p className="text-sm text-muted-foreground">No credit card. Cancel anytime.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="premium" size="sm" onClick={handleGetStarted}>
                Start Free Now <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" onClick={dismissExitPopup}>
                No thanks
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
