import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  getBudgetOverview,
  getHeadLedger,
  saveBudgetProposal,
  consolidateBudgets,
  decideBudgetProposal,
  setOpeningBudget,
  type BudgetLineItem,
} from "@/lib/procurement/budget.functions";
import {
  BUDGET_CATEGORIES,
  categoryLabel,
  financialYear,
  fyQuarter,
} from "@/lib/procurement/budgetLedger";
import { Wallet, PieChart, Send, CheckCircle2, Undo2, Plus, Trash2, BookOpen } from "lucide-react";

const inr = (n: number | string | null | undefined) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
  submitted: {
    label: "With Finance",
    cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  with_evp: {
    label: "With EVP",
    cls: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  },
  sanctioned: {
    label: "Approved",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  rework: {
    label: "Sent back",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
};

function fyOptions() {
  const cur = financialYear();
  const y = Number(cur.slice(0, 4));
  const fy = (n: number) => `${n}-${String((n + 1) % 100).padStart(2, "0")}`;
  return [fy(y - 1), cur, fy(y + 1)];
}

export default function BudgetManagement() {
  const { toast } = useToast();
  const [fy, setFy] = useState(financialYear());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("heads");
  const [ledgerHead, setLedgerHead] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await (getBudgetOverview as any)({ data: { financial_year: fy } });
      if (!res?.ok) throw new Error(res?.error);
      setData(res);
    } catch (e: any) {
      toast({ title: "Couldn't load budgets", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [fy]);

  const me = data?.me ?? {};
  const heads: any[] = data?.heads ?? [];
  const totals = useMemo(
    () =>
      heads.reduce(
        (t, h) => ({
          allocated: t.allocated + h.allocated,
          committed: t.committed + h.committed,
          spent: t.spent + h.spent,
          balance: t.balance + h.balance,
        }),
        { allocated: 0, committed: 0, spent: 0, balance: 0 },
      ),
    [heads],
  );

  const tabs = [
    { id: "heads", label: "Budget heads", show: true },
    { id: "proposal", label: "Department proposal", show: (me.hodDeptIds ?? []).length > 0 },
    { id: "approvals", label: "Finance & EVP", show: me.isStaff },
    { id: "opening", label: "Opening budget", show: me.isFinance },
    { id: "quarterly", label: "Quarterly review", show: true },
  ].filter((t) => t.show);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 mb-2">
              <Wallet className="w-3.5 h-3.5" /> Annual budget
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Budgets</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              HODs propose in March, Finance consolidates in April, the EVP approves before June.
              Issued orders commit against a head; payments count as spent.
            </p>
          </div>
          <div className="w-40">
            <Label className="text-xs">Financial year</Label>
            <Select value={fy} onValueChange={setFy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fyOptions().map((o) => (
                  <SelectItem key={o} value={o}>
                    FY {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["Approved", totals.allocated],
            ["Committed", totals.committed],
            ["Spent", totals.spent],
            ["Balance", totals.balance],
          ].map(([label, value]) => (
            <Card key={label as string}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div
                  className={`text-xl font-bold font-mono ${
                    label === "Balance" && Number(value) < 0 ? "text-red-600 dark:text-red-400" : ""
                  }`}
                >
                  {inr(value as number)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {loading && !data ? (
          <p className="text-center text-muted-foreground py-10">Loading budgets...</p>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex flex-wrap h-auto">
              {tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="text-xs sm:text-sm">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="heads" className="mt-4">
              <HeadsTable heads={heads} onLedger={setLedgerHead} fy={fy} />
            </TabsContent>
            <TabsContent value="proposal" className="mt-4">
              <ProposalEditor
                fy={fy}
                departments={(data?.departments ?? []).filter((d: any) =>
                  (me.hodDeptIds ?? []).includes(d.id),
                )}
                proposals={data?.proposals ?? []}
                onSaved={load}
              />
            </TabsContent>
            <TabsContent value="approvals" className="mt-4">
              <Approvals fy={fy} me={me} proposals={data?.proposals ?? []} onChanged={load} />
            </TabsContent>
            <TabsContent value="opening" className="mt-4">
              <OpeningBudget
                fy={fy}
                departments={data?.departments ?? []}
                heads={heads}
                onSaved={load}
              />
            </TabsContent>
            <TabsContent value="quarterly" className="mt-4">
              <Quarterly heads={heads} fy={fy} />
            </TabsContent>
          </Tabs>
        )}

        <LedgerDialog head={ledgerHead} onClose={() => setLedgerHead(null)} />
      </div>
    </Layout>
  );
}

function HeadsTable({
  heads,
  onLedger,
  fy,
}: {
  heads: any[];
  onLedger: (h: any) => void;
  fy: string;
}) {
  if (!heads.length)
    return (
      <Card className="p-8 text-center text-muted-foreground text-sm">
        No budget heads for FY {fy} yet. They appear when the EVP approves a department's budget, or
        when Finance enters an opening budget.
      </Card>
    );
  const byDept = heads.reduce((m: Record<string, any[]>, h) => {
    (m[h.department_name] ??= []).push(h);
    return m;
  }, {});
  return (
    <div className="space-y-4">
      {Object.entries(byDept).map(([dept, rows]) => (
        <Card key={dept}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{dept}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-xs text-muted-foreground text-left">
                <tr>
                  <th className="py-2 pr-3 font-medium">Head</th>
                  <th className="py-2 pr-3 font-medium text-right">Approved</th>
                  <th className="py-2 pr-3 font-medium text-right">Committed</th>
                  <th className="py-2 pr-3 font-medium text-right">Spent</th>
                  <th className="py-2 pr-3 font-medium text-right">Balance</th>
                  <th className="py-2 font-medium w-32">Used</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((h) => {
                  const used = h.allocated
                    ? Math.min(100, ((h.allocated - h.balance) / h.allocated) * 100)
                    : 0;
                  return (
                    <tr key={h.id}>
                      <td className="py-2 pr-3">
                        <div className="font-mono text-xs font-semibold">{h.code}</div>
                        <div className="text-xs text-muted-foreground">
                          {categoryLabel(h.category)}
                          {h.source === "opening" && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              Opening
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{inr(h.allocated)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{inr(h.committed)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{inr(h.spent)}</td>
                      <td
                        className={`py-2 pr-3 text-right font-mono font-semibold ${
                          h.balance < 0 ? "text-red-600 dark:text-red-400" : ""
                        }`}
                      >
                        {inr(h.balance)}
                      </td>
                      <td className="py-2">
                        <div
                          className="h-2 rounded bg-muted overflow-hidden"
                          aria-label={`${Math.round(used)}% used`}
                        >
                          <div
                            className={`h-full ${used >= 100 ? "bg-red-500" : used >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${used}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onLedger(h)}
                          className="gap-1"
                        >
                          <BookOpen className="w-3.5 h-3.5" /> Ledger
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LedgerDialog({ head, onClose }: { head: any; onClose: () => void }) {
  const [entries, setEntries] = useState<any[] | null>(null);
  useEffect(() => {
    if (!head) return;
    setEntries(null);
    (getHeadLedger as any)({ data: { head_id: head.id } }).then((r: any) =>
      setEntries(r?.ok ? r.entries : []),
    );
  }, [head]);
  const label: Record<string, string> = {
    commit: "Committed",
    spend: "Spent",
    release: "Released",
  };
  return (
    <Dialog open={!!head} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{head?.code}</DialogTitle>
          <DialogDescription>
            {head?.title} · approved {inr(head?.allocated)} · balance {inr(head?.balance)}
          </DialogDescription>
        </DialogHeader>
        {entries === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing has been charged to this head yet.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {entries.map((e) => (
              <li key={e.id} className="py-2 flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {label[e.entry_type] ?? e.entry_type}
                    {e.purchase_orders?.po_number && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {" "}
                        · {e.purchase_orders.po_number}
                      </span>
                    )}
                    {e.invoices?.invoice_number && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {" "}
                        · {e.invoices.invoice_number}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {e.notes} · {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
                <span
                  className={`font-mono shrink-0 ${e.entry_type === "release" ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                >
                  {e.entry_type === "release" ? "+" : e.entry_type === "commit" ? "−" : ""}
                  {inr(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

const emptyLine = (): BudgetLineItem => ({
  category: "small_value",
  description: "",
  justification: "",
  amount: 0,
  q1: 0,
  q2: 0,
  q3: 0,
  q4: 0,
});

function ProposalEditor({
  fy,
  departments,
  proposals,
  onSaved,
}: {
  fy: string;
  departments: any[];
  proposals: any[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [deptId, setDeptId] = useState(departments[0]?.id ?? "");
  const proposal = proposals.find((p) => p.department_id === deptId);
  const editable = !proposal || ["draft", "rework"].includes(proposal.status);
  const [alloc, setAlloc] = useState<Record<string, number | "">>({});
  const [lines, setLines] = useState<BudgetLineItem[]>([]);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!deptId && departments[0]) setDeptId(departments[0].id);
  }, [departments]);
  useEffect(() => {
    setAlloc(proposal?.category_allocations ?? {});
    setLines(proposal?.line_items ?? []);
    setRemarks(proposal?.hod_remarks ?? "");
  }, [deptId, proposal?.id, proposal?.updated_at]);

  const total = Object.values(alloc).reduce<number>((s, v) => s + (Number(v) || 0), 0);
  const save = async (submit: boolean) => {
    setSaving(true);
    try {
      const res = await (saveBudgetProposal as any)({
        data: {
          financial_year: fy,
          department_id: deptId,
          category_allocations: Object.fromEntries(
            Object.entries(alloc).map(([k, v]) => [k, Number(v) || 0]),
          ),
          line_items: lines,
          hod_remarks: remarks,
          submit,
        },
      });
      if (!res?.ok) throw new Error(res?.error);
      toast({ title: submit ? "Budget sent to Finance" : "Draft saved" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Not saved", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Department budget for FY {fy}</CardTitle>
            <CardDescription>
              Annual requirement per category, with what each line is for.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {departments.length > 1 && (
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {proposal && (
              <span
                className={`text-xs font-semibold px-2 py-1 rounded ${STATUS[proposal.status]?.cls}`}
              >
                {STATUS[proposal.status]?.label ?? proposal.status}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {proposal?.status === "rework" && proposal.evp_remarks && (
          <p className="text-sm rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
            <strong>Sent back by the EVP:</strong> {proposal.evp_remarks}
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {BUDGET_CATEGORIES.map((c) => (
            <div key={c.value} className="space-y-1">
              <Label className="text-xs">{c.label}</Label>
              <Input
                type="number"
                min="0"
                disabled={!editable}
                value={alloc[c.value] ?? ""}
                placeholder="0"
                onChange={(e) =>
                  setAlloc({
                    ...alloc,
                    [c.value]: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-sm border-t pt-3">
          <span className="text-muted-foreground">Total proposed</span>
          <span className="font-mono font-bold">{inr(total)}</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Line items (optional)</Label>
            {editable && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1"
                onClick={() => setLines([...lines, emptyLine()])}
              >
                <Plus className="w-3.5 h-3.5" /> Add line
              </Button>
            )}
          </div>
          {lines.map((l, i) => {
            const set = (patch: Partial<BudgetLineItem>) =>
              setLines(lines.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="rounded-lg border p-3 space-y-2">
                <div className="grid sm:grid-cols-3 gap-2">
                  <Select
                    value={l.category}
                    onValueChange={(v) => set({ category: v })}
                    disabled={!editable}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUDGET_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="sm:col-span-2"
                    placeholder="What is needed"
                    value={l.description}
                    disabled={!editable}
                    onChange={(e) => set({ description: e.target.value })}
                  />
                </div>
                <Input
                  placeholder="Why (academic, research or operational need)"
                  value={l.justification}
                  disabled={!editable}
                  onChange={(e) => set({ justification: e.target.value })}
                />
                <div className="grid grid-cols-5 gap-2 items-end">
                  {(["amount", "q1", "q2", "q3", "q4"] as const).map((k) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        {k === "amount" ? "Total ₹" : k}
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={l[k] || ""}
                        disabled={!editable}
                        onChange={(e) => set({ [k]: Number(e.target.value) || 0 })}
                      />
                    </div>
                  ))}
                </div>
                {editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-red-600"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-1">
          <Label>Remarks for Finance</Label>
          <Textarea
            rows={2}
            value={remarks}
            disabled={!editable}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
        {editable ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={saving || !deptId} onClick={() => save(false)}>
              Save draft
            </Button>
            <Button
              disabled={saving || !deptId || total <= 0}
              onClick={() => save(true)}
              className="gap-1"
            >
              <Send className="w-4 h-4" /> Send to Finance
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-right">
            This budget is {STATUS[proposal.status]?.label.toLowerCase()} and can't be edited.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Approvals({
  fy,
  me,
  proposals,
  onChanged,
}: {
  fy: string;
  me: any;
  proposals: any[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{
    kind: "consolidate" | "approve" | "rework";
    proposal?: any;
  } | null>(null);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const submitted = proposals.filter((p) => p.status === "submitted");

  const act = async () => {
    if (!dialog) return;
    setBusy(true);
    try {
      const res =
        dialog.kind === "consolidate"
          ? await (consolidateBudgets as any)({ data: { financial_year: fy, remarks } })
          : await (decideBudgetProposal as any)({
              data: {
                proposal_id: dialog.proposal.id,
                approve: dialog.kind === "approve",
                remarks,
              },
            });
      if (!res?.ok) throw new Error(res?.error);
      toast({
        title:
          dialog.kind === "consolidate"
            ? `${res.count} budget${res.count === 1 ? "" : "s"} sent to the EVP`
            : dialog.kind === "approve"
              ? "Budget approved — its heads are live"
              : "Budget sent back to the HOD",
      });
      setDialog(null);
      onChanged();
    } catch (e: any) {
      toast({ title: "Not done", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Department budgets, FY {fy}</CardTitle>
          <CardDescription>
            Finance consolidates submitted budgets and sends them to the EVP.
          </CardDescription>
        </div>
        {me.isFinance && (
          <Button
            disabled={!submitted.length}
            onClick={() => {
              setRemarks("");
              setDialog({ kind: "consolidate" });
            }}
            className="gap-1"
          >
            <Send className="w-4 h-4" /> Consolidate & send to EVP ({submitted.length})
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!proposals.length ? (
          <p className="text-sm text-muted-foreground">
            No department has started a budget for FY {fy}.
          </p>
        ) : (
          <ul className="divide-y">
            {proposals.map((p) => (
              <li key={p.id} className="py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{p.department_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {inr(p.total_proposed)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded ${STATUS[p.status]?.cls}`}
                    >
                      {STATUS[p.status]?.label ?? p.status}
                    </span>
                    {me.isEvp && p.status === "with_evp" && (
                      <>
                        <Button
                          size="sm"
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => {
                            setRemarks("");
                            setDialog({ kind: "approve", proposal: p });
                          }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => {
                            setRemarks("");
                            setDialog({ kind: "rework", proposal: p });
                          }}
                        >
                          <Undo2 className="w-3.5 h-3.5" /> Send back
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(p.category_allocations ?? {}).map(([c, v]) => (
                    <Badge key={c} variant="outline" className="text-[11px] font-normal">
                      {categoryLabel(c)}: <span className="font-mono ml-1">{inr(v as number)}</span>
                    </Badge>
                  ))}
                </div>
                {(p.hod_remarks || p.finance_remarks || p.evp_remarks) && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {p.hod_remarks && <p>HOD: {p.hod_remarks}</p>}
                    {p.finance_remarks && <p>Finance: {p.finance_remarks}</p>}
                    {p.evp_remarks && <p>EVP: {p.evp_remarks}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "consolidate"
                ? "Consolidate and send to the EVP"
                : dialog?.kind === "approve"
                  ? `Approve ${dialog?.proposal?.department_name}`
                  : `Send ${dialog?.proposal?.department_name} back`}
            </DialogTitle>
            <DialogDescription>
              {dialog?.kind === "approve"
                ? "Its category amounts become budget heads that requisitions are charged to."
                : dialog?.kind === "rework"
                  ? "The HOD can edit and resubmit it."
                  : `${submitted.length} submitted budget${submitted.length === 1 ? "" : "s"} go to the EVP together.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>
              {dialog?.kind === "rework" ? "What needs to change" : "Remarks (optional)"}
            </Label>
            <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button disabled={busy || (dialog?.kind === "rework" && !remarks.trim())} onClick={act}>
              {dialog?.kind === "consolidate"
                ? "Send to EVP"
                : dialog?.kind === "approve"
                  ? "Approve"
                  : "Send back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function OpeningBudget({
  fy,
  departments,
  heads,
  onSaved,
}: {
  fy: string;
  departments: any[];
  heads: any[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [deptId, setDeptId] = useState("");
  const [alloc, setAlloc] = useState<Record<string, number | "">>({});
  const [saving, setSaving] = useState(false);
  const deptHeads = heads.filter((h) => h.department_id === deptId);

  useEffect(() => {
    setAlloc(Object.fromEntries(deptHeads.map((h) => [h.category, h.allocated])));
  }, [deptId, heads]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await (setOpeningBudget as any)({
        data: {
          financial_year: fy,
          department_id: deptId,
          // EVP-approved heads are read-only here, so only send the editable ones.
          allocations: Object.fromEntries(
            Object.entries(alloc)
              .filter(
                ([k]) => !deptHeads.some((h) => h.category === k && h.source === "sanctioned"),
              )
              .map(([k, v]) => [k, Number(v) || 0]),
          ),
        },
      });
      if (!res?.ok) throw new Error(res?.error);
      toast({
        title: `Opening budget saved (${res.saved} head${res.saved === 1 ? "" : "s"})`,
        description: res.skipped?.length
          ? `Already approved by the EVP, so not changed: ${res.skipped.join(", ")}.`
          : undefined,
      });
      onSaved();
    } catch (e: any) {
      toast({ title: "Not saved", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Opening budget, FY {fy}</CardTitle>
        <CardDescription>
          For a year that was approved outside this system: enter each department's approved
          amounts. Heads the EVP approved here can't be changed from this screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm space-y-1">
          <Label>Department</Label>
          <Select value={deptId} onValueChange={setDeptId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a department..." />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {deptId && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {BUDGET_CATEGORIES.map((c) => {
                const head = deptHeads.find((h) => h.category === c.value);
                const locked = head?.source === "sanctioned";
                return (
                  <div key={c.value} className="space-y-1">
                    <Label className="text-xs flex justify-between">
                      <span>{c.label}</span>
                      {locked && <span className="text-muted-foreground">EVP-approved</span>}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      disabled={locked}
                      value={alloc[c.value] ?? ""}
                      onChange={(e) =>
                        setAlloc({
                          ...alloc,
                          [c.value]: e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button disabled={saving} onClick={save} className="gap-1">
                <PieChart className="w-4 h-4" /> Save opening budget
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Quarterly({ heads, fy }: { heads: any[]; fy: string }) {
  const current = fy === financialYear() ? fyQuarter(new Date()) : null;
  if (!heads.length)
    return (
      <Card className="p-8 text-center text-muted-foreground text-sm">
        No budget heads for FY {fy}.
      </Card>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quarterly review (Jun · Sep · Dec · Mar)</CardTitle>
        <CardDescription>
          Net committed and spent each quarter against an even quarter of the approved amount.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs min-w-[720px]">
          <thead className="text-muted-foreground text-left">
            <tr>
              <th className="py-2 pr-3 font-medium">Head</th>
              {[1, 2, 3, 4].map((q) => (
                <th
                  key={q}
                  className={`py-2 pr-3 font-medium text-right ${current === q ? "text-foreground" : ""}`}
                >
                  Q{q} {q === 1 ? "Apr–Jun" : q === 2 ? "Jul–Sep" : q === 3 ? "Oct–Dec" : "Jan–Mar"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {heads.map((h) => (
              <tr key={h.id}>
                <td className="py-2 pr-3">
                  <div className="font-mono font-semibold">{h.code}</div>
                  <div className="text-muted-foreground">{h.department_name}</div>
                </td>
                {h.quarters.map((q: any) => (
                  <td
                    key={q.quarter}
                    className={`py-2 pr-3 text-right font-mono ${current === q.quarter ? "bg-muted/50" : ""}`}
                  >
                    <div
                      className={
                        q.net > q.planned ? "text-red-600 dark:text-red-400 font-semibold" : ""
                      }
                    >
                      {inr(q.net)} <span className="text-muted-foreground">/ {inr(q.planned)}</span>
                    </div>
                    <div className="text-muted-foreground">spent {inr(q.spent)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
