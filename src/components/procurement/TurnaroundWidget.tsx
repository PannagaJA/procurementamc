import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadTurnaround, type TurnaroundItem } from "@/lib/procurement/turnaround";
import { Clock } from "lucide-react";

const STATUS = {
  on_time: {
    label: "on time",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  due_today: {
    label: "due today",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  overdue: { label: "overdue", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
} as const;

/** How long open items have been waiting, against the SOP's working-day targets. */
export function TurnaroundWidget() {
  const [items, setItems] = useState<TurnaroundItem[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      loadTurnaround()
        .then((r) => alive && setItems(r))
        .catch(() => alive && setItems([]));
    load();
    const t = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!items?.length) return null;
  const count = (s: keyof typeof STATUS) => items.filter((i) => i.status === s).length;
  const late = items.filter((i) => i.status !== "on_time");

  return (
    <>
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-sm flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-muted-foreground" /> Turnaround times
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Open items against their target: requisitions 2 days, quotations 7 (or the RFQ
              deadline), orders 1, goods inspection 2, invoices 5 (3 when on hold). Working days.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => (
              <span key={s} className={`text-xs font-semibold px-2 py-1 rounded ${STATUS[s].cls}`}>
                {count(s)} {STATUS[s].label}
              </span>
            ))}
            {late.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                View late items
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Late items</DialogTitle>
            <DialogDescription>Overdue first, then those due today.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y text-sm">
            {late.map((i) => (
              <li
                key={`${i.step}-${i.id}`}
                className="py-2.5 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-mono font-semibold">{i.number}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.step} · waiting on {i.waitingOn}
                  </div>
                  <div className="text-xs mt-0.5">
                    {i.daysWaiting} of {i.targetDays} working day{i.targetDays === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${STATUS[i.status].cls}`}
                  >
                    {STATUS[i.status].label}
                  </span>
                  <Link
                    to={i.path}
                    className="text-xs text-primary hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
