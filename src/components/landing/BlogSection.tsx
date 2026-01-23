import { ArrowRight, BookOpen, Clock, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const blogPosts = [
  {
    slug: "how-to-start-a-cleaning-business",
    title: "The Ultimate Guide on How to Start a Cleaning Business in 2026",
    excerpt: "Learn everything from automated payroll software for maid services to cleaning business inventory management. Complete step-by-step guide for aspiring entrepreneurs.",
    category: "Business Guide",
    readTime: "15 min read",
    date: "January 2026",
    featured: true,
    isFeaturePage: false
  },
  {
    slug: "booking-koala-vs-jobber-vs-tidywise",
    title: "Booking Koala vs Jobber vs TidyWise: Which Software Wins?",
    excerpt: "Side-by-side comparison of the top 3 cleaning business software platforms. See pricing, features, and which one is right for your business.",
    category: "Comparison",
    readTime: "10 min read",
    date: "January 2026",
    featured: false,
    isFeaturePage: false
  },
  {
    slug: "scheduling-software",
    title: "Cleaning Scheduling Software That Reduces No-Shows by 40%",
    excerpt: "Discover how automated scheduling, smart reminders, and drag-and-drop calendars can transform your cleaning business operations.",
    category: "Features",
    readTime: "5 min read",
    date: "January 2026",
    featured: false,
    isFeaturePage: true
  }
];

export function BlogSection() {
  const featuredPost = blogPosts.find(post => post.featured);
  const otherPosts = blogPosts.filter(post => !post.featured);

  return (
    <section id="blog" className="py-16 px-4 sm:px-6 lg:px-8 bg-secondary/30">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-4">
            <BookOpen className="h-4 w-4" />
            Resources & Guides
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Learn how to grow your cleaning business
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Expert insights on automated payroll software for maid services, cleaning business inventory management tools, and more.
          </p>
        </div>

        {/* Featured Article */}
        {featuredPost && (
          <Link 
            to={`/blog/${featuredPost.slug}`}
            className="block mb-12 group"
          >
            <article className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-xl transition-all duration-300 group-hover:border-primary/50">
              <div className="grid lg:grid-cols-2 gap-0">
                <div className="aspect-video lg:aspect-auto bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <div className="text-center p-8">
                    <BookOpen className="h-16 w-16 text-primary mx-auto mb-4" />
                    <span className="text-sm text-muted-foreground">Featured Guide</span>
                  </div>
                </div>
                <div className="p-6 lg:p-10 flex flex-col justify-center">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-medium">
                      {featuredPost.category}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {featuredPost.readTime}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {featuredPost.date}
                    </span>
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-bold text-foreground mb-4 group-hover:text-primary transition-colors">
                    {featuredPost.title}
                  </h3>
                  <p className="text-muted-foreground mb-6 leading-relaxed">
                    {featuredPost.excerpt}
                  </p>
                  <div className="flex items-center gap-2 text-primary font-medium group-hover:gap-4 transition-all">
                    Read the full guide <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </article>
          </Link>
        )}

        {/* Other Articles */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {otherPosts.map((post) => (
            <Link 
              key={post.slug}
              to={post.isFeaturePage ? `/features/${post.slug}` : `/blog/${post.slug}`}
              className="group"
            >
              <article className="bg-card rounded-xl border border-border p-5 h-full hover:shadow-lg hover:border-primary/50 transition-all duration-300">
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span className="px-3 py-1 bg-secondary text-foreground rounded-full font-medium">
                    {post.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {post.readTime}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3 group-hover:text-primary transition-colors">
                  {post.title}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {post.excerpt}
                </p>
                <div className="flex items-center gap-2 text-primary text-sm font-medium group-hover:gap-3 transition-all">
                  Read article <ArrowRight className="h-4 w-4" />
                </div>
              </article>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Button variant="outline" size="lg" asChild>
            <Link to="/blog">
              View All Resources <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
