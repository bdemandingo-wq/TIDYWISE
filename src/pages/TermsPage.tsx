import { useNavigate } from "react-router-dom";
import { SEOHead } from '@/components/SEOHead';
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/SiteFooter";
import { ArrowLeft } from "lucide-react";
import { TermsContent } from "@/components/legal/termsContent";
import { READING_COLUMN_SM, READING_CARD_SM } from "@/components/ArticleBody";

/**
 * Public terms page. Its existence at a stable URL is itself dispute
 * evidence — the refund_policy_disclosure narrative cites this page.
 */
export default function TermsPage() {
  const navigate = useNavigate();
  return (
    <div className="portal-v2 portal-v2-scroll min-h-screen bg-background">
      <SEOHead
        title="Terms of Service | TidyWise"
        description="TidyWise Terms of Service, including billing, cancellation, and refund policy."
        canonical="/terms"
      />

      <header
        className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-foreground">TIDYWISE</span>
            <span className="text-sm text-muted-foreground">Terms of Service</span>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate('/');
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <article className={`rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10 ${READING_CARD_SM}`}>
          <div className={READING_COLUMN_SM}>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Terms of Service</h1>
            <div className="mt-8">
              <TermsContent />
            </div>
          </div>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
