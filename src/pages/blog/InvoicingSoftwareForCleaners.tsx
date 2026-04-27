import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from '@/components/SEOHead';
import { RelatedArticles, allArticles } from "@/components/blog/RelatedArticles";
import { ArrowLeft, Menu, X } from "lucide-react";
import { useState } from "react";

export default function InvoicingSoftwareForCleaners() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Invoicing Software for Cleaning Businesses (2026)"
        description="The best invoicing software for cleaning businesses: automatic invoices, recurring billing, card-on-file charging, and deposit collection."
        canonical="/blog/invoicing-software-for-cleaning-business"
        ogImage="/images/tidywise-og.png"
        schemaJson={{
          "@type": "BlogPosting",
          "headline": "Invoicing Software for Cleaning Businesses — Get Paid Faster",
          "description": "The best invoicing software for cleaning businesses. Automatic invoices, recurring billing, and card-on-file charging.",
          "datePublished": "2026-04-13",
          "dateModified": "2026-04-13",
          "author": { "@type": "Organization", "name": "TidyWise" },
        }}
      />

      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <a href="/" className="font-bold text-xl text-foreground">TIDYWISE</a>
            <div className="hidden md:flex items-center gap-8">
              <a href="/blog" className="text-muted-foreground hover:text-foreground">Blog</a>
              <a href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</a>
              <Button variant="ghost" onClick={() => navigate("/login")}>Log In</Button>
              <Button onClick={() => navigate("/signup")}>Start Free Trial</Button>
            </div>
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-border space-y-3">
              <a href="/blog" className="block px-4 py-2 text-muted-foreground hover:text-foreground">Blog</a>
              <a href="/pricing" className="block px-4 py-2 text-muted-foreground hover:text-foreground">Pricing</a>
              <div className="px-4 flex gap-2">
                <Button variant="ghost" onClick={() => navigate("/login")} className="flex-1">Log In</Button>
                <Button onClick={() => navigate("/signup")} className="flex-1">Start Free</Button>
              </div>
            </div>
          )}
        </div>
      </nav>

      <article className="pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" className="mb-6" onClick={() => navigate("/blog")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Blog
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">Payments</span>
            <span>· 7 min read</span>
            <span>· April 2026</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">Invoicing Software for Cleaning Businesses — Get Paid Faster</h1>

          <div className="prose prose-lg max-w-none text-foreground space-y-6">
            <p className="text-muted-foreground text-lg">
              Manual invoicing is one of the biggest revenue leaks in a cleaning business. Jobs get billed late, at the wrong amount, or occasionally not at all. Clients pay slowly when they have to write a check. And every hour you spend chasing payments is an hour not spent growing the business. Good invoicing software eliminates all of this — here's what to look for.
            </p>

            <h2 className="text-2xl font-bold mt-8">The Invoicing Challenges Unique to Cleaning Businesses</h2>
            <p className="text-muted-foreground">
              Cleaning businesses have billing patterns that generic invoicing tools don't handle well:
            </p>
            <ul className="space-y-3 text-muted-foreground list-none pl-0">
              {[
                { title: "High volume of small recurring invoices", desc: "A 50-client business generates 100+ invoices per month — mostly for recurring jobs. Manual invoicing at this volume takes hours weekly. Automation is essential, not optional." },
                { title: "Variable job pricing", desc: "Job prices change based on home size, extras added, one-off services, or seasonal deep cleans. The invoicing system needs to pull from the actual job record, not a fixed template." },
                { title: "Tips that vary per job", desc: "Tips need to be captured separately from job revenue, tracked per cleaner, and reported accurately for payroll. Generic invoicing tools treat tips as line items rather than separate pay components." },
                { title: "Card-on-file for recurring clients", desc: "Asking a recurring client to pay via check or link every visit creates friction and slow payment. The default should be card-on-file auto-charge after each completed job." },
                { title: "Deposit collection for new clients", desc: "Many cleaning businesses require a deposit for first-time or move-in/move-out jobs. Invoicing software should support collecting deposits before the job, with the balance collected after." },
              ].map((f) => (
                <li key={f.title} className="flex gap-3">
                  <span className="text-primary font-bold mt-1">→</span>
                  <div><strong className="text-foreground">{f.title}.</strong> {f.desc}</div>
                </li>
              ))}
            </ul>

            <h2 className="text-2xl font-bold mt-8">What Good Invoicing Software Does for Cleaners</h2>

            <h3 className="text-xl font-semibold mt-6">Automatic invoice generation</h3>
            <p className="text-muted-foreground">
              When a cleaner marks a job complete in the app, the invoice should be generated and sent automatically — no action required from you. The invoice pulls the price from the booking, adds any extras logged during the job, and sends to the client's email on file. Zero manual work.
            </p>

            <h3 className="text-xl font-semibold mt-6">Card-on-file auto-charge</h3>
            <p className="text-muted-foreground">
              For recurring clients, you shouldn't be sending invoice links and waiting for payment. The client saves their card when they first book, and future jobs are charged automatically after completion. They get a receipt, you get paid — no follow-up needed.
            </p>

            <h3 className="text-xl font-semibold mt-6">Automated payment reminders</h3>
            <p className="text-muted-foreground">
              For clients on net terms or those who prefer to pay manually, automated reminders at 3, 7, and 14 days past due collect most outstanding invoices without any manual outreach. The software sends the reminder, you focus on other things.
            </p>

            <h3 className="text-xl font-semibold mt-6">Online payment links</h3>
            <p className="text-muted-foreground">
              Every invoice should include a direct payment link that opens a hosted payment page. The client clicks, enters their card, and pays in under a minute. No logging into a portal, no mailing checks — frictionless payment collection.
            </p>

            <h3 className="text-xl font-semibold mt-6">Deposit collection</h3>
            <p className="text-muted-foreground">
              For first-time bookings or large jobs (move-in/move-out, post-construction), the booking flow should collect a deposit upfront — before the job is confirmed. This reduces cancellations and protects you from last-minute no-shows on big jobs.
            </p>

            <h2 className="text-2xl font-bold mt-8">Why Generic Invoicing Tools Fall Short</h2>
            <p className="text-muted-foreground">
              QuickBooks, FreshBooks, and Wave are excellent general invoicing tools. For a cleaning business, they have a critical gap: they don't know what jobs were completed, by whom, at what price, with what tips. That data lives in your scheduling system.
            </p>
            <p className="text-muted-foreground">
              Every time you invoice manually with a general tool, you're copying data from one system to another — which takes time and introduces errors. The right solution is invoicing built into your scheduling platform: a completed job automatically becomes an invoice. No data transfer, no manual step.
            </p>

            <h2 className="text-2xl font-bold mt-8">What to Look for in Cleaning Business Invoicing Software</h2>
            <div className="bg-muted/50 rounded-xl p-5 space-y-3">
              {[
                { label: "Connected to scheduling", desc: "Invoices pull from job records automatically — no re-entering prices or client details." },
                { label: "Card-on-file support", desc: "Recurring clients get auto-charged. No payment link required every visit." },
                { label: "Branded invoices", desc: "Your logo and business name on every invoice. Looks professional, reinforces your brand." },
                { label: "Payment history per client", desc: "See every invoice, payment, and outstanding balance for any client in seconds." },
                { label: "Stripe or equivalent integration", desc: "Reliable payment processing with reasonable rates. Avoid platforms with proprietary payment systems that lock you in." },
              ].map((item, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-primary font-bold mt-0.5">✓</span>
                  <div>
                    <strong className="text-foreground">{item.label}:</strong>
                    <span className="text-muted-foreground text-sm ml-1">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <h2 className="text-2xl font-bold mt-8">The Numbers That Change When Invoicing Is Automated</h2>
            <p className="text-muted-foreground">
              Cleaning businesses that switch to automated invoicing typically see:
            </p>
            <ul className="space-y-2 text-muted-foreground list-disc list-inside">
              <li>Average payment time drops from 14+ days to 2-3 days (card-on-file charges same-day)</li>
              <li>Outstanding receivables drop by 60-80% within 60 days</li>
              <li>3-5 hours per week recovered from manual invoicing and payment chasing</li>
              <li>Billing errors reduced to near zero (automated pricing from job records)</li>
            </ul>

            <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 mt-8">
              <h3 className="text-lg font-semibold text-foreground mb-2">TIDYWISE Invoicing — Automatic, Connected, Free</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Invoices generated automatically when jobs are completed, card-on-file auto-charge for recurring clients, deposit collection, branded receipts, and Stripe integration — included free with TIDYWISE.
              </p>
              <Button onClick={() => navigate("/signup")}>Start Free →</Button>
            </div>
          </div>

          <div className="mt-16">
            <RelatedArticles currentSlug="/blog/invoicing-software-for-cleaning-business" articles={allArticles} />
          </div>
        </div>
      </article>
    </div>
  );
}
