import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, Save, CheckCircle2, Eye } from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/admin/blog/RichTextEditor";
import { BlogStatusBadge } from "@/components/admin/blog/StatusBadge";
import { useAuth } from "@/hooks/useAuth";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

function countWords(html: string) {
  return html.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

interface FormState {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  target_keyword: string;
  secondary_keywords: string;
  meta_title: string;
  meta_description: string;
  featured_image_url: string;
  author: string;
  read_time: string;
  status: "draft" | "review" | "published" | "archived";
}

const EMPTY: FormState = {
  title: "", slug: "", excerpt: "", content: "<p></p>", category: "Guide",
  target_keyword: "", secondary_keywords: "", meta_title: "", meta_description: "",
  featured_image_url: "", author: "TidyWise Team", read_time: "5 min read", status: "draft",
};

export default function BlogAdminEditPage({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [autoSlug, setAutoSlug] = useState(mode === "new");

  const { data: existing, isLoading } = useQuery({
    queryKey: ["admin-blog-post", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from("blog_posts").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: mode === "edit" && !!id,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title || "",
        slug: existing.slug || "",
        excerpt: existing.excerpt || "",
        content: existing.content || "<p></p>",
        category: existing.category || "Guide",
        target_keyword: existing.target_keyword || "",
        secondary_keywords: (existing.secondary_keywords || []).join(", "),
        meta_title: existing.meta_title || "",
        meta_description: existing.meta_description || "",
        featured_image_url: existing.featured_image_url || "",
        author: existing.author || "TidyWise Team",
        read_time: existing.read_time || "5 min read",
        status: (existing.status as FormState["status"]) || "draft",
      });
      setAutoSlug(false);
    }
  }, [existing]);

  const update = (patch: Partial<FormState>) => {
    setForm((f) => {
      const next = { ...f, ...patch };
      if (autoSlug && patch.title !== undefined) next.slug = slugify(patch.title);
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      if (!form.title.trim()) throw new Error("Title is required");
      if (!form.slug.trim()) throw new Error("Slug is required");
      if (!form.excerpt.trim()) throw new Error("Excerpt is required");

      const wordCount = countWords(form.content);
      const newStatus = publish ? "published" : form.status;

      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        excerpt: form.excerpt.trim(),
        content: form.content,
        category: form.category,
        target_keyword: form.target_keyword || null,
        secondary_keywords: form.secondary_keywords
          ? form.secondary_keywords.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        meta_title: form.meta_title || form.title,
        meta_description: form.meta_description || form.excerpt.slice(0, 155),
        featured_image_url: form.featured_image_url || null,
        author: form.author || "TidyWise Team",
        read_time: form.read_time,
        word_count: wordCount,
        status: newStatus,
        is_published: newStatus === "published",
        ...(publish ? { approved_by: user?.id, approved_at: new Date().toISOString(), published_at: new Date().toISOString() } : {}),
      };

      let savedSlug = form.slug;
      if (mode === "edit" && id) {
        const { error } = await supabase.from("blog_posts").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("blog_posts").insert(payload).select("id, slug").single();
        if (error) throw error;
        savedSlug = data.slug;
      }

      if (publish) {
        await supabase.functions.invoke("recache-blog-post", { body: { slug: savedSlug } });
      }
      return { savedSlug, publish };
    },
    onSuccess: ({ publish }) => {
      toast.success(publish ? "Published & cache refresh requested" : "Saved");
      qc.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      qc.invalidateQueries({ queryKey: ["admin-blog-post", id] });
      if (mode === "new") navigate("/admin/blog");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (mode === "edit" && isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const wordCount = countWords(form.content);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        <div className="sticky top-0 z-30 -mx-6 px-6 py-3 mb-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border flex items-center gap-3 flex-wrap">
          <Button asChild variant="ghost" size="sm"><Link to="/admin/blog"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
          <h1 className="text-xl font-bold text-foreground">{mode === "new" ? "New Blog Post" : "Edit Post"}</h1>
          <BlogStatusBadge status={form.status} />
          {mode === "edit" && existing?.quality_score != null && (
            <span
              className={
                "text-xs font-semibold px-2 py-1 rounded-md border " +
                (existing.quality_score >= 80
                  ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                  : existing.quality_score >= 60
                  ? "text-amber-700 bg-amber-50 border-amber-200"
                  : "text-red-700 bg-red-50 border-red-200")
              }
              title={existing.quality_notes || ""}
            >
              Quality: {existing.quality_score}/100
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {mode === "edit" && id && (
              <Button asChild variant="outline" size="sm"><Link to={`/admin/blog/${id}/preview`}><Eye className="h-4 w-4 mr-2" />Preview</Link></Button>
            )}
            <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Draft
            </Button>
            <Button onClick={() => save.mutate(true)} disabled={save.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-2" />Approve & Publish
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="p-6 lg:col-span-2 space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder="Post title" />
            </div>
            <div>
              <Label htmlFor="slug">Slug</Label>
              <div className="flex gap-2">
                <Input id="slug" value={form.slug} onChange={(e) => { setAutoSlug(false); update({ slug: slugify(e.target.value) }); }} placeholder="post-url-slug" />
                <Button type="button" variant="outline" size="sm" onClick={() => { setAutoSlug(true); update({ slug: slugify(form.title) }); }}>Auto</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Public URL: /blog/post/{form.slug || "your-slug"}</p>
            </div>
            <div>
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea id="excerpt" value={form.excerpt} onChange={(e) => update({ excerpt: e.target.value })} rows={2} maxLength={300} />
            </div>
            <div>
              <Label>Content</Label>
              <RichTextEditor value={form.content} onChange={(html) => update({ content: html })} />
              <p className="text-xs text-muted-foreground mt-1">{wordCount.toLocaleString()} words</p>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-6 space-y-4">
              <h3 className="font-semibold">SEO</h3>
              <div>
                <Label htmlFor="meta_title">Meta Title <span className="text-xs text-muted-foreground">({form.meta_title.length}/60)</span></Label>
                <Input id="meta_title" value={form.meta_title} onChange={(e) => update({ meta_title: e.target.value })} maxLength={70} />
              </div>
              <div>
                <Label htmlFor="meta_description">Meta Description <span className="text-xs text-muted-foreground">({form.meta_description.length}/155)</span></Label>
                <Textarea id="meta_description" value={form.meta_description} onChange={(e) => update({ meta_description: e.target.value })} rows={3} maxLength={170} />
              </div>
              <div>
                <Label htmlFor="target_keyword">Target Keyword</Label>
                <Input id="target_keyword" value={form.target_keyword} onChange={(e) => update({ target_keyword: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="secondary_keywords">Secondary Keywords (comma separated)</Label>
                <Input id="secondary_keywords" value={form.secondary_keywords} onChange={(e) => update({ secondary_keywords: e.target.value })} />
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="font-semibold">Metadata</h3>
              <div>
                <Label htmlFor="category">Category</Label>
                <Input id="category" value={form.category} onChange={(e) => update({ category: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="author">Author</Label>
                <Input id="author" value={form.author} onChange={(e) => update({ author: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="read_time">Read Time</Label>
                <Input id="read_time" value={form.read_time} onChange={(e) => update({ read_time: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="featured_image_url">Featured Image URL</Label>
                <Input id="featured_image_url" value={form.featured_image_url} onChange={(e) => update({ featured_image_url: e.target.value })} placeholder="https://..." />
                {form.featured_image_url && (
                  <img src={form.featured_image_url} alt="" className="mt-2 rounded-md border border-border w-full h-32 object-cover" />
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
