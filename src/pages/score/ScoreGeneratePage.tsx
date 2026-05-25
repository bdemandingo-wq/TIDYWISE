import { useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";
import { toast } from "@/hooks/use-toast";

// Pull a state code out of the user's "location" search param if they
// typed something like "Pompano Beach, FL" or just "FL".
function extractStateCode(loc: string): string {
  const m = loc.match(/\b([A-Z]{2})\b/i);
  return m ? m[1].toUpperCase() : "";
}

function extractCity(loc: string): string {
  // "Pompano Beach, FL" → "Pompano Beach"; "33442" → ""; "FL" → ""
  const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[0];
  if (/^\d{5}$/.test(loc.trim())) return "";
  if (/^[A-Z]{2}$/i.test(loc.trim())) return "";
  return parts[0] ?? "";
}

export default function ScoreGeneratePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const prefName = params.get("name") ?? "";
  const prefLocation = params.get("location") ?? "";

  const initialCity = useMemo(() => extractCity(prefLocation), [prefLocation]);
  const initialState = useMemo(() => extractStateCode(prefLocation), [prefLocation]);
  const initialZip = useMemo(
    () => (/^\d{5}$/.test(prefLocation.trim()) ? prefLocation.trim() : ""),
    [prefLocation]
  );

  const [name, setName] = useState(prefName);
  const [city, setCity] = useState(initialCity);
  const [state, setState] = useState(initialState);
  const [zip, setZip] = useState(initialZip);
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim() && city.trim() && state.trim() && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("score-create", {
      body: {
        name: name.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim() || null,
        website: website.trim() || null,
        phone: phone.trim() || null,
      },
    });
    if (error || !data?.slug) {
      toast({ title: "Couldn't generate score", description: error?.message ?? "Please try again.", variant: "destructive" });
      setSubmitting(false);
      return;
    }
    navigate(`/score/c/${data.slug}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Generate your TidyWise Score"
        description="Generate a free TidyWise Score for your cleaning business — no signup required."
      />
      <div className="max-w-xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to TidyWise
        </Link>

        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">TidyWise Score</p>
        <h1 className="font-serif text-4xl text-foreground mb-2">Generate your score</h1>
        <p className="text-muted-foreground mb-8">
          Free, no signup needed. We'll analyze public signals about your business and grade it on reviews, reputation, and online presence.
        </p>

        <Card variant="elevated" className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="biz-name">Business name *</Label>
              <Input
                id="biz-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. TidyWise Cleaning"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="biz-city">City *</Label>
                <Input
                  id="biz-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Pompano Beach"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-state">State *</Label>
                <Input
                  id="biz-state"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="FL"
                  maxLength={2}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-zip">ZIP code</Label>
              <Input
                id="biz-zip"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="33442"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-web">
                Website <span className="text-muted-foreground">(boosts your score)</span>
              </Label>
              <Input
                id="biz-web"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="tidywise.com"
                inputMode="url"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-phone">
                Phone <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="biz-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                inputMode="tel"
              />
            </div>

            <Button type="submit" variant="premium" size="lg" className="w-full gap-2" disabled={!canSubmit}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {submitting ? "Generating…" : "Generate my score"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              No account required. We'll score your business and show you the result.
            </p>
          </form>
        </Card>

        {/* Always-rendered context so the page has real substance for crawlers and visitors. */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="font-serif text-2xl text-foreground mb-3">What is the TidyWise Score?</h2>
            <p className="text-muted-foreground leading-relaxed">
              The TidyWise Score is a free, public 0–100 grade for cleaning businesses in
              the United States. It blends signals homeowners already use when picking a
              cleaner — Google reviews, review recency, AI sentiment across reliability,
              communication, quality, and value, plus website signals like HTTPS, mobile
              friendliness, and whether the business offers online booking.
            </p>
          </div>

          <div>
            <h2 className="font-serif text-2xl text-foreground mb-3">Why generate yours</h2>
            <p className="text-muted-foreground leading-relaxed">
              Getting a TidyWise Score takes under a minute and creates a public profile
              for your business that ranks against competitors in your city. A high score
              becomes a trust signal you can link to from your website, share on social,
              and use in proposals. A low score points out exactly which signals to
              improve first — usually review recency or a missing online booking flow.
            </p>
          </div>

          <div>
            <h2 className="font-serif text-2xl text-foreground mb-3">How it works</h2>
            <ol className="space-y-2 text-muted-foreground list-decimal pl-5">
              <li>Submit your business name, city/state, and website.</li>
              <li>We pull your public Google Places listing and recent reviews.</li>
              <li>Our AI grades sentiment across reliability, communication, quality, and value.</li>
              <li>We probe your website for HTTPS, mobile viewport, load time, and online booking.</li>
              <li>Everything weights into a single 0–100 score and a letter grade (A–F).</li>
              <li>Your profile goes live at a clean URL you can share or claim.</li>
            </ol>
          </div>

          <div>
            <h2 className="font-serif text-2xl text-foreground mb-3">Privacy &amp; data</h2>
            <p className="text-muted-foreground leading-relaxed">
              We only use publicly available information about your business — nothing
              behind a login. You can request edits or take-down at any time by claiming
              your profile after it's generated, or by emailing us. No credit card. No
              forced signup. No data sale.
            </p>
          </div>

          <div className="border-t pt-6">
            <h2 className="font-serif text-2xl text-foreground mb-3">Explore TidyWise</h2>
            <ul className="grid sm:grid-cols-2 gap-2 text-sm">
              <li><Link to="/score/search" className="text-primary hover:underline">Search any cleaning company →</Link></li>
              <li><Link to="/cleaning-business-software" className="text-primary hover:underline">Cleaning software by state →</Link></li>
              <li><Link to="/pricing" className="text-primary hover:underline">TidyWise pricing →</Link></li>
              <li><Link to="/demo" className="text-primary hover:underline">Book a product demo →</Link></li>
              <li><Link to="/blog" className="text-primary hover:underline">Cleaning business blog →</Link></li>
              <li><Link to="/contact" className="text-primary hover:underline">Contact our team →</Link></li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
