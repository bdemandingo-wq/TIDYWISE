import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Check,
  ArrowRight,
  Users,
  TrendingUp,
  Smartphone,
  BarChart3,
  MessageSquare,
  CreditCard,
  MapPin,
  Star
} from "lucide-react";

const crmFeatures = [
  {
    icon: Users,
    title: "Customer Database",
    description: "Store all customer info, service history, preferences, and notes in one place"
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "Drag-and-drop calendar with automated reminders and recurring bookings"
  },
  {
    icon: MessageSquare,
    title: "Client Communication",
    description: "SMS and email notifications, automated follow-ups, and review requests"
  },
  {
    icon: CreditCard,
    title: "Payment Processing",
    description: "Accept cards, send invoices, and track payments with Stripe integration"
  },
  {
    icon: MapPin,
    title: "Route Optimization",
    description: "GPS-based job assignments and travel time estimates for field staff"
  },
  {
    icon: BarChart3,
    title: "Business Analytics",
    description: "Revenue forecasting, P&L reports, and customer lifetime value tracking"
  }
];

const cities = [
  "Los Angeles", "Houston", "Phoenix", "San Antonio", "Dallas", "Austin",
  "Miami", "Atlanta", "Denver", "Seattle", "Boston", "Chicago", "Las Vegas",
  "San Diego", "Orlando", "Tampa", "Charlotte", "Nashville", "Portland", "Minneapolis"
];

export default function CleaningBusinessCRM() {
  return (
    <div className="min-h-screen bg-background">
      <Seo 
        title="Best CRM for Cleaning Business (2026) | Maid Service Software"
        description="Find the best CRM for your cleaning business. Compare top cleaning business CRM software with scheduling, invoicing, GPS tracking & customer management. Free trial available."
        canonicalPath="/blog/crm-for-cleaning-business"
      />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2">
              <span className="font-bold text-xl text-foreground">TIDYWISE</span>
            </Link>
            <Button asChild>
              <Link to="/auth">Start Free Trial</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Article */}
      <article className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Breadcrumb */}
          <Link 
            to="/blog" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>

          {/* Header */}
          <header className="mb-12">
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4 flex-wrap">
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-medium">
                CRM Software
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                12 min read
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Updated February 2026
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-6">
              Best CRM for Cleaning Business: Complete Guide to Maid Service Software
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              A <strong>CRM for cleaning business</strong> is essential for managing customers, scheduling jobs, and growing your maid service. This guide covers everything you need to choose the right <strong>cleaning business CRM software</strong> in 2026.
            </p>
          </header>

          {/* Quick Summary */}
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-6 mb-12">
            <h2 className="text-xl font-bold text-foreground mb-3">🏆 Best CRM for Cleaning Business: Quick Answer</h2>
            <p className="text-muted-foreground mb-4">
              <strong>TIDYWISE</strong> is the #1 rated CRM built specifically for cleaning businesses. It combines customer management, scheduling, invoicing, and team coordination in one platform—starting at just $50/month with a 2-month free trial.
            </p>
            <Button asChild>
              <Link to="/auth">Try TIDYWISE Free for 60 Days <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>

          {/* Table of Contents */}
          <nav className="bg-card border border-border rounded-xl p-6 mb-12">
            <h2 className="text-lg font-bold text-foreground mb-4">📋 What You&apos;ll Learn</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li>• <a href="#what-is-crm" className="text-primary hover:underline">What is a CRM for cleaning business?</a></li>
              <li>• <a href="#key-features" className="text-primary hover:underline">Must-have features in cleaning business CRM software</a></li>
              <li>• <a href="#benefits" className="text-primary hover:underline">How a CRM helps maid services grow revenue</a></li>
              <li>• <a href="#local-crm" className="text-primary hover:underline">Finding CRM for cleaning business near you</a></li>
              <li>• <a href="#comparison" className="text-primary hover:underline">Top cleaning CRM software compared</a></li>
            </ul>
          </nav>

          {/* Main Content */}
          <div className="prose prose-lg max-w-none dark:prose-invert">
            <section id="what-is-crm" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                What is a CRM for Cleaning Business?
              </h2>
              <p className="text-muted-foreground mb-4">
                A <strong>CRM (Customer Relationship Management) for cleaning business</strong> is specialized software designed to help maid services, janitorial companies, and residential cleaning businesses manage their operations. Unlike generic CRMs like Salesforce or HubSpot, a <strong>cleaning business CRM</strong> includes industry-specific features:
              </p>
              <ul className="space-y-2 text-muted-foreground mb-6">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Job scheduling</strong> with drag-and-drop calendars</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Recurring booking management</strong> for weekly/biweekly clients</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Staff dispatching</strong> with GPS check-ins</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Automated reminders</strong> via SMS and email</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Online booking forms</strong> for lead capture</span>
                </li>
              </ul>
            </section>

            <section id="key-features" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-6">
                Must-Have Features in Cleaning Business CRM Software
              </h2>
              <div className="grid md:grid-cols-2 gap-4 not-prose">
                {crmFeatures.map((feature) => (
                  <div key={feature.title} className="bg-card border border-border rounded-lg p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <feature.icon className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-foreground">{feature.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="benefits" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                How a CRM Helps Cleaning Businesses Grow Revenue
              </h2>
              <p className="text-muted-foreground mb-4">
                Cleaning companies using dedicated <strong>maid service CRM software</strong> report significant improvements:
              </p>
              <div className="grid sm:grid-cols-3 gap-4 not-prose mb-6">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
                  <TrendingUp className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">40%</p>
                  <p className="text-sm text-muted-foreground">Fewer no-shows with automated reminders</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-center">
                  <Smartphone className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">2 hrs</p>
                  <p className="text-sm text-muted-foreground">Saved daily on scheduling & admin</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-center">
                  <Star className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">3x</p>
                  <p className="text-sm text-muted-foreground">More reviews with auto-requests</p>
                </div>
              </div>
            </section>

            <section id="local-crm" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                CRM for Cleaning Business Near You
              </h2>
              <p className="text-muted-foreground mb-4">
                Whether you&apos;re searching for <strong>&quot;CRM for cleaning business near me&quot;</strong> or looking for software that works in your specific city, TIDYWISE serves cleaning companies across the United States and beyond:
              </p>
              <div className="flex flex-wrap gap-2 not-prose mb-6">
                {cities.map((city) => (
                  <span key={city} className="px-3 py-1 bg-secondary text-foreground text-sm rounded-full">
                    {city}
                  </span>
                ))}
              </div>
              <p className="text-muted-foreground">
                TIDYWISE is a cloud-based <strong>cleaning business CRM</strong> that works anywhere you have internet. No local installation required—access your customer data, schedule, and reports from any device.
              </p>
            </section>

            <section id="comparison" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                Top Cleaning Business CRM Software Compared
              </h2>
              <div className="bg-card rounded-xl border border-border overflow-x-auto not-prose">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-4 font-medium text-foreground">CRM Software</th>
                      <th className="text-center p-4 font-medium text-foreground">Price</th>
                      <th className="text-center p-4 font-medium text-foreground">Built for Cleaning</th>
                      <th className="text-center p-4 font-medium text-foreground">Free Trial</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="bg-primary/5">
                      <td className="p-4 font-medium text-primary">TIDYWISE</td>
                      <td className="p-4 text-center">$50/mo</td>
                      <td className="p-4 text-center"><Check className="h-5 w-5 text-green-500 mx-auto" /></td>
                      <td className="p-4 text-center text-green-600 font-medium">60 days</td>
                    </tr>
                    <tr>
                      <td className="p-4">Jobber</td>
                      <td className="p-4 text-center">$349/mo</td>
                      <td className="p-4 text-center text-muted-foreground">General field service</td>
                      <td className="p-4 text-center">14 days</td>
                    </tr>
                    <tr>
                      <td className="p-4">Booking Koala</td>
                      <td className="p-4 text-center">$197/mo</td>
                      <td className="p-4 text-center"><Check className="h-5 w-5 text-green-500 mx-auto" /></td>
                      <td className="p-4 text-center">14 days</td>
                    </tr>
                    <tr>
                      <td className="p-4">Housecall Pro</td>
                      <td className="p-4 text-center">$129/mo</td>
                      <td className="p-4 text-center text-muted-foreground">General field service</td>
                      <td className="p-4 text-center">14 days</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* FAQ Schema */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">
              Frequently Asked Questions About Cleaning Business CRMs
            </h2>
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="font-semibold text-foreground mb-2">What is the best CRM for a small cleaning business?</h3>
                <p className="text-muted-foreground text-sm">
                  TIDYWISE is the best CRM for small cleaning businesses because it&apos;s affordable ($50/month), easy to use, and includes all essential features like scheduling, invoicing, and customer management without expensive add-ons.
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="font-semibold text-foreground mb-2">Do I need a CRM for my maid service?</h3>
                <p className="text-muted-foreground text-sm">
                  Yes, if you have more than 5-10 recurring clients. A CRM helps you avoid double-bookings, reduces no-shows with automated reminders, and makes it easy to track customer preferences and payment history.
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="font-semibold text-foreground mb-2">Can I use a free CRM for my cleaning business?</h3>
                <p className="text-muted-foreground text-sm">
                  Free CRMs like HubSpot aren&apos;t designed for cleaning businesses and lack scheduling, dispatching, and invoicing features. TIDYWISE offers a 60-day free trial so you can test all features before committing.
                </p>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className="bg-gradient-to-r from-primary/20 to-accent/20 rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Ready to grow your cleaning business?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Join 500+ cleaning companies using TIDYWISE to manage customers, schedule jobs, and get paid faster. Start your 60-day free trial today.
            </p>
            <Button size="lg" asChild>
              <Link to="/auth">Start Free Trial <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </article>

      {/* JSON-LD Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": "Best CRM for Cleaning Business: Complete Guide to Maid Service Software",
            "description": "Find the best CRM for your cleaning business. Compare top cleaning business CRM software with scheduling, invoicing, GPS tracking & customer management.",
            "datePublished": "2026-02-01",
            "dateModified": "2026-02-04",
            "author": {
              "@type": "Organization",
              "name": "TIDYWISE"
            },
            "publisher": {
              "@type": "Organization",
              "name": "TIDYWISE",
              "url": "https://www.jointidywise.com"
            }
          })
        }}
      />

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-4xl mx-auto text-center text-sm text-muted-foreground">
          © 2026 TIDYWISE. The #1 CRM for cleaning business owners.
        </div>
      </footer>
    </div>
  );
}
