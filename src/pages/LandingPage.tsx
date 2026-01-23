import { useState, lazy, Suspense, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Seo } from "@/components/Seo";
import { TermsOfServiceDialog } from "@/components/legal/TermsOfServiceDialog";

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
    "GPS check-ins",
    "Quote generator",
    "Lead management",
    "Photo documentation",
    "Review requests",
    "Loyalty programs",
    "P&L reports",
    "Revenue forecasting",
    "Multi-location",
    "Demo/Test Mode",
    "In-App SMS inbox",
    "Inventory tracking"
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
    title: "House Cleaning CRM",
    description: "Complete customer relationship management for maid services. Track client history, preferences, and lifetime value."
  },
  {
    icon: CreditCard,
    title: "Automated Payments & Invoicing",
    description: "Accept payments online with Stripe. Auto-generate invoices, handle deposits, tips, and send professional quotes in seconds."
  },
  {
    icon: BarChart3,
    title: "Cleaning Business Reports & Analytics",
    description: "P&L tracking, revenue forecasting, and staff productivity metrics. Know your numbers like the pros."
  },
  {
    icon: Smartphone,
    title: "Mobile App with GPS Tracking",
    description: "Staff app with GPS check-ins, on-my-way texts, photo documentation, and real-time job updates."
  },
  {
    icon: Bell,
    title: "Automated Follow-ups & Reviews",
    description: "Auto-send quote follow-ups, booking confirmations, review requests, and win-back campaigns. Boost your Google reviews."
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
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

  const handleGetStarted = () => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/auth", { state: { email, industry: "Home Cleaning", mode: "signup" } });
  };

  const handleStartFreeTrial = () => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/auth", { state: { mode: "signup" } });
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Seo 
        title="TIDYWISE - #1 Cleaning Business Software | Booking Koala & Jobber Alternative"
        description="Best cleaning business software for maid services. Smart scheduling, automated payroll, CRM, GPS tracking & online booking. Better than Booking Koala & Jobber. Start free."
        canonicalPath="/"
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
              <Button variant="ghost" onClick={() => navigate("/staff/login")} className="text-sm">Staff Portal</Button>
              <Button variant="ghost" onClick={() => navigate("/auth")} className="text-sm">Log In</Button>
              <Button variant="premium" onClick={() => navigate("/auth")} className="text-sm">
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

          {/* Mobile Navigation (overlay panel so it doesn't cover hero content) */}
          <div
            className={`md:hidden absolute left-0 right-0 top-full transition-all duration-200 ${
              mobileMenuOpen
                ? "opacity-100 translate-y-0 pointer-events-auto"
                : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
          >
            <div className="mt-2 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-lg overflow-hidden">
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
                    navigate("/auth");
                  }}
                >
                  Log In
                </Button>
                <Button
                  variant="premium"
                  className="mt-1"
                  onClick={() => {
                    closeMobileMenu();
                    navigate("/auth");
                  }}
                >
                  Start Free Trial
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Premium redesign */}
      <section className="relative pt-[calc(6.5rem+env(safe-area-inset-top))] md:pt-[calc(8.5rem+env(safe-area-inset-top))] pb-16 md:pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Animated gradient background */}
        <div className="hero-gradient-bg" />
        
        {/* Decorative elements */}
        <div className="absolute top-40 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />

        <div className="max-w-7xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left side - Text content */}
            <div className="text-center lg:text-left animate-fade-up">
              {/* Trust badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 backdrop-blur-sm rounded-full text-primary text-sm font-medium mb-5 border border-primary/20 animate-pulse-glow">
                <Sparkles className="h-4 w-4" />
                <span>#1 Rated Cleaning Business Software</span>
                <ChevronRight className="h-4 w-4" />
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-foreground leading-[1.1] mb-6 tracking-tight">
                The best{" "}
                <span className="text-gradient-hero">maid service software</span>{" "}
                to grow your business
              </h1>
              
              <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Looking for Booking Koala or Jobber alternatives? TIDYWISE gives you online booking, smart scheduling, automated payroll, and CRM—all in one platform.
              </p>

              {/* CTA Form - Premium styling */}
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto lg:mx-0">
                <div className="relative flex-1">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-14 pl-4 pr-4 text-base rounded-xl border-border/50 bg-background/80 backdrop-blur-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <Button 
                  size="xl" 
                  variant="premium"
                  onClick={handleGetStarted}
                  className="group"
                >
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
              
              <p className="text-sm text-muted-foreground mt-4 flex items-center gap-2 justify-center lg:justify-start">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Start free. No credit card required.
              </p>

              {/* Social proof mini */}
               <div className="flex items-center gap-4 mt-7 justify-center lg:justify-start">
                <div className="flex -space-x-2">
                  {['bg-primary', 'bg-accent', 'bg-warning', 'bg-success'].map((bg, i) => (
                    <div key={i} className={`w-10 h-10 rounded-full ${bg} border-2 border-background flex items-center justify-center text-white text-xs font-medium`}>
                      {String.fromCharCode(65 + i)}
                    </div>
                  ))}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">500+ cleaning businesses trust us</p>
                </div>
              </div>
            </div>

            {/* Right side - Premium Dashboard preview */}
            <div className="relative animate-fade-up" style={{ animationDelay: '0.2s' }}>
              {/* Glow effect behind card */}
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
                      { label: `Today's ${cleaningConfig.jobLabel}`, value: cleaningConfig.dashboardStats.bookings, color: 'primary' },
                      { label: 'Revenue', value: cleaningConfig.dashboardStats.revenue, color: 'success' },
                      { label: `${cleaningConfig.staffLabel}`, value: cleaningConfig.dashboardStats.staff, color: 'accent' },
                    ].map((stat, i) => (
                      <div key={i} className="bg-secondary/80 rounded-xl p-4 hover:bg-secondary transition-colors">
                        <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                        <p className={`text-2xl font-bold text-${stat.color === 'primary' ? 'foreground' : stat.color}`}>
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  
                  {/* Upcoming jobs */}
                  <div className="bg-secondary/50 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-medium text-foreground">Upcoming {cleaningConfig.jobLabel}</span>
                      <button className="text-xs text-primary hover:underline">View all</button>
                    </div>
                    <div className="space-y-2">
                      {cleaningConfig.serviceExamples.map((service, i) => (
                        <div 
                          key={i} 
                          className="flex items-center gap-3 bg-card/80 rounded-lg p-3 hover:bg-card transition-colors group"
                        >
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Sparkles className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{service}</p>
                            <p className="text-xs text-muted-foreground">123 Main St • 10:00 AM</p>
                          </div>
                          <div className="px-2.5 py-1 rounded-full bg-success/10 text-success text-xs font-medium">
                            Confirmed
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
              
              {/* Floating elements */}
              <div className="absolute -right-4 top-1/4 bg-success text-white px-4 py-2 rounded-xl shadow-lg text-sm font-medium animate-float" style={{ animationDelay: '-2s' }}>
                +$450 Today ✨
              </div>
              <div className="absolute -left-4 bottom-1/4 bg-card border border-border px-4 py-2 rounded-xl shadow-lg text-sm flex items-center gap-2 animate-float" style={{ animationDelay: '-4s' }}>
                <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                New booking!
              </div>
            </div>
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
        className={`py-20 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${
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
                  { value: '20K+', label: 'Active businesses', delay: '0s' },
                  { value: '1M+', label: 'Cleans completed', delay: '0.1s' },
                  { value: '50+', label: 'Countries', delay: '0.2s' },
                  { value: '4.9', label: 'Average rating', delay: '0.3s' },
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
        className={`py-20 md:py-28 px-4 sm:px-6 lg:px-8 bg-secondary/30 transition-all duration-700 ${
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
              Join thousands of cleaning companies already using TIDYWISE
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
        </div>
      </section>

      {/* Blog Section - Lazy loaded */}
      <Suspense fallback={<SectionSkeleton />}>
        <BlogSection />
      </Suspense>

      {/* Final CTA - Premium gradient */}
      <section className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary-glow)/0.3)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsl(var(--accent-glow)/0.2)_0%,transparent_50%)]" />
        
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary-foreground mb-6 tracking-tight">
            Ready to grow your cleaning business?
          </h2>
          <p className="text-lg sm:text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto">
            Join thousands of cleaning companies that trust TIDYWISE to manage their operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="xl" 
              variant="secondary"
              onClick={handleStartFreeTrial}
              className="group shadow-2xl"
            >
              Start Free Trial
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button 
              size="xl" 
              variant="outline"
              className="bg-transparent text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/10 hover:border-primary-foreground/50"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Play className="mr-2 h-5 w-5" />
              Watch Demo
            </Button>
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