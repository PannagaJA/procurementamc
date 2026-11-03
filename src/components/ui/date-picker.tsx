import * as React from "react";
import { format, parseISO } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface DatePickerProps {
  value?: string; // YYYY-MM-DD
  onChange?: (dateString: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  id,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const dateValue = React.useMemo(() => {
    if (!value) return undefined;
    try {
      const parts = value.split("-").map(Number);
      if (parts.length === 3) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }
      const d = parseISO(value);
      return isNaN(d.getTime()) ? undefined : d;
    } catch {
      return undefined;
    }
  }, [value]);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) {
      onChange?.("");
    } else {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(selectedDate.getDate()).padStart(2, "0");
      onChange?.(`${year}-${month}-${day}`);
    }
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between text-left font-normal h-12 text-base rounded-md border border-input bg-background px-3 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-foreground active:scale-100 hover:scale-100",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <CalendarIcon className="h-4 w-4 shrink-0 text-slate-500" />
            {dateValue ? (
              <span className="text-foreground font-medium">
                {format(dateValue, "dd-MM-yyyy")}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleClear(e as any);
                }
              }}
              className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              title="Clear date"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-xl shadow-xl border bg-white dark:bg-slate-900 z-50" align="start">
        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={handleSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
