import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  runThreeWayMatch,
  returnInvoice,
  approveWithDeductions,
  requestDeviation,
} from "@/lib/procurement/invoice.functions";
import {
  Clock,
  History,
  MinusCircle,
  Plus,
  RefreshCw,
  Trash2,
  Undo2,
  Scale,
  FilePlus2,
} from "lucide-react";

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/** Working days (Mon–Fri) since a timestamp — SOP §8.7 asks for resolution in 2–3 working days. */
function workingDaysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  let days = 0;
  const d = new Date(iso);
  const now = new Date();
  while (d < now) {
    d.setDate(d.getDate() + 1);
    if (d <= now && d.getDay() !== 0 && d.getDay() !== 6) days++;
  }
  return days;
}

const GUIDANCE: Record<string, string> = {
  no_grn:
    "The goods haven't been received and accepted yet. Complete the goods receipt (GRN), then re-check the match.",
  exceeds_grn:
    "The vendor billed for more than was accepted. Pay only the accepted value (deduct the rest), wait for the next delivery and re-check, or return the invoice.",
  exceeds_po:
    "The vendor billed above the purchase order. Pay the PO value (deduct the excess), return it for a revised invoice, or — if the price change is genuine — amend the PO and re-check.",
  zero_amount: "The invoice amount is zero. Return it to the vendor for a corrected invoice.",
};

const ACTION_LABELS: Record<string, string> = {
  submitted: "Submitted",
  revised: "Revised invoice submitted",
  superseded: "Replaced by a revised invoice",
  rechecked: "Match re-checked",
  held: "Put on hold",
  returned: "Returned to vendor",
  approved: "Approved",
  approved_with_deductions: "Approved with deductions",
  deviation_requested: "EVP deviation requested",
  deviation_approved: "EVP accepted the difference",
  deviation_rejected: "EVP rejected the difference",
  paid: "Paid",
};

type Mode = "return" | "deduct" | "deviation" | null;

export function InvoiceHoldResolution({
  inv,
  canResolve,
  canDeduct,
  onChanged,
  onRevise,
}: {
  inv: any;
  /** Finance or procurement: re-check, return, request deviation, enter a revision. */
  canResolve: boolean;
  /** Finance only: approve with deductions. */
  canDeduct: boolean;
  onChanged: () => void;
  onRevise: (inv: any) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState("");
  const [payable, setPayable] = useState<number | "">("");
  const [deductions, setDeductions] = useState<{ reason: string; amount: number | "" }[]>([]);

  const res = inv.resolution;
  const isOnHold = inv.match_status === "on_hold";
  const isReturned = inv.match_status === "returned";
  const events: any[] = inv.invoice_events ?? [];
  const superseded = events.some((e) => e.action === "superseded");
  const invVal = Number(inv.invoice_amount || 0);
  const heldDays = workingDaysSince(inv.held_at);

  const run = async (fn: () => Promise<any>, success: string) => {
    setBusy(true);
    try {
      const r = await fn();
      if (!r?.ok) {
        toast({ title: "Not done", description: r?.error, variant: "destructive" });
        return;
      }
      toast({ title: success });
      setMode(null);
      onChanged();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const recheck = () =>
    run(async () => {
      const r = await (runThreeWayMatch as any)({ data: { invoice_id: inv.id } });
      if (r?.ok && r.matchStatus !== "matched")
        return { ok: false, error: `Still on hold: ${r.holdReason}` };
      return r;
    }, "Match passed — the invoice is ready for approval.");

  const openDeduct = () => {
    const cap = Number(res?.payableCap || 0);
    setPayable(cap);
    setDeductions([
      {
        reason:
          res?.holdCode === "exceeds_po"
            ? "Billed above the purchase order value"
            : "Billed for goods not accepted",
        amount: Math.round((invVal - cap) * 100) / 100,
      },
    ]);
    setMode("deduct");
  };

  const open = (m: Mode) => {
    setReason("");
    setMode(m);
  };

  const deductTotal = deductions.reduce((s, d) => s + Number(d.amount || 0), 0);
  const toExplain = invVal - Number(payable || 0);

  if (!isOnHold && !isReturned && !inv.approved_amount && events.length === 0) return null;

  return (
    <div className="space-y-2">
      {isOnHold && (
        <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-amber-900 dark:text-amber-200">
              Resolve this hold
            </span>
            {inv.held_at && (
              <span
                className={`inline-flex items-center gap-1 ${heldDays > 3 ? "text-red-700 dark:text-red-400 font-semibold" : "text-amber-800 dark:text-amber-300"}`}
              >
                <Clock className="w-3.5 h-3.5" /> On hold {heldDays} working day
                {heldDays === 1 ? "" : "s"}
                {heldDays > 3 ? " — past the 3-day target" : ""}
              </span>
            )}
          </div>
          {res?.holdCode && (
            <p className="text-slate-700 dark:text-slate-300">{GUIDANCE[res.holdCode]}</p>
          )}
          {res && Number(res.gap) > 0 && (
            <p className="text-slate-600 dark:text-slate-400">
              Over by <strong className="font-mono">{inr(res.gap)}</strong> • Payable now up to{" "}
              <strong className="font-mono">{inr(res.payableCap)}</strong>
            </p>
          )}
          {inv.deviation_status === "requested" && (
            <p className="text-indigo-700 dark:text-indigo-300 font-medium">
              Waiting for the EVP to decide whether to accept the difference.
            </p>
          )}
          {inv.deviation_status === "rejected" && (
            <p className="text-red-700 dark:text-red-400 font-medium">
              The EVP didn't accept the difference — deduct it or return the invoice.
            </p>
          )}

          {canResolve && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={recheck}
                className="gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-check match
              </Button>
              {res?.holdCode === "no_grn" && (
                <Button size="sm" variant="outline" asChild className="gap-1">
                  <Link to="/procurement/grns">Go to goods receipts</Link>
                </Button>
              )}
              {res?.holdCode === "exceeds_po" && (
                <Button size="sm" variant="outline" asChild className="gap-1">
                  <Link to="/procurement/orders">Amend the PO</Link>
                </Button>
              )}
              {canDeduct &&
                (res?.holdCode === "exceeds_po" || res?.holdCode === "exceeds_grn") &&
                Number(res.payableCap) > 0 && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={openDeduct}
                    className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <MinusCircle className="w-3.5 h-3.5" /> Approve {inr(res.payableCap)} with
                    deduction
                  </Button>
                )}
              {res?.deviationEligible &&
                inv.deviation_status !== "requested" &&
                inv.deviation_status !== "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => open("deviation")}
                    className="gap-1"
                  >
                    <Scale className="w-3.5 h-3.5" /> Ask EVP to accept {inr(res.gap)}
                  </Button>
                )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => open("return")}
                className="gap-1 text-red-700 border-red-300 dark:text-red-400 dark:border-red-900"
              >
                <Undo2 className="w-3.5 h-3.5" /> Return to vendor
              </Button>
            </div>
          )}
        </div>
      )}

      {isReturned && (
        <div className="p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs flex flex-wrap items-center justify-between gap-2">
          <span className="text-slate-700 dark:text-slate-300">
            {superseded
              ? "Returned to the vendor and replaced by a revised invoice."
              : "Returned to the vendor for correction. Enter the revised invoice when it arrives."}
          </span>
          {canResolve && !superseded && (
            <Button
              size="sm"
              onClick={() => onRevise(inv)}
              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <FilePlus2 className="w-3.5 h-3.5" /> Enter revised invoice
            </Button>
          )}
        </div>
      )}

      {inv.approved_amount != null && Array.isArray(inv.deductions_json) && (
        <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 text-xs space-y-1">
          <div className="font-semibold text-emerald-800 dark:text-emerald-300">
            Payable {inr(inv.approved_amount)} of {inr(invVal)} after deductions
          </div>
          {inv.deductions_json.map((d: any, i: number) => (
            <div key={i} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
              <span>{d.reason}</span>
              <span className="font-mono">−{inr(d.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <details className="text-xs group">
          <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 inline-flex items-center gap-1">
            <History className="w-3.5 h-3.5" /> History ({events.length})
          </summary>
          <ol className="mt-2 ml-1 border-l border-slate-200 dark:border-slate-800 space-y-2">
            {events.map((e) => (
              <li key={e.id} className="pl-3">
                <div className="text-slate-800 dark:text-slate-200 font-medium">
                  {ACTION_LABELS[e.action] ?? e.action}
                  {e.amount != null && (
                    <span className="font-mono font-normal"> • {inr(e.amount)}</span>
                  )}
                </div>
                {e.notes && <div className="text-slate-600 dark:text-slate-400">{e.notes}</div>}
                <div className="text-slate-400 text-[11px]">
                  {new Date(e.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === "return"
                ? "Return invoice to vendor"
                : mode === "deduct"
                  ? "Approve with deductions"
                  : "Ask the EVP to accept the difference"}
            </DialogTitle>
            <DialogDescription>
              Invoice {inv.invoice_number} • {inr(invVal)}
            </DialogDescription>
          </DialogHeader>

          {mode === "deduct" ? (
            <div className="space-y-3 py-1">
              <div className="space-y-1">
                <Label>Amount to pay (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  max={res?.payableCap}
                  step="0.01"
                  value={payable}
                  onChange={(e) => setPayable(e.target.value === "" ? "" : Number(e.target.value))}
                />
                <p className="text-[11px] text-slate-500">
                  At most {inr(res?.payableCap)} (what the PO and accepted goods allow).
                </p>
              </div>
              <div className="space-y-2">
                <Label>Deductions</Label>
                {deductions.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      placeholder="Reason"
                      value={d.reason}
                      onChange={(e) =>
                        setDeductions(
                          deductions.map((x, j) =>
                            j === i ? { ...x, reason: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-28"
                      value={d.amount}
                      onChange={(e) =>
                        setDeductions(
                          deductions.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  amount: e.target.value === "" ? "" : Number(e.target.value),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remove deduction"
                      disabled={deductions.length === 1}
                      onClick={() => setDeductions(deductions.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => setDeductions([...deductions, { reason: "", amount: "" }])}
                >
                  <Plus className="w-3.5 h-3.5" /> Add deduction
                </Button>
                <p
                  className={`text-[11px] ${Math.abs(deductTotal - toExplain) > 1 ? "text-red-600 dark:text-red-400" : "text-slate-500"}`}
                >
                  Deductions {inr(deductTotal)} of {inr(toExplain)} to explain
                </p>
              </div>
              <div className="space-y-1">
                <Label>Note (optional)</Label>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-1 py-1">
              <Label>
                {mode === "return"
                  ? "What must the vendor correct?"
                  : "Why should this difference be accepted?"}
              </Label>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  mode === "return"
                    ? "e.g. Bill at the PO rate of ₹2,000; GST shown twice"
                    : "e.g. Rounding difference in GST computation"
                }
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || (mode !== "deduct" && !reason.trim())}
              onClick={() => {
                if (mode === "return")
                  run(
                    () => (returnInvoice as any)({ data: { invoice_id: inv.id, reason } }),
                    "Invoice returned to the vendor.",
                  );
                else if (mode === "deviation")
                  run(
                    () => (requestDeviation as any)({ data: { invoice_id: inv.id, reason } }),
                    "Sent to the EVP.",
                  );
                else
                  run(
                    () =>
                      (approveWithDeductions as any)({
                        data: {
                          invoice_id: inv.id,
                          payable_amount: Number(payable || 0),
                          deductions: deductions.map((d) => ({
                            reason: d.reason,
                            amount: Number(d.amount || 0),
                          })),
                          notes: reason,
                        },
                      }),
                    "Approved for payment with deductions.",
                  );
              }}
            >
              {mode === "return"
                ? "Return invoice"
                : mode === "deviation"
                  ? "Send to EVP"
                  : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
