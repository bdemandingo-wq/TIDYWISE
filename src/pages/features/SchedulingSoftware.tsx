import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { RelatedArticles, allArticles } from "@/components/blog/RelatedArticles";
import { 
  ArrowRight, 
  Calendar, 
  Clock, 
  Users,
  Zap,
  CheckCircle2,
  Bell,
  Repeat,
  CalendarCheck,
  MousePointer,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";

const benefits = [
  {
    icon: Calendar,
    title: "Visual Drag-and-Drop Calendar",
    description: "See your entire week at a glance. Drag jobs to reschedule. Assign cleaners with a click."
  },
  {
    icon: Users,
    title: "Team Availability Management",
    description: "Cleaners set their own availability. Never double-book or schedule someone on their day off."
  },
  {
    icon: Repeat,
    title: "Recurring Booking Automation",
    description: "Set up weekly, bi-weekly, or monthly recurring cleans. They're scheduled automatically forever."
  },
  {
    icon: Bell,
    title: "Automatic Reminders",
    description: "Customers and cleaners get SMS/email reminders before appointments. Reduce no-shows by 90%."
  },
  {
    icon: CalendarCheck,
    title: "Online Booking Integration",
    description: "Customers book directly from your website. Jobs appear on your calendar automatically."
  },
  {
    icon: MousePointer,
    title: "Conflict Detection",
    description: "TidyWise warns you before you double-book. Never accidentally schedule overlapping jobs."
  },
];

const features = [
  "Drag-and-drop scheduling",
  "Cleaner availability calendar",
  "Recurring booking automation",
  "Customer self-booking portal",
  "Automatic SMS reminders",
  "Conflict detection alerts",
  "Multi-day job support",
  "Real-time schedule sync"
];

export default function SchedulingSoftware() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleStartFreeTrial = () => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/auth", { state: { mode: "signup" } });
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo 
        title="Cleaning Scheduling Software | TIDYWISE"
        description="Visual calendar, recurring bookings, online booking portal, and automatic reminders for cleaning businesses. Reduce no-shows."
        canonicalPath="/features/scheduling-software"
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
              <a href="/blog" className="text-muted-foreground hover:text-foreground transition-colors">Blog</a>
              <Button variant="ghost" onClick={() => navigate("/auth")}>Log In</Button>
              <Button onClick={handleStartFreeTrial}>Start Free Trial</Button>
            </div>
            <button 
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-border">
              <div className="flex flex-col gap-4">
                <a href="/#features" className="text-muted-foreground hover:text-foreground">Features</a>
                <a href="/blog" className="text-muted-foreground hover:text-foreground">Blog</a>
                <Button variant="ghost" className="justify-start" onClick={() => navigate("/auth")}>Log In</Button>
                <Button onClick={handleStartFreeTrial}>Start Free Trial</Button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
            <Calendar className="h-4 w-4" />
            Smart Scheduling
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
            Cleaning Scheduling Software<br/>
            <span className="text-primary">That Actually Works</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Stop juggling spreadsheets and sticky notes. TidyWise gives you a beautiful visual calendar, recurring booking automation, and online booking. <strong>Reduce no-shows by 90%</strong> with automatic reminders.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="h-12 px-8" onClick={handleStartFreeTrial}>
              Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8" onClick={() => document.getElementById('benefits')?.scrollIntoView({ behavior: 'smooth' })}>
              See How It Works
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">90%</div>
              <p className="text-sm text-muted-foreground">Fewer No-Shows</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">5 Hours</div>
              <p className="text-sm text-muted-foreground">Saved Weekly</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">24/7</div>
              <p className="text-sm text-muted-foreground">Online Booking</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">Unlimited</div>
              <p className="text-sm text-muted-foreground">Recurring Jobs</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="benefits" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-4">
            How TidyWise Scheduling Works
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            A visual calendar built specifically for cleaning businesses. Schedule smarter, not harder.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="bg-card rounded-xl p-6 border border-border">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <benefit.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{benefit.title}</h3>
                <p className="text-muted-foreground">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature List */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-12">
            Everything You Need for Effortless Scheduling
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature) => (
              <div key={feature} className="flex items-center gap-3 bg-card rounded-lg p-4 border border-border">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                <span className="text-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">
            Stop Wasting Time on Manual Scheduling
          </h2>
          <p className="text-lg text-primary-foreground/80 mb-8">
            Try smart scheduling to book more jobs with less hassle.
          </p>
          <Button size="lg" variant="secondary" className="h-12 px-8" onClick={handleStartFreeTrial}>
            Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Related Articles for Internal Linking */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          <RelatedArticles 
            articles={allArticles} 
            currentSlug="/features/scheduling-software" 
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-muted-foreground">© 2026 TidyWise. Smart scheduling for cleaning businesses.</p>
          <div className="flex flex-wrap justify-center gap-6 mt-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground">Home</Link>
            <Link to="/features/automated-dispatching" className="text-muted-foreground hover:text-foreground">Dispatching</Link>
            <Link to="/features/route-optimization" className="text-muted-foreground hover:text-foreground">Route Optimization</Link>
            <Link to="/features/invoicing-software" className="text-muted-foreground hover:text-foreground">Invoicing</Link>
            <Link to="/compare/jobber" className="text-muted-foreground hover:text-foreground">vs Jobber</Link>
            <Link to="/blog" className="text-muted-foreground hover:text-foreground">Blog</Link>
          </div>
        </div>
      </footer>

      {/* Schema */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "TidyWise Scheduling Software",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web, iOS, Android",
          "offers": { "@type": "Offer", "price": "50", "priceCurrency": "USD" },
          "description": "Cleaning scheduling software with visual calendar, recurring bookings, online booking portal, and automatic SMS reminders."
        })
      }} />
    </div>
  );
}
