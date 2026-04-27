import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import DOMPurify from "dompurify";
import { format } from "date-fns";
import { BlogStatusBadge } from "@/components/admin/blog/StatusBadge";

export default function BlogAdminPreviewPage() {
  const { id } = useParams<{ id: string }>();

  const { data: post, isLoading } = useQuery({
    queryKey: ["admin-blog-preview", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("blog_posts").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

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
            <img src={post.featured_image_url} alt={post.title} className="w-full h-64 object-cover rounded-lg mb-6" />
          )}
          <div className="text-sm text-muted-foreground mb-2">
            {post.category} · {post.read_time} · {post.published_at ? format(new Date(post.published_at), "MMMM d, yyyy") : "Unpublished"}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{post.title}</h1>
          <p className="text-lg text-muted-foreground mb-8">{post.excerpt}</p>
          <div
            className="prose prose-lg max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(post.content || "", {
                ALLOWED_TAGS: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "em", "a", "blockquote", "br", "span", "div", "code", "pre", "img"],
                ALLOWED_ATTR: ["href", "target", "rel", "class", "id", "src", "alt"],
              }),
            }}
          />
        </Card>
      </div>
    </div>
  );
}
