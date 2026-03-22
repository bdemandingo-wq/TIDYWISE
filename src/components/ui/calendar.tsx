import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(
  ({ className, classNames, showOutsideDays = true, ...props }, ref) => {
    return (
      <div ref={ref}>
        <DayPicker
          showOutsideDays={showOutsideDays}
          className={cn("p-3 pointer-events-auto", className)}
          classNames={{
            months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
            month: "space-y-4",
            caption: "flex justify-center pt-1 relative items-center",
            caption_label: "text-sm font-medium",
            nav: "space-x-1 flex items-center",
            nav_button: cn(
              buttonVariants({ variant: "outline" }),
              "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
            ),
            nav_button_previous: "absolute left-1",
            nav_button_next: "absolute right-1",
            table: "w-full border-collapse",
            head_row: "grid grid-cols-7",
            head_cell: "text-muted-foreground rounded-md font-normal text-[0.8rem] text-center py-1",
            row: "grid grid-cols-7 mt-2",
            cell: cn(
              "relative h-9 w-full text-center text-sm p-0 focus-within:relative focus-within:z-20",
              "[&:has([aria-selected])]:bg-accent",
              "[&:has([aria-selected].day-outside)]:bg-accent/50",
              "[&:has([aria-selected].day-range-end)]:rounded-r-md",
              "first:[&:has([aria-selected])]:rounded-l-md",
              "last:[&:has([aria-selected])]:rounded-r-md",
            ),
            day: cn(
              buttonVariants({ variant: "ghost" }),
              "h-9 w-9 p-0 font-normal aria-selected:opacity-100 cursor-pointer mx-auto",
            ),
            day_range_start: "day-range-start",
            day_range_end: "day-range-end",
            day_selected:
              "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
            day_today: "bg-accent text-accent-foreground",
            day_outside:
              "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
            day_disabled: "text-muted-foreground opacity-50",
            day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
            day_hidden: "invisible",
            ...classNames,
          }}
          components={{
            IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
            IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
          }}
          {...props}
        />
      </div>
    );
  }
);
Calendar.displayName = "Calendar";

export { Calendar };
