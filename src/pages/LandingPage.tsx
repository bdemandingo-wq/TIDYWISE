import { useState, lazy, Suspense, useEffect, useRef } from "react";
import emmanuelPhoto from "@/assets/emmanuel-headshot.png";

const DemoBookingFormLazy = lazy(() => import("@/components/landing/DemoBookingForm").then(m => ({ default: m.DemoBookingForm })));
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  ChevronRight
} from "lucide-react";
import { SEOHead } from '@/components/SEOHead';
import { AuthSEOContent } from '@/components/seo/AuthSEOContent';
import { TermsOfServiceDialog } from "@/components/legal/TermsOfServiceDialog";
import { useIsMobile } from "@/hooks/use-mobile";

// Lazy load below-the-fold heavy components for better LCP
const AIBusinessTools = lazy(() => import("@/components/landing/AIBusinessTools").then(m => ({ default: m.AIBusinessTools })));
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

const cleaningConfig = {
  jobLabel: "Cleans",
  staffLabel: "Cleaners",
  serviceExamples: ["Deep Clean", "Standard Clean", "Move In/Out"],
  dashboardStats: {
    bookings: 12,
    revenue: "$2,450",
    staff: 8
  },
  testimonials: [
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
  ],
  features: [
    "Online booking form",
    "Recurring bookings",
    "Staff portal & app",
    "Client portal",
    "GPS check-ins",
    "Quote generator",
    "Lead management",
    "Photo documentation",
    "Review requests",
    "Loyalty tiers & rewards",
    "P&L reports",
    "Revenue forecasting",
    "Multi-location",
    "Demo/Test Mode",
    "In-App SMS inbox",
    "Inventory tracking",
    "Client self-cancellation",
    "Activity analytics",
    "AI intelligence"
  ]
};

const baseFeatures = [
  {
    icon: Calendar,
    title: "Smart Scheduling & Online Booking",
    description: "Cleaning business scheduling software that auto-assigns cleaners by location, skills, and availability. Let customers book online 24/7."
  },
  {
    icon: Users,
    title: "Client Portal & Self-Service",
    description: "Give clients their own portal to view bookings, request new appointments, cancel with tier-based policies, and track loyalty rewards."
  },
  {
    icon: CreditCard,
    title: "Automated Payments & Invoicing",
    description: "Accept payments online with Stripe. Auto-generate invoices, handle deposits, tips, and send professional quotes in seconds."
  },
  {
    icon: BarChart3,
    title: "Platform Analytics & AI Intelligence",
    description: "Track admin and client portal activity, user engagement, churn predictions, and revenue forecasting with AI-powered insights."
  },
  {
    icon: Smartphone,
    title: "Mobile App with GPS Tracking",
    description: "Staff app with GPS check-ins, on-my-way texts, photo documentation, and real-time job updates."
  },
  {
    icon: Bell,
    title: "Loyalty Tiers & Automated Campaigns",
    description: "Reward loyal customers with tiered benefits like free cancellations. Auto-send review requests and win-back campaigns."
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Scroll reveal refs
  const featuresReveal = useScrollReveal();
  const statsReveal = useScrollReveal();
  const testimonialsReveal = useScrollReveal();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isMobile && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }, [isMobile, mobileMenuOpen]);

  // Prevent the page behind the mobile menu from scrolling
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const handleGetStarted = () => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/signup");
  };

  const handleStartFree = () => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/signup");
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SEOHead 
        title="Cleaning Business CRM & Scheduling Software | TidyWise"
        description="Smart scheduling, automated payroll, CRM, GPS tracking & online booking for cleaning businesses. Free forever — get started today."
        canonical="/"
        ogImage="/images/tidywise-og.png"
        schemaJson={[
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
              "price": "0",
              "priceCurrency": "USD"
            },
            "description": "All-in-one cleaning business management software with scheduling, CRM, payments, and staff management. Free forever."
          },
          {
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "Is TidyWise free?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. TidyWise is free forever — no credit card required, no hidden fees, no per-user charges. Every feature including scheduling, CRM, invoicing, payroll, GPS tracking, and the mobile app is included at no cost."
                }
              },
              {
                "@type": "Question",
                "name": "What does TidyWise do for cleaning businesses?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "TidyWise is an all-in-one platform for cleaning businesses. It handles online booking, team scheduling, client CRM, automated invoicing, payroll calculation, GPS tracking, route optimization, and staff management — all from one dashboard and mobile app."
                }
              },
              {
                "@type": "Question",
                "name": "How does TidyWise compare to Jobber?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "TidyWise is free forever, while Jobber starts at $69/month. Both offer scheduling, invoicing, and client management. TidyWise also includes built-in payroll, GPS tracking, a loyalty program, AI business intelligence, and a client self-service portal — features that require paid add-ons or higher tiers on Jobber."
                }
              },
              {
                "@type": "Question",
                "name": "Does TidyWise work for small cleaning businesses?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. TidyWise is designed for cleaning businesses of all sizes — from solo operators to multi-team companies. Setup takes about 5 minutes and there are no minimums or seat limits. It scales with your business without ever charging you."
                }
              },
              {
                "@type": "Question",
                "name": "Does TidyWise have GPS tracking for cleaners?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. TidyWise includes real-time GPS tracking for cleaning teams. You can see where every cleaner is, verify job arrival times, give customers accurate ETAs, and generate automatic mileage reports for reimbursements — all included in the free plan."
                }
              },
              {
                "@type": "Question",
                "name": "Can I manage payroll with TidyWise?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. TidyWise includes built-in payroll for cleaning businesses. It automatically calculates wages from completed jobs — flat per-job rates, hourly, or a percentage of the service price. Tips, mileage reimbursements, and pay period reports are all handled inside the platform."
                }
              },
              {
                "@type": "Question",
                "name": "Does TidyWise have a mobile app?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. TidyWise has a mobile app for both iOS and Android. Staff can see their schedules, check in via GPS, document jobs with photos, and send on-my-way texts. Business owners can manage bookings, view reports, and communicate with clients from the app."
                }
              }
            ]
          }
        ]}
      />

      {/* Navigation - Premium glassmorphism (iOS safe-area aware) */}
      <nav className={`fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] transition-all duration-300 ${
        isScrolled 
          ? 'bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm' 
          : 'bg-transparent'
      }`}>
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
              <Button variant="ghost" onClick={() => navigate("/demo")} className="text-sm font-medium text-primary">Schedule Demo</Button>
              <Button variant="ghost" onClick={() => navigate("/login")} className="text-sm">Log In</Button>
              <Button variant="premium" onClick={() => navigate("/signup")} className="text-sm">
                Get Started Free
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

           {/* Mobile Navigation: fixed overlay to avoid colliding with the hero */}
           {mobileMenuOpen ? (
             <div
               className="md:hidden fixed inset-0 z-[60]"
               role="dialog"
               aria-modal="true"
               aria-label="Mobile menu"
             >
               {/* Backdrop */}
               <button
                 type="button"
                 className="absolute inset-0 bg-background/60 backdrop-blur-sm"
                 aria-label="Close menu"
                 onClick={closeMobileMenu}
               />

               {/* Panel */}
               <div className="absolute left-3 right-3 top-[calc(4.25rem+env(safe-area-inset-top))]">
                 <div className="rounded-2xl border border-border bg-background shadow-lg">
                   <div className="flex flex-col gap-1 p-2">
                     <a
                       href="#features"
                       onClick={closeMobileMenu}
                       className="px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all"
                     >
                       Features
                     </a>
                     <a
                       href="#blog"
                       onClick={closeMobileMenu}
                       className="px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all"
                     >
                       Blog
                     </a>
                      <a
                        href="#testimonials"
                        onClick={closeMobileMenu}
                        className="px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all"
                      >
                        Testimonials
                       </a>
                       <Button
                         variant="ghost"
                         className="justify-start text-primary font-medium"
                         onClick={() => {
                           closeMobileMenu();
                           navigate("/demo");
                         }}
                       >
                         Schedule Demo
                       </Button>
                       <Button
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          closeMobileMenu();
                          navigate("/pricing");
                        }}
                      >
                        Pricing
                      </Button>
                       <Button
                         variant="ghost"
                         className="justify-start"
                         onClick={() => {
                           closeMobileMenu();
                           navigate("/portal");
                         }}
                       >
                         Client Portal
                       </Button>
                      <Button
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          closeMobileMenu();
                          navigate("/staff/login");
                        }}
                      >
                        Staff Portal
                      </Button>
                      <Button
                       variant="ghost"
                       className="justify-start"
                       onClick={() => {
                         closeMobileMenu();
                         navigate("/login");
                       }}
                     >
                       Log In
                     </Button>
                     <Button
                       variant="premium"
                       className="mt-1"
                       onClick={() => {
                         closeMobileMenu();
                         navigate("/signup");
                       }}
                     >
                        Get Started Free
                        <ArrowRight className="ml-1 h-4 w-4" />
                     </Button>
                   </div>
                 </div>
               </div>
             </div>
           ) : null}
        </div>
      </nav>

      {/* Hero Section - Editorial redesign */}
      <section className="relative pt-[calc(7rem+env(safe-area-inset-top))] md:pt-[calc(10rem+env(safe-area-inset-top))] pb-20 md:pb-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Warm radial wash */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ background: 'var(--gradient-hero)' }} />

        <div className="max-w-5xl mx-auto relative text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 mb-8 text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium">
            <span className="h-px w-8 bg-foreground/30" />
            <span>Cleaning Business Software</span>
            <span className="h-px w-8 bg-foreground/30" />
          </div>

          {/* Editorial headline */}
          <h1 className="font-serif text-[2.75rem] sm:text-6xl md:text-7xl lg:text-8xl leading-[0.95] mb-8 text-foreground">
            Run your cleaning<br />
            business like a{" "}
            <span className="italic text-primary">work of art</span>.
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Online booking, smart scheduling, automated payroll, and CRM —
            all in one quietly powerful platform. No fluff. Built for operators who care about the craft.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto justify-center">
            <Button
              size="xl"
              variant="premium"
              onClick={handleGetStarted}
              className="group flex-1"
            >
              Start Free
              <ArrowRight className="ml-1 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              size="xl"
              variant="outline"
              onClick={() => navigate("/demo")}
              className="flex-1 gap-2"
            >
              <Calendar className="h-5 w-5" />
              Book a Demo
            </Button>
          </div>

          {/* Trust line */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-foreground" />
              No credit card
            </span>
            <span className="hidden sm:inline text-foreground/30">·</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-foreground" />
              Free forever
            </span>
            <span className="hidden sm:inline text-foreground/30">·</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-foreground" />
              Unlimited bookings
            </span>
          </div>

          {/* Stats strip — editorial proof */}
          <div className="mt-20 grid grid-cols-3 gap-px bg-border rounded-md overflow-hidden border-[1.5px] border-border max-w-3xl mx-auto">
            {[
              { value: '12k+', label: 'Bookings managed' },
              { value: '$4M', label: 'Revenue processed' },
              { value: '99.9%', label: 'Uptime' },
            ].map((stat, i) => (
              <div key={i} className="bg-card px-4 py-6 sm:py-8">
                <div className="font-serif text-3xl sm:text-5xl text-foreground tabular-nums">{stat.value}</div>
                <div className="mt-2 text-xs sm:text-sm text-muted-foreground uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section - Enhanced with scroll reveal */}
      <section 
        id="features" 
        ref={featuresReveal.ref}
        className={`py-16 md:py-20 px-4 sm:px-6 lg:px-8 bg-secondary/30 transition-all duration-700 ${
          featuresReveal.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 rounded-full text-accent text-sm font-medium mb-4">
              <Zap className="h-4 w-4" />
              Powerful Features
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 tracking-tight">
              Everything you need to{" "}
              <span className="text-gradient-hero">run your business</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              More than just software. TIDYWISE is the all-in-one platform—from automated booking to GPS route optimization.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {baseFeatures.map((feature, index) => (
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
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </Card>
            ))}
          </div>

          {/* Features checklist */}
          <Card variant="glass" className="mt-12 p-8">
            <h3 className="text-xl font-semibold text-foreground mb-6 text-center">
              Built specifically for cleaning businesses...
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {cleaningConfig.features.map((item, i) => (
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

      {/* Schedule Demo Section */}
      <section id="schedule-demo" className="py-16 md:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Left — Value Props */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
                <Calendar className="h-4 w-4" />
                Free 30-Minute Demo
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-4">
                See TidyWise{" "}
                <span className="text-gradient-hero">in Action</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Book a free 30-minute call with Emmanuel. We'll walk through the entire platform live and answer every question you have.
              </p>
              <div className="space-y-3 mb-8">
                {[
                  "100% free — no credit card",
                  "Live walkthrough of your workflow",
                  "See how to automate your bookings",
                  "Get set up same day if you're ready",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
                <img src={emmanuelPhoto} alt="Emmanuel Forkuoh" className="w-16 h-16 rounded-full object-cover" width={64} height={64} loading="lazy" />
                <div>
                  <p className="font-semibold text-foreground">Emmanuel Forkuoh</p>
                  <p className="text-sm text-muted-foreground">Founder of TidyWise</p>
                  <p className="text-xs text-muted-foreground mt-0.5">You'll meet with Emmanuel personally</p>
                </div>
              </div>
            </div>
            {/* Right — Form */}
            <div>
              <Suspense fallback={<div className="h-96 animate-pulse bg-muted rounded-xl" />}>
                <DemoBookingFormLazy />
              </Suspense>
            </div>
          </div>
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

      {/* AI Business Tools Section - Lazy loaded */}
      <Suspense fallback={<SectionSkeleton />}>
        <AIBusinessTools />
      </Suspense>

      {/* Stats Section - Enhanced with animations */}
      <section 
        ref={statsReveal.ref}
        className={`py-16 md:py-20 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${
          statsReveal.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-4">
                <Shield className="h-4 w-4" />
                Trusted worldwide
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 tracking-tight">
                Scale from startup to{" "}
                <span className="text-gradient-hero">$1M+ revenue</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Whether you're just starting or ready to scale, TIDYWISE gives you the same tools multi-million dollar cleaning services use.
              </p>
              <div className="space-y-4">
                {[
                  "Set it and forget it online booking",
                  "GPS route optimization saves 30% travel time",
                  "Automated review requests for Google Guaranteed",
                  "Professional quotes & invoices in seconds"
                ].map((item, i) => (
                  <div 
                    key={item} 
                    className="flex items-center gap-3 animate-stagger-in"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-success/20 to-success/10 flex items-center justify-center">
                      <Zap className="h-4 w-4 text-success" />
                    </div>
                    <span className="text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 rounded-3xl blur-xl" />
              <div className="relative grid grid-cols-2 gap-4">
                 {[
                   { value: '24/7', label: 'Online booking', delay: '0s' },
                   { value: 'Free', label: 'Forever', delay: '0.1s' },
                   { value: '∞', label: 'Unlimited bookings', delay: '0.2s' },
                   { value: '5 min', label: 'Setup time', delay: '0.3s' },
                 ].map((stat, i) => (
                  <Card 
                    key={i}
                    variant="glass" 
                    className="p-6 text-center hover:scale-105 transition-transform animate-stagger-in"
                    style={{ animationDelay: stat.delay }}
                  >
                    <p className="text-4xl lg:text-5xl font-bold text-gradient-hero mb-1">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials - Premium cards */}
      <section 
        id="testimonials" 
        ref={testimonialsReveal.ref}
        className={`py-16 md:py-24 px-4 sm:px-6 lg:px-8 bg-secondary/30 transition-all duration-700 ${
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
            <p className="text-lg text-muted-foreground">
              Join cleaning companies that trust TIDYWISE to manage their operations.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {cleaningConfig.testimonials.map((testimonial, index) => (
              <Card 
                key={index}
                variant="elevated"
                className="p-6 animate-stagger-in"
                style={{ animationDelay: `${index * 0.15}s` }}
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

          <div className="mt-12 flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Trusted by homeowners across South Florida ⭐ 5.0 on Google
            </p>
            <Button
              variant="outline"
              size="lg"
              asChild
            >
              <a
                href="https://search.google.com/local/reviews?placeid=ChIJ49KSUfgd2YgRH2RMjA6X9jM"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Star className="h-4 w-4 mr-2 fill-warning text-warning" />
                See All Reviews on Google
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Blog Section - Lazy loaded */}
      <Suspense fallback={<SectionSkeleton />}>
        <BlogSection />
      </Suspense>

      {/* FAQ Section */}
      <section className="py-16 md:py-20 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Frequently Asked Questions</h2>
            <p className="text-lg text-muted-foreground">Everything you need to know before getting started.</p>
          </div>
          <div className="space-y-4">
            {[
              {
                q: "Is TidyWise free?",
                a: "Yes — free forever. No credit card, no hidden fees, no per-user charges. Every feature including scheduling, CRM, invoicing, payroll, GPS tracking, and the mobile app is included at no cost."
              },
              {
                q: "How does TidyWise compare to Jobber?",
                a: "TidyWise is free; Jobber starts at $69/month. Both handle scheduling, invoicing, and client management. TidyWise also includes built-in payroll, GPS tracking, a loyalty program, AI business intelligence, and a client self-service portal — features that cost extra or require higher tiers on Jobber."
              },
              {
                q: "Does TidyWise work for small cleaning businesses?",
                a: "Yes. TidyWise works for solo operators and multi-team companies alike. Setup takes about 5 minutes, there are no minimums or seat limits, and it scales with your business without ever charging you."
              },
              {
                q: "Does TidyWise have GPS tracking for cleaners?",
                a: "Yes. Real-time GPS tracking is included. See where every cleaner is, verify job arrival times, give customers accurate ETAs, and generate automatic mileage reports — all on the free plan."
              },
              {
                q: "Can I run payroll through TidyWise?",
                a: "Yes. TidyWise automatically calculates wages from completed jobs — flat per-job rates, hourly, or a percentage of the service price. Tips, mileage reimbursements, and pay period summaries are all handled inside the platform."
              },
              {
                q: "Is there a mobile app?",
                a: "Yes, for iOS and Android. Staff see their schedules, check in via GPS, document jobs with photos, and send on-my-way texts. Owners can manage bookings, view reports, and message clients from the app."
              },
            ].map((item, i) => (
              <details key={i} className="group bg-card border border-border rounded-xl">
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none">
                  <span className="font-semibold text-foreground">{item.q}</span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 group-open:rotate-90 transition-transform" />
                </summary>
                <div className="px-6 pb-5 text-muted-foreground leading-relaxed">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* SEO long-form content with internal links + FAQ (moved from /login) */}
      <section className="py-12 md:py-16 px-4 sm:px-6 lg:px-8 bg-background">
        <AuthSEOContent variant="login" headingLevel="h2" />
      </section>

      {/* Final CTA - Premium gradient */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary-glow)/0.3)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsl(var(--accent-glow)/0.2)_0%,transparent_50%)]" />
        
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary-foreground mb-6 tracking-tight">
            Ready to grow your cleaning business?
          </h2>
          <p className="text-lg sm:text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto">
            Join cleaning companies that trust TIDYWISE to manage their operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="xl" 
              variant="secondary"
              onClick={handleStartFree}
              className="group shadow-2xl"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <div className="flex items-center gap-3 text-primary-foreground/90">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-lg font-medium">Free forever — no credit card</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer - Clean and minimal */}
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
                <li><a href="#blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Testimonials</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-3">
                <li>
                  <a href="mailto:support@tidywisecleaning.com" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
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
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} TIDYWISE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}