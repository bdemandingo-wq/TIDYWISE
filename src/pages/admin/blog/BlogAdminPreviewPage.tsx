import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { BlogStatusBadge } from "@/components/admin/blog/StatusBadge";
import { ArticleBody } from "@/components/ArticleBody";
import { QueryError } from "@/components/QueryError";

export default function BlogAdminPreviewPage() {
  const { id } = useParams<{ id: string }>();

  const { data: post, isLoading, error: postError } = useQuery({
    queryKey: ["admin-blog-preview", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("blog_posts").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (postError) return <QueryError subject="blog post" />;
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!post) return <div className="p-12 text-center text-muted-foreground">Post not found</div>;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Button asChild variant="ghost" size="sm"><Link to="/admin/blog"><ArrowLeft className="h-4 w-4 mr-1" />Back to list</Link></Button>
          <BlogStatusBadge status={post.status} />
          <div className="ml-auto">
            <Button asChild variant="outline" size="sm"><Link to={`/admin/blog/${post.id}/edit`}><Pencil className="h-4 w-4 mr-2" />Edit</Link></Button>
          </div>
        </div>

        <Card className="p-8">
          {post.featured_image_url && (
            <img src={post.featured_image_url} alt={post.title} className="w-full h-64 object-cover rounded-lg mb-6" height={256} loading="lazy" />
          )}
          <div className="text-sm text-muted-foreground mb-2">
            {post.category} · {post.read_time} · {post.published_at ? format(new Date(post.published_at), "MMMM d, yyyy") : "Unpublished"}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{post.title}</h1>
          <p className="text-lg text-muted-foreground mb-8">{post.excerpt}</p>
          {/* ArticleBody sanitises with the SAME allowlist the public page uses,
              so the preview cannot be more permissive than production. It was:
              this file allowed <img src alt> and DynamicBlogPost did not, so an
              author who inserted an image saw it here and it silently vanished on
              the live post. If images should be supported, widen the allowlist in
              ArticleBody — one place, both surfaces. */}
          <ArticleBody html={post.content || ""} />
        </Card>
      </div>
    </div>
  );
}
