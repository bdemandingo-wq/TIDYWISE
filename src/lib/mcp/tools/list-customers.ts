import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveOrganizationId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_customers",
  title: "List customers",
  description:
    "Search or list customers for one of the signed-in user's organizations by name, email, or phone.",
  inputSchema: {
    organization_id: z
      .string()
      .optional()
      .describe("Organization to read. Defaults to the user's owner organization."),
    search: z.string().optional().describe("Match against first name, last name, or email."),
    limit: z.number().optional().describe("Maximum rows to return (default 25, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organization_id, search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const resolved = await resolveOrganizationId(supabase, organization_id);
    if ("error" in resolved) {
      return { content: [{ type: "text", text: resolved.error }], isError: true };
    }

    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabase
      .from("customers")
      .select(
        "id, first_name, last_name, email, phone, city, state, customer_status, is_recurring, created_at",
      )
      .eq("organization_id", resolved.organizationId)
      .is("merged_into", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(take);

    if (search) {
      const term = search.replace(/[%,]/g, " ").trim();
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { organization_id: resolved.organizationId, customers: data ?? [] },
    };
  },
});
