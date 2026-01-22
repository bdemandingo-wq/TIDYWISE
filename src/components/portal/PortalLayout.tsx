import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Request", href: "/portal/request" },
  { label: "Spending", href: "/portal/spending" },
  { label: "Loyalty", href: "/portal/loyalty" },
  { label: "Account", href: "/portal/account" },
];

export function PortalLayout({ title, children }: { title: string; children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <nav className="mt-3 flex flex-wrap gap-2">
            {nav.map((item) => {
              const active = location.pathname === item.href || (item.href === "/portal/request" && location.pathname === "/portal");
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    active
                      ? "border-primary/30 bg-primary/10 text-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
