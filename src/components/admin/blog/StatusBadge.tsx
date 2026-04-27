import { Badge } from "@/components/ui/badge";

const VARIANTS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  review: { label: "In Review", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  published: { label: "Published", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  archived: { label: "Archived", className: "bg-destructive/10 text-destructive" },
};

export function BlogStatusBadge({ status }: { status: string }) {
  const v = VARIANTS[status] || VARIANTS.draft;
  return <Badge variant="outline" className={v.className}>{v.label}</Badge>;
}
