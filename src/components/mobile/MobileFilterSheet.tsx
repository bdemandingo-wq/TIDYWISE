import { ReactNode, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileFilterSheetProps {
  children: ReactNode;
  activeFilterCount?: number;
  onClearAll?: () => void;
  onApply?: () => void;
  title?: string;
  triggerClassName?: string;
}

export function MobileFilterSheet({
  children,
  activeFilterCount = 0,
  onClearAll,
  onApply,
  title = 'Filters',
  triggerClassName,
}: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);

  const handleApply = () => {
    onApply?.();
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className={cn(
          'relative h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl border-border/50',
          triggerClassName
        )}
        onClick={() => setOpen(true)}
      >
        <Filter className="w-4 h-4" />
        {activeFilterCount > 0 && (
          <Badge
            variant="default"
            className="absolute -top-1.5 -right-1.5 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
          >
            {activeFilterCount}
          </Badge>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[85vh] overflow-y-auto"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
        >
          <SheetHeader className="flex flex-row items-center justify-between pb-4">
            <SheetTitle>{title}</SheetTitle>
            {activeFilterCount > 0 && onClearAll && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={onClearAll}
              >
                <X className="w-3.5 h-3.5" />
                Clear all
              </Button>
            )}
          </SheetHeader>

          <div className="space-y-4 py-2">{children}</div>

          <SheetFooter className="pt-4">
            <Button className="w-full h-11" onClick={handleApply}>
              Apply Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
