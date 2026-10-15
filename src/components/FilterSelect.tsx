import type { ComponentType } from "react";
import { Check, ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type FilterOption<T = unknown> = {
  id: string;
  label: string;
  count: number;
  match?: (item: T) => boolean;
  icon?: ComponentType<{ className?: string }>;
  /** Tailwind text color for the icon. */
  color?: string;
  /** Draw a divider above this option. */
  divider?: boolean;
};

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Active → one option per status present (with counts) → History → All.
 * `closed` lists the statuses that count as finished (shown under History).
 */
export function statusFilterOptions<T>(
  items: T[],
  statusOf: (item: T) => string,
  closed: string[],
  labels: Record<string, string> = {},
): FilterOption<T>[] {
  const isClosed = (i: T) => closed.includes(statusOf(i));
  const counts = new Map<string, number>();
  for (const i of items) counts.set(statusOf(i), (counts.get(statusOf(i)) ?? 0) + 1);
  const statuses = [...counts.keys()].sort(
    (a, b) => Number(closed.includes(a)) - Number(closed.includes(b)) || a.localeCompare(b),
  );

  return [
    { id: "active", label: "Active", count: items.filter((i) => !isClosed(i)).length, match: (i) => !isClosed(i) },
    ...statuses.map((s, idx) => ({
      id: `status:${s}`,
      label: labels[s] ?? titleCase(s),
      count: counts.get(s) ?? 0,
      match: (i: T) => statusOf(i) === s,
      divider: idx === 0,
    })),
    { id: "history", label: "History", count: items.filter(isClosed).length, match: isClosed, divider: true },
    { id: "all", label: "All", count: items.length, match: () => true },
  ];
}

/** Apply the selected option (falls back to everything if the option disappeared). */
export function applyFilter<T>(items: T[], options: FilterOption<T>[], value: string): T[] {
  const match = options.find((o) => o.id === value)?.match;
  return match ? items.filter(match) : items;
}

/** One dropdown filter, full-width on phones and compact on larger screens. */
export function FilterSelect<T>({
  value,
  onChange,
  options,
  title = "Filter by status",
}: {
  value: string;
  onChange: (id: string) => void;
  options: FilterOption<T>[];
  title?: string;
}) {
  const selected = options.find((o) => o.id === value) ?? options[0];
  const SelectedIcon = selected?.icon ?? Filter;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-10 w-full sm:w-auto sm:min-w-[260px] justify-between gap-3 rounded-xl bg-background px-3.5 text-sm shadow-sm"
          aria-label={`${title}: ${selected?.label}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <SelectedIcon className={`h-4 w-4 shrink-0 ${selected?.color ?? "text-primary"}`} />
            <span className="text-muted-foreground font-normal">Show:</span>
            <span className="truncate font-semibold">{selected?.label}</span>
          </span>
          <span className="flex items-center gap-2">
            <Badge variant="secondary" className="px-2 py-0 text-xs tabular-nums">
              {selected?.count ?? 0}
            </Badge>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[260px] max-h-[60vh] overflow-y-auto p-1.5"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {title}
        </DropdownMenuLabel>
        {options.map((opt) => {
          const Icon = opt.icon;
          const isSelected = opt.id === selected?.id;
          return (
            <div key={opt.id}>
              {opt.divider && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={() => onChange(opt.id)}
                className={`cursor-pointer gap-2.5 rounded-lg px-2.5 py-2.5 text-sm ${isSelected ? "bg-accent font-semibold" : ""}`}
              >
                {Icon ? (
                  <Icon className={`h-4 w-4 ${opt.color ?? ""}`} />
                ) : (
                  <Check className={`h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                )}
                <span className="flex-1">{opt.label}</span>
                <Badge
                  variant={isSelected ? "default" : "secondary"}
                  className="px-2 py-0 text-xs tabular-nums"
                >
                  {opt.count}
                </Badge>
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
