import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Building2,
  Scissors,
  Car,
  Sparkles,
  Dog,
  Leaf,
  Menu,
  X
} from "lucide-react";
import { Seo } from "@/components/Seo";
import { PricingImport } from "@/components/landing/PricingImport";

const industries = [
  { name: "Home Cleaning", icon: Sparkles },
  { name: "Office Cleaning", icon: Building2 },
  { name: "Pet Grooming", icon: Dog },
  { name: "Lawn Care", icon: Leaf },
  { name: "Hair Salon", icon: Scissors },
  { name: "Car Wash", icon: Car },
];

const features = [
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "Intelligent booking system that automatically assigns the best available staff based on location, skills, and availability."
  },
  {
    icon: Users,
    title: "Team Management",
    description: "Complete staff portal with job assignments, earnings tracking, availability management, and performance reviews."
  },
  {
    icon: CreditCard,
    title: "Seamless Payments",
    description: "Accept payments online with Stripe integration. Handle deposits, tips, and automatic invoicing."
  },
  {
    icon: BarChart3,
    title: "Business Analytics",
    description: "Track revenue, customer lifetime value, staff productivity, and profit margins with real-time dashboards."
  },
  {
    icon: Smartphone,
    title: "Mobile Ready",
    description: "Staff mobile app for check-ins, photo documentation, checklists, and real-time job updates."
  },
  {
    icon: Bell,
    title: "Automated Campaigns",
    description: "Re-engage customers with automated follow-up emails, review requests, and loyalty programs."
  },
];

const testimonials = [
  {
    quote: "This platform transformed how we run our cleaning business. Bookings increased 40% in the first month!",
    author: "Sarah M.",
    role: "Owner, Sparkle Clean Co.",
    rating: 5
  },
  {
    quote: "The staff portal is amazing. My team can manage their own schedules and I can track everything in real-time.",
    author: "Michael R.",
    role: "Founder, Fresh Start Services",
    rating: 5
  },
  {
    quote: "Finally, a platform that understands service businesses. The automated invoicing alone saves me hours every week.",
    author: "Jennifer L.",
    role: "CEO, Elite Home Care",
    rating: 5
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState(industries[0].name);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleGetStarted = () => {
    navigate("/auth", { state: { email } });
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo 
        title="TidyWise - The Perfect Platform to Grow Your Service Business"
        description="Complete business management platform for cleaning companies and service businesses. Smart scheduling, team management, payments, and analytics."
        canonicalPath="/"
      />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <img 
                src="/images/tidywise-logo.png" 
                alt="TidyWise" 
                className="h-8 w-auto"
              />
              <span className="font-bold text-xl text-foreground">TidyWise</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
              <Button variant="ghost" onClick={() => navigate("/auth")}>Log In</Button>
              <Button onClick={() => navigate("/auth")}>Start Free Trial</Button>
            </div>

            {/* Mobile menu button */}
            <button 
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-border">
              <div className="flex flex-col gap-4">
                <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
                <a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
                <Button variant="ghost" className="justify-start" onClick={() => navigate("/auth")}>Log In</Button>
                <Button onClick={() => navigate("/auth")}>Start Free Trial</Button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left side - Text content */}
            <div className="text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
                The perfect platform to grow a{" "}
                <span className="text-primary">service business.</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto lg:mx-0">
                We help your business from start to scale by giving your customers the perfect experience while making your life easier. Today, anyone can start a service and compete with multi-million dollar brands in seconds.
              </p>

              {/* Industry selector */}
              <div className="mb-6">
                <div className="flex flex-wrap justify-center lg:justify-start gap-2 mb-4">
                  {industries.map((industry) => (
                    <button
                      key={industry.name}
                      onClick={() => setSelectedIndustry(industry.name)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        selectedIndustry === industry.name
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      <industry.icon className="h-4 w-4" />
                      {industry.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* CTA Form */}
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto lg:mx-0">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12"
                />
                <Button size="lg" className="h-12 px-8" onClick={handleGetStarted}>
                  Get Started <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                Start free. No credit card required.
              </p>
            </div>

            {/* Right side - Dashboard preview */}
            <div className="relative">
              <div className="bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
                <div className="bg-sidebar p-4 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-destructive/60" />
                    <div className="w-3 h-3 rounded-full bg-warning/60" />
                    <div className="w-3 h-3 rounded-full bg-success/60" />
                  </div>
                  <span className="text-sidebar-foreground/60 text-sm ml-2">Dashboard</span>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-secondary rounded-lg p-4">
                      <p className="text-xs text-muted-foreground">Today's Bookings</p>
                      <p className="text-2xl font-bold text-foreground">12</p>
                    </div>
                    <div className="bg-secondary rounded-lg p-4">
                      <p className="text-xs text-muted-foreground">Revenue</p>
                      <p className="text-2xl font-bold text-foreground">$2,450</p>
                    </div>
                    <div className="bg-secondary rounded-lg p-4">
                      <p className="text-xs text-muted-foreground">Active Staff</p>
                      <p className="text-2xl font-bold text-foreground">8</p>
                    </div>
                  </div>
                  <div className="bg-secondary rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-foreground">Upcoming Jobs</span>
                      <span className="text-xs text-muted-foreground">View all</span>
                    </div>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 bg-card rounded-lg p-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Sparkles className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">Deep Clean</p>
                          <p className="text-xs text-muted-foreground">123 Main St • 10:00 AM</p>
                        </div>
                        <div className="px-2 py-1 rounded-full bg-success/10 text-success text-xs">
                          Confirmed
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Everything you need to run your business
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              We're not just booking software. TidyWise is the complete platform with everything you need to grow a service business.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div 
                key={feature.title}
                className="bg-card rounded-xl p-6 border border-border hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* Additional features list */}
          <div className="mt-16 bg-card rounded-2xl border border-border p-8">
            <h3 className="text-xl font-semibold text-foreground mb-6 text-center">Plus so much more...</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                "Recurring bookings",
                "Customer portal",
                "Inventory tracking",
                "Lead management",
                "Quote generator",
                "Loyalty programs",
                "GPS check-ins",
                "Photo documentation",
                "Email campaigns",
                "Review requests",
                "Multi-location",
                "Team messaging"
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                  <span className="text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Security & Trust Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-4">
                <Shield className="h-4 w-4" />
                Enterprise-grade security
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                Compete with multi-million dollar services in 60 seconds
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Whether you have a website or not, in less than 60 seconds you can have access to features that will take your business to the next level.
              </p>
              <div className="space-y-4">
                {[
                  "Secure payment processing with Stripe",
                  "GDPR compliant data handling",
                  "99.9% uptime guarantee",
                  "Automatic backups & data protection"
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-success/10 flex items-center justify-center">
                      <Zap className="h-3 w-3 text-success" />
                    </div>
                    <span className="text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl p-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card rounded-xl p-6 text-center">
                    <p className="text-4xl font-bold text-primary">20K+</p>
                    <p className="text-sm text-muted-foreground">Active businesses</p>
                  </div>
                  <div className="bg-card rounded-xl p-6 text-center">
                    <p className="text-4xl font-bold text-primary">1M+</p>
                    <p className="text-sm text-muted-foreground">Bookings processed</p>
                  </div>
                  <div className="bg-card rounded-xl p-6 text-center">
                    <p className="text-4xl font-bold text-primary">50+</p>
                    <p className="text-sm text-muted-foreground">Countries</p>
                  </div>
                  <div className="bg-card rounded-xl p-6 text-center">
                    <p className="text-4xl font-bold text-primary">4.9</p>
                    <p className="text-sm text-muted-foreground">Average rating</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              You'll be in good company
            </h2>
            <p className="text-lg text-muted-foreground">
              Join thousands of service businesses already using TidyWise
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div 
                key={index}
                className="bg-card rounded-xl p-6 border border-border"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-warning text-warning" />
                  ))}
                </div>
                <p className="text-foreground mb-4 italic">"{testimonial.quote}"</p>
                <div>
                  <p className="font-semibold text-foreground">{testimonial.author}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Pricing Import */}
      <PricingImport />

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Ready to grow your business?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Start your free trial today. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="h-12 px-8" onClick={() => navigate("/auth")}>
              Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8" onClick={() => navigate("/auth")}>
              Log In
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <img 
                src="/images/tidywise-logo.png" 
                alt="TidyWise" 
                className="h-6 w-auto"
              />
              <span className="font-bold text-foreground">TidyWise</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} TidyWise. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
