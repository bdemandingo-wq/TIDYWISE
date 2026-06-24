import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { CheckCircle2, Minus, ArrowRight, Sparkles, Download } from "lucide-react";

type Cell = boolean | string;
const rows: { area: string; task: string; standard: Cell; deep: Cell }[] = [
  { area: "Kitchen", task: "Wipe counters, sink, exterior of appliances", standard: true, deep: true },
  { area: "Kitchen", task: "Clean inside microwave", standard: true, deep: true },
  { area: "Kitchen", task: "Clean inside oven", standard: false, deep: true },
  { area: "Kitchen", task: "Clean inside fridge", standard: false, deep: true },
  { area: "Kitchen", task: "Degrease range hood & backsplash", standard: false, deep: true },
  { area: "Kitchen", task: "Hand-wipe cabinet fronts", standard: "Spot only", deep: true },

  { area: "Bathrooms", task: "Scrub toilets, sinks, mirrors", standard: true, deep: true },
  { area: "Bathrooms", task: "Scrub shower / tub", standard: true, deep: true },
  { area: "Bathrooms", task: "Scrub grout & tile", standard: false, deep: true },
  { area: "Bathrooms", task: "Descale shower glass & fixtures", standard: false, deep: true },
  { area: "Bathrooms", task: "Wipe inside vanity cabinets", standard: false, deep: true },

  { area: "Bedrooms & living", task: "Dust all reachable surfaces", standard: true, deep: true },
  { area: "Bedrooms & living", task: "Make beds & change linens (if left out)", standard: true, deep: true },
  { area: "Bedrooms & living", task: "Hand-wipe baseboards", standard: false, deep: true },
  { area: "Bedrooms & living", task: "Hand-wipe door frames, light switches, outlets", standard: false, deep: true },
  { area: "Bedrooms & living", task: "Dust ceiling fans & light fixtures", standard: "Reachable", deep: true },
  { area: "Bedrooms & living", task: "Dust blinds & window sills", standard: "Light dust", deep: true },

  { area: "Floors", task: "Vacuum carpets & rugs", standard: true, deep: true },
  { area: "Floors", task: "Mop hard floors", standard: true, deep: true },
  { area: "Floors", task: "Edge & detail vacuum corners", standard: false, deep: true },
  { area: "Floors", task: "Hand-clean baseboards along every wall", standard: false, deep: true },

  { area: "Whole home", task: "Empty trash & replace liners", standard: true, deep: true },
  { area: "Whole home", task: "Spot-clean walls & doors", standard: "Spot only", deep: true },
  { area: "Whole home", task: "Interior window sills & tracks", standard: false, deep: true },
];

export default function DeepVsStandardClean() {
  const navigate = useNavigate();
  const cta = () => navigate("/");

  const render = (v: Cell) => {
    if (v === true) return <CheckCircle2 className="h-5 w-5 text-success mx-auto" />;
    if (v === false) return <Minus className="h-4 w-4 text-muted-foreground mx-auto" />;
    return <span className="text-muted-foreground text-xs">{v}</span>;
  };

  const faqs = [
    {
      q: "How often should I book a Deep Clean?",
      a: "Most homes do well with a Deep Clean every 3–6 months, with Standard Cleans in between. Pets, kids, or heavy cooking usually push that closer to every 3 months.",
    },
    {
      q: "Do I need a Deep Clean for my first visit?",
      a: "If your home hasn't been professionally cleaned in the last 30 days, we recommend starting with a Deep Clean so your recurring Standard Cleans stay on track.",
    },
    {
      q: "How much longer does a Deep Clean take?",
      a: "Typically 1.5–2× the time of a Standard Clean. A 3-bed/2-bath Standard runs ~2.5 hours; the matching Deep Clean is ~4–5 hours.",
    },
    {
      q: "Is move-in / move-out cleaning the same as a Deep Clean?",
      a: "It's close, but move-out cleans also include inside-of-cabinets and full appliance interiors as a required part of the scope. Book the Move-Out service for those.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Deep Clean vs Standard Clean: What's Included | TIDYWISE"
        description="Side-by-side breakdown of every task in a TIDYWISE Standard Clean vs Deep Clean — so you know exactly what you're paying for before you book."
        canonical="/services/deep-vs-standard"
      />
      <BreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Services", path: "/services" },
          { name: "Deep vs Standard Clean", path: "/services/deep-vs-standard" },
        ]}
      />

      <nav className="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="font-bold text-xl text-foreground">TIDYWISE</Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/compare/florida-maid")}>Compare</Button>
            <Button onClick={cta}>Get instant quote</Button>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4" /> Service breakdown
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
            Deep Clean vs Standard Clean
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Every task we do, side-by-side. No vague "we clean the kitchen" — see exactly what's
            included so you can pick the right service the first time.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="h-12 px-8" onClick={cta}>Book a clean <ArrowRight className="ml-2 h-4 w-4" /></Button>
            <Button size="lg" variant="outline" className="h-12 px-8" onClick={() => document.getElementById("table")?.scrollIntoView({ behavior: "smooth" })}>
              Jump to checklist
            </Button>
          </div>
        </div>
      </section>

      <section id="table" className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-secondary/50">
                    <th className="text-left p-4 font-semibold text-foreground">Area</th>
                    <th className="text-left p-4 font-semibold text-foreground">Task</th>
                    <th className="text-center p-4 font-semibold text-muted-foreground">Standard</th>
                    <th className="text-center p-4 font-semibold text-primary">Deep</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.task} className={i % 2 === 0 ? "bg-background" : "bg-secondary/20"}>
                      <td className="p-4 text-sm text-muted-foreground">{r.area}</td>
                      <td className="p-4 text-foreground">{r.task}</td>
                      <td className="p-4 text-center">{render(r.standard)}</td>
                      <td className="p-4 text-center">{render(r.deep)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-4">
            "Spot only" / "Reachable" = touched if visibly needed, not as a full pass.
          </p>
        </div>
      </section>

      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto bg-card border border-border rounded-2xl p-8 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium mb-3">
              <Download className="h-3.5 w-3.5" /> Free download
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Fort Lauderdale Move-Out Cleaning Checklist</h3>
            <p className="text-muted-foreground">
              The exact PDF checklist our crews use to help South Florida renters get 100% of their security deposit back.
            </p>
          </div>
          <Button asChild size="lg" className="h-12 px-6 shrink-0">
            <a href="/fort-lauderdale-move-out-checklist.pdf" download>
              Download PDF <Download className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>



      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-12">When to book each one</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl p-6 border border-border">
              <h3 className="text-xl font-semibold mb-3">Standard Clean</h3>
              <p className="text-muted-foreground mb-4">
                The maintenance visit. Best when your home is already in decent shape and you're keeping it that way.
              </p>
              <ul className="space-y-2 text-sm text-foreground">
                <li>· Weekly or bi-weekly recurring service</li>
                <li>· "We had cleaners last month, just keeping up"</li>
                <li>· Tidy office or condo with light foot traffic</li>
              </ul>
            </div>
            <div className="bg-card rounded-xl p-6 border border-border ring-2 ring-primary/40">
              <h3 className="text-xl font-semibold mb-3">Deep Clean</h3>
              <p className="text-muted-foreground mb-4">
                The reset. Best for first-time visits, seasonal refreshes, or anything that needs more than a wipe-down.
              </p>
              <ul className="space-y-2 text-sm text-foreground">
                <li>· First visit before starting recurring service</li>
                <li>· Pre-listing, post-renovation, post-holiday</li>
                <li>· Homes with pets, kids, or heavy cooking</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-10">Frequently asked</h2>
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="bg-card rounded-xl p-6 border border-border">
                <h3 className="font-semibold text-foreground mb-2">{f.q}</h3>
                <p className="text-muted-foreground">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">Not sure which to book?</h2>
          <p className="text-lg text-primary-foreground/80 mb-8">
            Get an instant quote for both — pick the one that fits.
          </p>
          <Button size="lg" variant="secondary" className="h-12 px-8" onClick={cta}>
            Get instant quote <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-muted-foreground">© 2026 TIDYWISE Cleaning</p>
          <div className="flex flex-wrap justify-center gap-6 mt-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground">Home</Link>
            <Link to="/compare/florida-maid" className="text-muted-foreground hover:text-foreground">vs The Florida Maid</Link>
            <Link to="/blog" className="text-muted-foreground hover:text-foreground">Blog</Link>
          </div>
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
    </div>
  );
}
