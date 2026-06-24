import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { CheckCircle2, XCircle, ArrowRight, Shield, DollarSign, Star, Sparkles } from "lucide-react";

const rows = [
  { feature: "Transparent flat-rate pricing", tidywise: true, fm: false },
  { feature: "Instant online quote (no phone call)", tidywise: true, fm: false },
  { feature: "100% satisfaction guarantee (re-clean free)", tidywise: true, fm: "Limited" },
  { feature: "Vetted, background-checked cleaners", tidywise: true, fm: true },
  { feature: "Eco-friendly products on request", tidywise: true, fm: true },
  { feature: "Same-cleaner option for recurring visits", tidywise: true, fm: false },
  { feature: "Real-time on-the-way SMS + GPS tracking", tidywise: true, fm: false },
  { feature: "Move-in / Move-out deep cleans", tidywise: true, fm: true },
  { feature: "Airbnb / short-term turnovers", tidywise: true, fm: "Limited" },
  { feature: "Recurring discounts (weekly/bi-weekly)", tidywise: "Up to 20%", fm: "Up to 10%" },
  { feature: "No long-term contracts", tidywise: true, fm: true },
];

export default function CompareFloridaMaid() {
  const navigate = useNavigate();
  const cta = () => navigate("/");

  const render = (v: boolean | string) => {
    if (v === true) return <CheckCircle2 className="h-5 w-5 text-success mx-auto" />;
    if (v === false) return <XCircle className="h-5 w-5 text-destructive mx-auto" />;
    return <span className="text-muted-foreground text-sm">{v}</span>;
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="TIDYWISE vs The Florida Maid: South Florida Cleaning Compared"
        description="Compare TIDYWISE Cleaning vs The Florida Maid for house cleaning in Fort Lauderdale, Boca Raton & Broward County. Transparent pricing, satisfaction guarantee, and instant online booking."
        canonical="/compare/florida-maid"
      />
      <BreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Compare", path: "/compare" },
          { name: "TIDYWISE vs The Florida Maid", path: "/compare/florida-maid" },
        ]}
      />

      <nav className="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="font-bold text-xl text-foreground">TIDYWISE</Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/services/deep-vs-standard")}>Services</Button>
            <Button onClick={cta}>Get instant quote</Button>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4" /> South Florida cleaning comparison
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
            TIDYWISE vs The Florida Maid
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Choosing a house cleaner in Fort Lauderdale or Boca Raton? Here's an honest, side-by-side look
            at how TIDYWISE Cleaning compares to The Florida Maid — pricing, guarantees, and what's actually included.
          </p>
          <Button size="lg" className="h-12 px-8" onClick={cta}>
            Get my instant quote <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-sm text-muted-foreground mt-4">No phone calls. No surprise fees. Re-clean guarantee.</p>
        </div>
      </section>

      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div><div className="text-3xl font-bold text-primary">60 sec</div><p className="text-sm text-muted-foreground">Online booking</p></div>
          <div><div className="text-3xl font-bold text-primary">100%</div><p className="text-sm text-muted-foreground">Satisfaction guarantee</p></div>
          <div><div className="text-3xl font-bold text-primary">Up to 20%</div><p className="text-sm text-muted-foreground">Recurring discount</p></div>
          <div><div className="text-3xl font-bold text-primary">4.9★</div><p className="text-sm text-muted-foreground">Customer rating</p></div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-4">Side-by-side comparison</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Based on each company's publicly listed services and booking experience as of 2026.
          </p>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-secondary/50">
                    <th className="text-left p-4 font-semibold text-foreground">Feature</th>
                    <th className="text-center p-4 font-semibold text-primary">TIDYWISE</th>
                    <th className="text-center p-4 font-semibold text-muted-foreground">The Florida Maid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.feature} className={i % 2 === 0 ? "bg-background" : "bg-secondary/20"}>
                      <td className="p-4 text-foreground font-medium">{r.feature}</td>
                      <td className="p-4 text-center">{render(r.tidywise)}</td>
                      <td className="p-4 text-center">{render(r.fm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-8 text-center">
            <Button size="lg" onClick={cta}>Book TIDYWISE today <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-12">Why South Florida picks TIDYWISE</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card rounded-xl p-6 border border-border">
              <DollarSign className="h-6 w-6 text-primary mb-3" />
              <h3 className="text-lg font-semibold mb-2">Pricing you can see</h3>
              <p className="text-muted-foreground">No call-for-quote. Pick your home size, see the price, book in 60 seconds.</p>
            </div>
            <div className="bg-card rounded-xl p-6 border border-border">
              <Shield className="h-6 w-6 text-primary mb-3" />
              <h3 className="text-lg font-semibold mb-2">Re-clean guarantee</h3>
              <p className="text-muted-foreground">Not happy with a spot? We come back and re-clean it free within 24 hours.</p>
            </div>
            <div className="bg-card rounded-xl p-6 border border-border">
              <Star className="h-6 w-6 text-primary mb-3" />
              <h3 className="text-lg font-semibold mb-2">Same cleaner, every time</h3>
              <p className="text-muted-foreground">Recurring clients get the same vetted cleaner who already knows your home.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">Try TIDYWISE risk-free</h2>
          <p className="text-lg text-primary-foreground/80 mb-8">Instant online quote. Real cleaners. Real guarantee.</p>
          <Button size="lg" variant="secondary" className="h-12 px-8" onClick={cta}>
            Get instant quote <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-muted-foreground">© 2026 TIDYWISE Cleaning · Serving Fort Lauderdale, Boca Raton & Broward County.</p>
          <div className="flex flex-wrap justify-center gap-6 mt-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground">Home</Link>
            <Link to="/services/deep-vs-standard" className="text-muted-foreground hover:text-foreground">Deep vs Standard Clean</Link>
            <Link to="/blog" className="text-muted-foreground hover:text-foreground">Blog</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
