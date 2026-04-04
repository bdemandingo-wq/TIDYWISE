import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ActionItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
}

interface MobileActionSheetProps {
  trigger: React.ReactNode;
  title?: string;
  items: ActionItem[];
  align?: "start" | "end" | "center";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Renders a dropdown on desktop, a bottom sheet on mobile.
 */
export function MobileActionSheet({
  trigger,
  title,
  items,
  align = "end",
  open,
  onOpenChange,
}: MobileActionSheetProps) {
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  if (isMobile) {
    return (
      <>
        <div onClick={() => setOpen(true)}>{trigger}</div>
        <Sheet open={isOpen} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[80dvh] overflow-y-auto">
            {title && (
              <SheetHeader className="pb-2">
                <SheetTitle className="text-base">{title}</SheetTitle>
              </SheetHeader>
            )}
            <div className="flex flex-col gap-1 pt-2">
              {items.map((item, i) => (
                <button
                  key={i}
                  disabled={item.disabled}
                  onClick={() => {
                    item.onClick();
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-left text-[15px] font-medium transition-colors min-h-[48px]",
                    "active:scale-[0.98] active:bg-muted/80",
                    item.variant === "destructive"
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-foreground hover:bg-muted",
                    item.disabled && "opacity-40 pointer-events-none"
                  )}
                >
                  {item.icon && <span className="shrink-0">{item.icon}</span>}
                  {item.label}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[180px]">
        {title && <DropdownMenuLabel>{title}</DropdownMenuLabel>}
        {title && <DropdownMenuSeparator />}
        {items.map((item, i) => (
          <DropdownMenuItem
            key={i}
            disabled={item.disabled}
            onClick={item.onClick}
            className={cn(
              "gap-2 cursor-pointer",
              item.variant === "destructive" && "text-destructive focus:text-destructive"
            )}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
