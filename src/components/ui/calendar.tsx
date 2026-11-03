import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 bg-white dark:bg-slate-900 rounded-xl", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-semibold text-slate-800 dark:text-slate-100",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-[#0B1437] hover:text-white rounded-full flex items-center justify-center p-0 transition-colors shadow-xs hover:scale-100 active:scale-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-slate-400 dark:text-slate-500 rounded-md w-9 font-medium text-[0.8rem] text-center",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 [&:has([aria-selected].day-range-middle)]:bg-slate-100 dark:[&:has([aria-selected].day-range-middle)]:bg-slate-800 [&:has([aria-selected].day-range-end)]:rounded-r-full first:[&:has([aria-selected])]:rounded-l-full last:[&:has([aria-selected])]:rounded-r-full",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal rounded-full hover:scale-100 active:scale-100 aria-selected:opacity-100 transition-colors",
        ),
        day_range_end: "day-range-end",
        day_selected:
          "!bg-[#0B1437] !text-white hover:!bg-[#111f54] hover:!text-white focus:!bg-[#0B1437] focus:!text-white font-bold rounded-full shadow-xs",
        day_today:
          "bg-slate-100 !text-[#0B1437] font-bold border border-slate-300 dark:bg-slate-800 dark:!text-white dark:border-slate-600 rounded-full aria-selected:!bg-[#0B1437] aria-selected:!text-white aria-selected:!border-transparent",
        day_outside:
          "day-outside text-slate-400 opacity-40 hover:opacity-75 aria-selected:bg-transparent aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-30 cursor-not-allowed hover:bg-transparent",
        day_range_middle: "aria-selected:bg-slate-100 aria-selected:text-[#0B1437]",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
