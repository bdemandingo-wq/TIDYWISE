import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, BookOpen, Clock, Calendar, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";

// Static cornerstone posts that have dedicated pages
const staticPosts = [
  {
    slug: "how-to-start-a-cleaning-business",
    title: "The Ultimate Guide on How to Start a Cleaning Business in 2026",
    excerpt: "Learn everything from automated payroll software for maid services to cleaning business inventory management. Complete step-by-step guide for aspiring entrepreneurs.",
    category: "Business Guide",
    readTime: "15 min read",
    date: "January 2026",
    featured: true,
    isStatic: true
  },
  {
    slug: "booking-koala-vs-jobber-vs-tidywise",
    title: "Booking Koala vs Jobber vs TidyWise: Which Software Wins in 2026?",
    excerpt: "Complete side-by-side comparison of pricing, features, and customer support. Find out which cleaning business software is best for your company.",
    category: "Comparison",
    readTime: "10 min read",
    date: "January 2026",
    featured: false,
    isStatic: true
  }
];

// Feature pages promoted as blog content for SEO
const featureArticles = [
  {
    slug: "/features/scheduling-software",
    title: "Cleaning Scheduling Software That Reduces No-Shows by 40%",
    excerpt: "Automated scheduling, smart reminders, and drag-and-drop calendars for cleaning businesses.",
    category: "Features",
    readTime: "5 min read",
    date: "January 2026",
    featured: false,
    isFeaturePage: true
  },
  {
    slug: "/features/route-optimization",
    title: "Route Optimization Software for Cleaning Businesses",
    excerpt: "Save 2+ hours daily with AI-powered route planning. Reduce fuel costs and maximize jobs per day.",
    category: "Features",
    readTime: "5 min read",
    date: "January 2026",
    featured: false,
    isFeaturePage: true
  },
  {
    slug: "/features/invoicing-software",
    title: "Cleaning Business Invoicing Software: Get Paid Faster",
    excerpt: "Professional invoices, automatic payment reminders, and seamless Stripe integration.",
    category: "Features",
    readTime: "5 min read",
    date: "January 2026",
    featured: false,
    isFeaturePage: true
  },
  {
    slug: "/compare/jobber",
    title: "TidyWise vs Jobber: Complete 2026 Comparison",
    excerpt: "See how TidyWise stacks up against Jobber on pricing, features, and ease of use.",
    category: "Comparison",
    readTime: "8 min read",
    date: "January 2026",
    featured: false,
    isFeaturePage: true
  },
  {
    slug: "/compare/booking-koala",
    title: "TidyWise vs Booking Koala: Feature-by-Feature Breakdown",
    excerpt: "Detailed comparison of two popular cleaning business software platforms.",
    category: "Comparison",
    readTime: "8 min read",
    date: "January 2026",
    featured: false,
    isFeaturePage: true
  },
  {
    slug: "/compare/housecall-pro",
    title: "Best Housecall Pro Alternative for Cleaning Businesses",
    excerpt: "Looking for a Housecall Pro alternative? See why cleaning companies are switching to TidyWise.",
    category: "Comparison",
    readTime: "6 min read",
    date: "January 2026",
    featured: false,
    isFeaturePage: true
  }
];

export default function BlogIndex() {
  // Fetch dynamic blog posts from database
  const { data: dynamicPosts = [], isLoading } = useQuery({
    queryKey: ["blog-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Combine static, feature, and dynamic posts
  const allPosts = [
    ...staticPosts.map(post => ({ ...post, isFeaturePage: false as const })),
    ...featureArticles.map(post => ({ ...post, isStatic: false as const })),
    ...dynamicPosts.map(post => ({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      category: post.category,
      readTime: post.read_time,
      date: format(new Date(post.published_at), "MMMM yyyy"),
      featured: post.is_featured,
      isStatic: false as const,
      isFeaturePage: false as const
    }))
  ];

  return (
    <div className="min-h-screen bg-background">
      <Seo 
        title="Cleaning Business Resources & Guides | TIDYWISE Blog"
        description="Expert guides on starting and growing a cleaning business. Learn about automated payroll software for maid services, inventory management, scheduling tips, and more."
        canonicalPath="/blog"
      />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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

      <main className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-12">
            <Link 
              to="/" 
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-4 ml-4">
              <BookOpen className="h-4 w-4" />
              Resources & Guides
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              Cleaning Business Resources
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Expert insights on growing your cleaning business. From automated payroll to inventory management, we&apos;ve got you covered.
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {/* Articles Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {allPosts.map((post) => (
              <Link 
                key={post.slug}
                to={post.isFeaturePage ? post.slug : (post.isStatic ? `/blog/${post.slug}` : `/blog/post/${post.slug}`)}
                className="group"
              >
                <article className="bg-card rounded-xl border border-border p-6 h-full hover:shadow-lg hover:border-primary/50 transition-all duration-300 flex flex-col">
                  {post.featured && (
                    <span className="self-start px-2 py-1 bg-primary text-primary-foreground text-xs rounded mb-4">
                      Featured
                    </span>
                  )}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4 flex-wrap">
                    <span className="px-3 py-1 bg-secondary text-foreground rounded-full font-medium">
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {post.readTime}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold text-foreground mb-3 group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h2>
                  <p className="text-muted-foreground mb-4 flex-1 line-clamp-3">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {post.date}
                    </span>
                    <span className="flex items-center gap-2 text-primary text-sm font-medium group-hover:gap-3 transition-all">
                      Read <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </article>
              </Link>
            ))}
          </div>

          {/* Newsletter CTA */}
          <div className="mt-16 bg-secondary/50 rounded-2xl p-8 sm:p-12 text-center border border-border">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Get cleaning business tips in your inbox
            </h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Join 5,000+ cleaning business owners who receive weekly insights on growing their business.
            </p>
            <Button size="lg" asChild>
              <Link to="/auth">
                Subscribe for Free <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-7xl mx-auto text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} TIDYWISE. All rights reserved.
        </div>
      </footer>
    </div>
  );
}