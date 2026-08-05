import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_organizations",
  title: "List my businesses",
  description:
    "List the TidyWise organizations (businesses) the signed-in user belongs to, with their role in each.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("org_memberships")
      .select("organization_id, role, organizations(name, slug, plan_tier)")
      .order("created_at", { ascending: true });

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    // deno-lint-ignore no-explicit-any
    const organizations = (data ?? []).map((row: any) => ({
      organization_id: row.organization_id,
      role: row.role,
      name: row.organizations?.name ?? null,
      slug: row.organizations?.slug ?? null,
      plan_tier: row.organizations?.plan_tier ?? null,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(organizations, null, 2) }],
      structuredContent: { organizations },
    };
  },
});
