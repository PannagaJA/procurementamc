/**
 * Rate finalisation RFQs (SOP Section VI): ask vendors for a unit rate per item, compare at
 * least three complete quotes, and send the chosen vendor's rates to the EVP as a rate contract.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ITEM_GROUPS } from "@/lib/procurement/itemGroups";
import {
  RATE_CONTRACT_CATEGORIES,
  RATE_CONTRACT_MIN_QUOTES,
  rankRateQuotes,
  type RateItem,
} from "@/lib/procurement/rateContracts";
import { createRateRfq } from "@/lib/procurement/rfq.functions";
import { createRateContractFromRfq } from "@/lib/procurement/rateContract.functions";
import { PlusCircle, Trash2 } from "lucide-react";

const GROUPS = ITEM_GROUPS.filter((g) => g.id !== "not_consumable");
const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;
const today = () => new Date().toISOString().split("T")[0];
const sixMonthsFrom = (from: string) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 6);
  return d.toISOString().split("T")[0];
};

export function NewRateRfqDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("routine_consumable");
  const [items, setItems] = useState<RateItem[]>([{ group: "", description: "", unit: "nos" }]);
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const setItem = (i: number, patch: Partial<RateItem>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await createRateRfq({
        data: { title, category, items, response_deadline: deadline || null, notes: notes || null },
      });
      if (!res.ok) throw new Error(res.error);
      toast({
        title: "Rate RFQ created",
        description: `${res.rfq.rfq_number}: now invite at least ${RATE_CONTRACT_MIN_QUOTES} empanelled vendors.`,
      });
      setTitle("");
      setItems([{ group: "", description: "", unit: "nos" }]);
      setDeadline("");
      setNotes("");
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast({ title: "Couldn't create the RFQ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New rate contract RFQ</DialogTitle>
          <DialogDescription>
            Ask empanelled vendors for a unit rate per item. A rate contract needs at least{" "}
            {RATE_CONTRACT_MIN_QUOTES} complete quotations and the EVP's approval (SOP Section VI).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Stationery & printing supplies, H2 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATE_CONTRACT_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items to price *</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1 text-indigo-600 dark:text-indigo-400"
                onClick={() =>
                  setItems((prev) => [...prev, { group: "", description: "", unit: "nos" }])
                }
              >
                <PlusCircle className="w-3.5 h-3.5" /> Add item
              </Button>
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.4fr_5rem_auto] gap-2 items-center">
                <Select value={it.group} onValueChange={(v) => setItem(i, { group: v })}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Item group" />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUPS.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={it.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                  placeholder="Item, e.g. A4 paper 75 gsm"
                />
                <Input
                  value={it.unit}
                  onChange={(e) => setItem(i, { unit: e.target.value })}
                  placeholder="Unit"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={items.length === 1}
                  onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Remove item"
                >
                  <Trash2 className="w-4 h-4 text-slate-500" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Quotation deadline</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes for vendors</Label>
              <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? "Creating..." : "Create RFQ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Quotes on a rate RFQ, item by item, and the "create rate contract" step. */
export function RateQuotesDialog({
  rfq,
  canCreate,
  onClose,
  onCreated,
}: {
  rfq: any | null;
  canCreate: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const items: RateItem[] = rfq?.rate_items_json ?? [];
  const lines: any[] = rfq?.quotation_lines ?? [];
  const names = new Map<string, string>(
    lines.map((l) => [l.vendor_id, l.vendors?.name ?? "Vendor"]),
  );
  const ranking = rankRateQuotes(items, lines, 0);
  const ranked = ranking.ok ? ranking.ranked : [];
  const minQuotes = rfq?.required_min_quotations || RATE_CONTRACT_MIN_QUOTES;
  const incomplete = [...names.keys()].filter((v) => !ranked.some((q) => q.vendor_id === v));
  const enough = ranked.length >= minQuotes;
  const lowestPerItem = items.map((_, i) => Math.min(...ranked.map((q) => q.rates[i])));

  const [vendorId, setVendorId] = useState("");
  const [title, setTitle] = useState("");
  const [validFrom, setValidFrom] = useState(today());
  const [validTo, setValidTo] = useState(sixMonthsFrom(today()));
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  const chosen = vendorId || ranked[0]?.vendor_id || "";
  const notLowest = !!chosen && chosen !== ranked[0]?.vendor_id;

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await createRateContractFromRfq({
        data: {
          rfq_id: rfq.id,
          vendor_id: chosen,
          title: title || rfq.title || "",
          valid_from: validFrom,
          valid_to: validTo,
          justification: notLowest ? justification : null,
        },
      });
      if (!res.ok) throw new Error(res.error);
      toast({
        title: "Rate contract sent to the EVP",
        description: `${res.contract.contract_number} covers purchases once the EVP approves it.`,
      });
      onClose();
      onCreated();
    } catch (e: any) {
      toast({
        title: "Couldn't create the rate contract",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!rfq} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rfq?.rfq_number} · {rfq?.title}
          </DialogTitle>
          <DialogDescription>
            Unit rates quoted per item. {ranked.length} complete quotation
            {ranked.length === 1 ? "" : "s"} (at least {minQuotes} needed).
          </DialogDescription>
        </DialogHeader>

        {ranked.length > 0 && (
          <div className="border rounded-lg overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-100 dark:bg-slate-900 border-b">
                <tr>
                  <th className="p-2 font-semibold">Item</th>
                  {ranked.map((q, i) => (
                    <th
                      key={q.vendor_id}
                      className="p-2 font-semibold text-right whitespace-nowrap"
                    >
                      {names.get(q.vendor_id)}
                      {i === 0 && (
                        <Badge className="ml-1.5 text-[10px] bg-emerald-600 text-white">
                          Lowest
                        </Badge>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="p-2">
                      {it.description}
                      <span className="text-slate-500 dark:text-slate-400"> / {it.unit}</span>
                    </td>
                    {ranked.map((q) => (
                      <td
                        key={q.vendor_id}
                        className={`p-2 text-right font-mono ${
                          q.rates[i] === lowestPerItem[i]
                            ? "font-bold text-emerald-700 dark:text-emerald-400"
                            : ""
                        }`}
                      >
                        {inr(q.rates[i])}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-slate-50 dark:bg-slate-900/60 font-semibold">
                  <td className="p-2">Total of unit rates</td>
                  {ranked.map((q) => (
                    <td key={q.vendor_id} className="p-2 text-right font-mono">
                      {inr(q.total)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {incomplete.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Not counted (didn't price every item): {incomplete.map((v) => names.get(v)).join(", ")}
          </p>
        )}

        {canCreate && rfq?.status === "sent" && (
          <div className="space-y-3 border-t pt-3">
            <h4 className="text-sm font-semibold">Create rate contract</h4>
            {!enough ? (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Waiting for quotations: {ranked.length} of {minQuotes} complete so far.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Vendor</Label>
                    <Select value={chosen} onValueChange={setVendorId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ranked.map((q, i) => (
                          <SelectItem key={q.vendor_id} value={q.vendor_id}>
                            {names.get(q.vendor_id)} · {inr(q.total)}
                            {i === 0 ? " (lowest)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contract title</Label>
                    <Input
                      value={title}
                      placeholder={rfq.title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valid from</Label>
                    <Input
                      type="date"
                      value={validFrom}
                      onChange={(e) => {
                        setValidFrom(e.target.value);
                        setValidTo(sixMonthsFrom(e.target.value));
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valid to (at most 6 months)</Label>
                    <Input
                      type="date"
                      value={validTo}
                      max={sixMonthsFrom(validFrom)}
                      onChange={(e) => setValidTo(e.target.value)}
                    />
                  </div>
                </div>
                {notLowest && (
                  <div className="space-y-1.5">
                    <Label>Why not the lowest quote? *</Label>
                    <Textarea
                      rows={2}
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canCreate && rfq?.status === "sent" && enough && (
            <Button
              onClick={handleCreate}
              disabled={saving || (notLowest && !justification.trim())}
            >
              {saving ? "Sending..." : "Send to EVP for approval"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
