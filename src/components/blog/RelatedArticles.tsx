import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface RelatedArticle {
  slug: string;
  title: string;
  category: string;
  isExternal?: boolean;
}

interface RelatedArticlesProps {
  articles: RelatedArticle[];
  currentSlug?: string;
}

export function RelatedArticles({ articles, currentSlug }: RelatedArticlesProps) {
  const filteredArticles = articles.filter(a => a.slug !== currentSlug).slice(0, 3);

  if (filteredArticles.length === 0) return null;

  return (
    <aside className="mt-16 pt-12 border-t border-border">
      <h2 className="text-2xl font-bold text-foreground mb-6">Related Articles</h2>
      <div className="grid md:grid-cols-3 gap-6">
        {filteredArticles.map((article) => (
          <Link
            key={article.slug}
            to={article.slug}
            className="group p-6 bg-card rounded-xl border border-border hover:border-primary/50 hover:shadow-lg transition-all"
          >
            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
              {article.category}
            </span>
            <h3 className="mt-3 font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {article.title}
            </h3>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-primary font-medium group-hover:gap-2 transition-all">
              Read more <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </aside>
  );
}

// Centralized list of all SEO-optimized articles for internal linking
export const allArticles: RelatedArticle[] = [
  // Blog Posts
  {
    slug: "/blog/how-to-start-a-cleaning-business",
    title: "How to Start a Cleaning Business in 2026",
    category: "Business Guide",
  },
  {
    slug: "/blog/booking-koala-vs-jobber-vs-tidywise",
    title: "Booking Koala vs Jobber vs TidyWise: Complete Comparison",
    category: "Comparison",
  },
  // Feature Pages
  {
    slug: "/features/scheduling-software",
    title: "Cleaning Scheduling Software That Reduces No-Shows",
    category: "Features",
  },
  {
    slug: "/features/route-optimization",
    title: "Route Optimization for Cleaning Businesses",
    category: "Features",
  },
  {
    slug: "/features/invoicing-software",
    title: "Cleaning Business Invoicing Software",
    category: "Features",
  },
  {
    slug: "/features/automated-dispatching",
    title: "Automated Dispatching for Cleaning Teams",
    category: "Features",
  },
  {
    slug: "/features/quote-software",
    title: "Instant Quote Software for Cleaners",
    category: "Features",
  },
  {
    slug: "/features/sms-notifications",
    title: "SMS Notifications for Cleaning Businesses",
    category: "Features",
  },
  {
    slug: "/features/payment-processing",
    title: "Payment Processing for Cleaning Companies",
    category: "Features",
  },
  {
    slug: "/blog/payroll-software-for-cleaning-businesses",
    title: "Best Payroll Software for Cleaning Businesses (2026 Guide)",
    category: "Payroll",
  },
  {
    slug: "/blog/gps-tracking-cleaning-business",
    title: "GPS Tracking for Cleaning Businesses — Do You Need It?",
    category: "Operations",
  },
  {
    slug: "/features/payroll-software",
    title: "Payroll Software for Cleaning Businesses — Free Forever",
    category: "Features",
  },
  {
    slug: "/blog/scheduling-software-for-cleaning-business",
    title: "Scheduling Software for Cleaning Businesses (2026 Guide)",
    category: "Software",
  },
  {
    slug: "/blog/invoicing-software-for-cleaning-business",
    title: "Invoicing Software for Cleaning Businesses — Get Paid Faster",
    category: "Payments",
  },
  {
    slug: "/blog/maid-service-software",
    title: "Best Maid Service Software in 2026 — Buyer's Guide",
    category: "Software Reviews",
  },
  {
    slug: "/blog/cleaning-business-management-software",
    title: "Cleaning Business Management Software — What You Actually Need",
    category: "Operations",
  },
  // Comparison Pages
  {
    slug: "/compare/jobber",
    title: "TidyWise vs Jobber: Which Is Better?",
    category: "Comparison",
  },
  {
    slug: "/compare/booking-koala",
    title: "TidyWise vs Booking Koala: Feature Comparison",
    category: "Comparison",
  },
  {
    slug: "/compare/housecall-pro",
    title: "TidyWise vs Housecall Pro Alternative",
    category: "Comparison",
  },
  {
    slug: "/compare/zenmaid",
    title: "TidyWise vs ZenMaid: Which Cleaning Software Wins?",
    category: "Comparison",
  },
  {
    slug: "/compare/servicetitan",
    title: "TidyWise vs ServiceTitan for Cleaning Businesses",
    category: "Comparison",
  },
];
