import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";

type Row = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  score: number | null;
  score_grade: string | null;
  google_rating: number | null;
  google_review_count: number | null;
};

export default function ScoreCityPage() {
  const { citySlug } = useParams<{ citySlug: string }>();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityMeta, setCityMeta] = useState<{ city: string; state: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: cityRow }, { data: companies }] = await Promise.all([
        supabase.from("score_top_cities").select("city, state").eq("city_slug", citySlug!).maybeSingle(),
        supabase
          .from("score_companies")
          .select("id, slug, name, city, state, score, score_grade, google_rating, google_review_count")
          .eq("city_slug", citySlug!)
          .order("score", { ascending: false, nullsFirst: false })
          .limit(100),
      ]);
      if (cancelled) return;
      setCityMeta(cityRow ?? (companies?.[0] ? { city: companies[0].city ?? "", state: companies[0].state ?? "" } : null));
      setRows(companies ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [citySlug]);

  const label = cityMeta ? `${cityMeta.city}, ${cityMeta.state}` : citySlug;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={`Top cleaning companies in ${label} — TidyWise Score`}
        description={`Ranked list of cleaning companies in ${label} by their TidyWise Score (reviews, reputation, and online presence).`}
      />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to TidyWise
        </Link>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">TidyWise Score · City rankings</p>
        <h1 className="font-serif text-4xl sm:text-5xl text-foreground mb-2">Cleaning companies in {label}</h1>
        <p className="text-muted-foreground mb-10">
          Ranked by the TidyWise Score — an AI-driven analysis of public reviews, reputation, and online presence.
        </p>

        {loading ? (
          <p className="text-muted-foreground">Loading rankings…</p>
        ) : rows.length === 0 ? (
          <Card variant="elevated" className="p-10 text-center">
            <p className="text-foreground font-medium mb-2">No companies scored in {label} yet.</p>
            <p className="text-sm text-muted-foreground">Search for one from the homepage to generate the first score.</p>
          </Card>
        ) : (
          <Card variant="elevated" className="overflow-hidden">
            <ol>
              {rows.map((c, i) => (
                <li key={c.id} className="border-b border-border/50 last:border-0">
                  <Link to={`/score/c/${c.slug}`} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
                    <span className="font-serif text-2xl text-muted-foreground w-10 tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.google_rating != null ? `${c.google_rating}★ (${c.google_review_count} reviews)` : "Awaiting reviews"}
                      </p>
                    </div>
                    <div className="text-right">
                      {c.score != null ? (
                        <>
                          <div className="font-serif text-2xl text-foreground tabular-nums leading-none">{c.score}</div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Grade {c.score_grade}</div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pending</span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </div>
  );
}
