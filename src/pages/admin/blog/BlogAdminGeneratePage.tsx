import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface GenResult {
  keyword: string;
  ok: boolean;
  error?: string;
  slug?: string;
  title?: string;
}

export default function BlogAdminGeneratePage() {
  const [keywordsText, setKeywordsText] = useState("");
  const [results, setResults] = useState<GenResult[]>([]);

  const run = useMutation({
    mutationFn: async () => {
      const keywords = keywordsText
        .split("\n")
        .map((k) => k.trim())
        .filter(Boolean);
      if (keywords.length === 0) throw new Error("Enter at least one keyword");
      if (keywords.length > 25) throw new Error("Limit to 25 keywords per batch");

      const out: GenResult[] = [];
      for (const keyword of keywords) {
        try {
          const { data, error } = await supabase.functions.invoke("generate-daily-blogs", {
            body: { keywords: [keyword] },
          });
          if (error) throw error;
          const post = data?.results?.[0];
          out.push({ keyword, ok: !!post?.ok, error: post?.error, slug: post?.slug, title: post?.title });
          setResults([...out]);
        } catch (e) {
          out.push({ keyword, ok: false, error: e instanceof Error ? e.message : "Unknown error" });
          setResults([...out]);
        }
      }
      return out;
    },
    onSuccess: (out) => {
      const ok = out.filter((r) => r.ok).length;
      toast.success(`Generated ${ok}/${out.length} drafts`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button asChild variant="ghost" size="sm"><Link to="/admin/blog"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
          <h1 className="text-2xl font-bold text-foreground">Bulk Generate Drafts</h1>
        </div>

        <Card className="p-6 space-y-4">
          <div>
            <Label htmlFor="kw">Target Keywords</Label>
            <Textarea
              id="kw"
              rows={10}
              placeholder={"One keyword per line. Example:\nhouse cleaning pricing guide\nairbnb cleaning checklist\nhow to retain cleaning clients"}
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Each keyword generates one draft (status = draft, not published). 1500-word minimum, 5-question FAQ, dedupe by title/slug.
            </p>
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {run.isPending ? "Generating…" : "Generate Drafts"}
          </Button>
        </Card>

        {results.length > 0 && (
          <Card className="mt-6 p-6">
            <h3 className="font-semibold mb-3">Results</h3>
            <ul className="space-y-2 text-sm">
              {results.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className={r.ok ? "text-emerald-500" : "text-destructive"}>{r.ok ? "✓" : "✗"}</span>
                  <span className="font-medium">{r.keyword}</span>
                  {r.title && <span className="text-muted-foreground">→ {r.title}</span>}
                  {r.error && <span className="text-destructive ml-auto">{r.error}</span>}
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button asChild variant="outline" size="sm"><Link to="/admin/blog">View all drafts</Link></Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
