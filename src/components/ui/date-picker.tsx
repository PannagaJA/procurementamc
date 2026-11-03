import * as React from "react";
import { format, parse, isValid } from "date-fns";
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
  value?: string | Date;
  onChange?: (dateStr: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  minDate?: Date;
  maxDate?: Date;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled = false,
  className,
  id,
  name,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse string (YYYY-MM-DD) or Date
  const parsedDate = React.useMemo(() => {
    if (!value) return undefined;
    if (value instanceof Date) return isValid(value) ? value : undefined;
    if (typeof value === "string") {
      const parts = value.split("-");
      if (parts.length === 3) {
        const d = parse(value, "yyyy-MM-dd", new Date());
        return isValid(d) ? d : undefined;
      }
      const d = new Date(value);
      return isValid(d) ? d : undefined;
    }
    return undefined;
  }, [value]);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const formatted = format(date, "yyyy-MM-dd");
      onChange?.(formatted);
    } else {
      onChange?.("");
    }
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.("");
  };

  const isDateDisabled = (date: Date) => {
    if (minDate && date < new Date(minDate.setHours(0, 0, 0, 0))) return true;
    if (maxDate && date > new Date(maxDate.setHours(23, 59, 59, 999))) return true;
    return false;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          name={name}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between text-left font-normal h-12 text-base rounded-md border border-input bg-background px-3 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-foreground active:scale-100 hover:scale-100",
            !parsedDate && "text-muted-foreground",
            className,
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <CalendarIcon className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="truncate">
              {parsedDate ? format(parsedDate, "dd-MM-yyyy") : placeholder}
            </span>
          </div>
          {parsedDate && !disabled && (
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
              <X className="h-3.5 w-3.5 shrink-0" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-50 rounded-xl shadow-xl border bg-white dark:bg-slate-900" align="start">
        <Calendar
          mode="single"
          selected={parsedDate}
          onSelect={handleSelect}
          disabled={isDateDisabled}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
