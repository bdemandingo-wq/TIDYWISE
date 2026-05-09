import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";

type Result = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  score: number | null;
  score_grade: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  source: string;
};

export default function ScoreSearchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const name = params.get("name") ?? "";
  const location = params.get("location") ?? "";
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("score-lookup", {
        body: { name, location },
      });
      if (!cancelled) {
        setResults(error ? [] : (data?.results ?? []));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [name, location]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={`TidyWise Score — search "${name}"`}
        description={`Find the TidyWise Score for ${name} and other cleaning businesses${location ? ` in ${location}` : ""}.`}
      />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to TidyWise
        </Link>

        <h1 className="font-serif text-4xl text-foreground mb-2">Search results</h1>
        <p className="text-muted-foreground mb-8">
          {name ? <>Results for <span className="font-medium text-foreground">"{name}"</span>{location && <> in {location}</>}.</> : "Enter a business name."}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Searching cleaning companies…
          </div>
        ) : results.length === 0 ? (
          <Card variant="elevated" className="p-10 text-center">
            <p className="text-foreground font-medium mb-2">We haven't scored your business yet.</p>
            <p className="text-sm text-muted-foreground mb-6">Claim your free profile and we'll generate your TidyWise Score.</p>
            <Button variant="premium" onClick={() => navigate("/signup")}>
              <Sparkles className="h-4 w-4 mr-2" /> Claim your free profile
            </Button>
          </Card>
        ) : (
          <Card variant="elevated" className="overflow-hidden">
            <ol>
              {results.map((r) => (
                <li key={r.id} className="border-b border-border/50 last:border-0">
                  <Link
                    to={`/score/c/${r.slug}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[r.city, r.state].filter(Boolean).join(", ") || "Location unknown"}
                        {r.google_rating != null && ` · ${r.google_rating}★ (${r.google_review_count})`}
                      </p>
                    </div>
                    <div className="text-right">
                      {r.score != null ? (
                        <>
                          <div className="font-serif text-2xl text-foreground tabular-nums leading-none">{r.score}</div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Grade {r.score_grade}</div>
                        </>
                      ) : (
                        <span className="text-xs text-primary">Generate score →</span>
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
