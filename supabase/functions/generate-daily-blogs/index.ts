import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cleaning business blog topics for variety
const blogTopics = [
  { category: "Cleaning Tips", topics: [
    "Deep cleaning secrets professionals use",
    "How to clean stubborn stains from any surface", 
    "The best cleaning products for eco-conscious businesses",
    "Speed cleaning techniques that save hours",
    "Kitchen cleaning hacks every pro should know"
  ]},
  { category: "Business Growth", topics: [
    "How to price your cleaning services competitively",
    "Marketing strategies that attract high-paying clients",
    "Building a referral program that works",
    "Scaling your cleaning business from solo to team",
    "Customer retention strategies for cleaning companies"
  ]},
  { category: "Operations", topics: [
    "Optimizing your cleaning route for maximum efficiency",
    "Managing a remote cleaning team effectively",
    "Inventory management for cleaning supplies",
    "Creating SOPs that ensure consistent quality",
    "Time tracking and productivity tips"
  ]},
  { category: "Industry Insights", topics: [
    "Trends shaping the cleaning industry",
    "How technology is changing cleaning businesses",
    "Green cleaning: Meeting client demands",
    "Commercial vs residential cleaning pros and cons",
    "Insurance and liability for cleaning businesses"
  ]}
];

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 60);
}

function getRandomTopic(): { category: string; topic: string } {
  const categoryIndex = Math.floor(Math.random() * blogTopics.length);
  const category = blogTopics[categoryIndex];
  const topicIndex = Math.floor(Math.random() * category.topics.length);
  return { category: category.category, topic: category.topics[topicIndex] };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { count = 4 } = await req.json().catch(() => ({ count: 4 }));
    const postsToGenerate = Math.min(count, 4);

    console.log(`Generating ${postsToGenerate} blog posts...`);

    const generatedPosts = [];

    for (let i = 0; i < postsToGenerate; i++) {
      const { category, topic } = getRandomTopic();
      const uniqueId = Date.now() + i;

      const systemPrompt = `You are an expert content writer for cleaning business blogs. Write in a casual, helpful Alex Hormozi-inspired style - direct, value-packed, no fluff. Your content should be:
- Practical and actionable
- Easy to read with short paragraphs
- Include specific tips and examples
- Written for cleaning business owners
- SEO-optimized with natural keyword usage

IMPORTANT: Return valid JSON only, no markdown code blocks.`;

      const userPrompt = `Write a blog post about "${topic}" for a cleaning business audience.

Return JSON format:
{
  "title": "Catchy, SEO-friendly title (max 60 chars)",
  "excerpt": "Compelling 2-sentence summary that makes people want to read more",
  "content": "Full blog post in HTML format with <h2>, <p>, <ul>, <li> tags. Aim for 800-1200 words. Include practical tips, examples, and a strong conclusion.",
  "metaTitle": "SEO title under 60 chars",
  "metaDescription": "Meta description under 160 chars"
}

Topic ID: ${uniqueId}`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
        }),
      });

      if (!response.ok) {
        console.error(`AI request ${i + 1} failed:`, response.status);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.error(`No content in response ${i + 1}`);
        continue;
      }

      let blogData;
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : content;
        blogData = JSON.parse(jsonStr.trim());
      } catch (parseError) {
        console.error(`Failed to parse blog ${i + 1}:`, parseError);
        continue;
      }

      const slug = generateSlug(blogData.title) + '-' + uniqueId;
      const wordCount = blogData.content.split(/\s+/).length;
      const readTime = `${Math.ceil(wordCount / 200)} min read`;

      const { data: insertedPost, error } = await supabase
        .from('blog_posts')
        .insert({
          slug,
          title: blogData.title,
          excerpt: blogData.excerpt,
          content: blogData.content,
          category,
          read_time: readTime,
          meta_title: blogData.metaTitle,
          meta_description: blogData.metaDescription,
          is_published: true,
          is_featured: i === 0
        })
        .select()
        .single();

      if (error) {
        console.error(`Failed to insert blog ${i + 1}:`, error);
        continue;
      }

      generatedPosts.push(insertedPost);
      console.log(`Generated blog: ${blogData.title}`);

      // Small delay between requests
      if (i < postsToGenerate - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        generated: generatedPosts.length,
        posts: generatedPosts.map(p => ({ id: p.id, title: p.title, slug: p.slug }))
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-daily-blogs] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);