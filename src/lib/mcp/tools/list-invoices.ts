import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveOrganizationId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_invoices",
  title: "List invoices",
  description:
    "List invoices for one of the signed-in user's organizations, optionally filtered by status such as draft, sent, paid, or overdue.",
  inputSchema: {
    organization_id: z
      .string()
      .optional()
      .describe("Organization to read. Defaults to the user's owner organization."),
    status: z.string().optional().describe("Filter by invoice status."),
    limit: z.number().optional().describe("Maximum rows to return (default 25, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organization_id, status, limit }, ctx) => {
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
      .from("invoices")
      .select(
        "id, invoice_number, status, total_amount, subtotal, due_date, sent_at, paid_at, customer_id, created_at",
      )
      .eq("organization_id", resolved.organizationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(take);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { organization_id: resolved.organizationId, invoices: data ?? [] },
    };
  },
});
