import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Building2,
  Layers,
  IndianRupee,
  TableProperties,
  ExternalLink,
  Shield,
  FileCheck2,
  Check,
  Wallet,
} from "lucide-react";
import {
  resolveApprover,
  normalizeCategory,
  AUTHORITY_MATRIX_DEFINITIONS,
  formatRoleTitle,
  fetchMonthlySpendBreakdown,
} from "@/lib/procurement/authorityMatrix";
import { createPr, rateContractCoverage } from "@/lib/procurement/pr.functions";
import { ITEM_GROUPS, itemGroupLabel } from "@/lib/procurement/itemGroups";
import { listPrBudgetHeads } from "@/lib/procurement/budget.functions";
import { isOverBudget } from "@/lib/procurement/budgetLedger";
import { checkAnnualCap } from "@/lib/procurement/emergency.functions";
import { RateBenchmarkingWidget } from "@/components/procurement/RateBenchmarkingWidget";

type LineItem = {
  id: string;
  description: string;
  unit: string;
  qty_required: number;
  qty_in_stock: number;
  est_unit_price: number;
  item_group: string;
};

const CATEGORIES = [
  { value: "small_value", label: "Small Value Orders (Direct Purchase)" },
  { value: "routine_consumable", label: "Routine Consumables (Rate Contract)" },
  { value: "equipment_asset", label: "Equipment & Assets / Lab Equipment" },
  { value: "software", label: "Software Licenses & Cloud Subscriptions" },
  { value: "academic_research", label: "Academic & Research Material" },
  { value: "services_amc", label: "Services (AMC / Contractual Agreements)" },
  { value: "maintenance", label: "Maintenance & Repairs" },
];

export default function RaiseRequisition() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [matrixRules, setMatrixRules] = useState<any[]>([]);
  // Section B: the department's budget heads for this financial year, with live balances
  const [availableBudgetHeads, setAvailableBudgetHeads] = useState<any[]>([]);
  const [budgetJustification, setBudgetJustification] = useState("");
  const [reappropriationRef, setReappropriationRef] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<any | null>(null);

  // Form State
  const [departmentId, setDepartmentId] = useState<string>("");
  const [category, setCategory] = useState<string>("routine_consumable");
  const [scope, setScope] = useState<"academic" | "operational">("operational");
  const [isEmergency, setIsEmergency] = useState<boolean>(false);
  // Shared emergency counter (register + emergency PRs), shown when Emergency is ticked
  const [emergencyRemaining, setEmergencyRemaining] = useState<number | null>(null);
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurringFrequency, setRecurringFrequency] = useState<string>("");
  const [justification, setJustification] = useState<string>("");
  const [marketSurveyNotes, setMarketSurveyNotes] = useState<string>("");

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: "1",
      description: "",
      unit: "pcs",
      qty_required: 1,
      qty_in_stock: 0,
      est_unit_price: 1500,
      item_group: "",
    },
  ]);

  const { departmentId: userDeptId } = useAuth();

  // Load initial data (departments, matrix rules)
  useEffect(() => {
    async function loadData() {
      const { data: depts } = await supabase.from("departments").select("id, name").order("name");
      if (depts && depts.length > 0) {
        setDepartments(depts);
        // Default to the logged-in user's assigned department if present, else first department
        setDepartmentId((prev) => {
          if (userDeptId && depts.some((d) => d.id === userDeptId)) {
            return userDeptId;
          }
          return prev || depts[0].id;
        });
      }

      const { data: rules } = await supabase
        .from("approval_matrix_rules")
        .select("*")
        .eq("active", true);
      if (rules) {
        setMatrixRules(rules);
      }
    }
    loadData();
  }, [userDeptId]);

  // Keep departmentId synced if userDeptId loads after initial fetch
  useEffect(() => {
    if (userDeptId && departments.some((d) => d.id === userDeptId)) {
      setDepartmentId(userDeptId);
    }
  }, [userDeptId, departments]);

  // Load the department's budget heads (current financial year)
  useEffect(() => {
    if (!departmentId) return;
    // The department changes on load (first department, then the user's own): ignore the
    // reply for a department that is no longer selected.
    let current = true;
    setAvailableBudgetHeads([]);
    (listPrBudgetHeads as any)({ data: { department_id: departmentId } }).then((res: any) => {
      if (current) setAvailableBudgetHeads(res?.ok ? res.heads : []);
    });
    return () => {
      current = false;
    };
  }, [departmentId]);

  // One head per category: the category decides it (the server picks the same one)
  const selectedBudgetHeadObj = availableBudgetHeads.find(
    (h) => h.category === normalizeCategory(category),
  );
  // The department budgets this year but not for this category: the PR can't be raised.
  // Emergency PRs are kept out of department budgets (DECISIONS Q16).
  const noHeadForCategory =
    !isEmergency && availableBudgetHeads.length > 0 && !selectedBudgetHeadObj;

  // Compute item totals and estimated total value
  const computedItems = useMemo(() => {
    return lineItems.map((item) => {
      const netQty = Math.max(0, Number(item.qty_required || 0) - Number(item.qty_in_stock || 0));
      const lineTotal = netQty * Number(item.est_unit_price || 0);
      return {
        ...item,
        net_qty: netQty,
        line_total: lineTotal,
      };
    });
  }, [lineItems]);

  const totalEstimatedValue = useMemo(() => {
    return computedItems.reduce((sum, item) => sum + item.line_total, 0);
  }, [computedItems]);

  const isBudgetOverdraft =
    !isEmergency &&
    !!selectedBudgetHeadObj &&
    isOverBudget(selectedBudgetHeadObj.balance, totalEstimatedValue);

  useEffect(() => {
    if (!isEmergency) return;
    (checkAnnualCap as any)({ data: {} })
      .then((res: any) => setEmergencyRemaining(Number(res?.remaining ?? 0)))
      .catch(() => setEmergencyRemaining(null));
  }, [isEmergency]);

  const [monthlySpendContext, setMonthlySpendContext] = useState<{
    departmentSpend: number;
    institutionSpend: number;
  }>({ departmentSpend: 0, institutionSpend: 0 });

  useEffect(() => {
    let cancelled = false;
    fetchMonthlySpendBreakdown(supabase, category, departmentId).then((spend) => {
      if (!cancelled) setMonthlySpendContext(spend);
    });
    return () => {
      cancelled = true;
    };
  }, [departmentId, category]);

  // Real-time Authority Matrix Resolver preview
  const liveRouting = useMemo(() => {
    return resolveApprover(category, totalEstimatedValue, monthlySpendContext, matrixRules);
  }, [category, totalEstimatedValue, monthlySpendContext, matrixRules]);

  const [matrixModalOpen, setMatrixModalOpen] = useState(false);

  // Match current active tier in AUTHORITY_MATRIX_DEFINITIONS
  const activeTierId = useMemo(() => {
    const normCat = normalizeCategory(category);
    if (liveRouting.escalate) {
      return "evp_escalation";
    }
    if (normCat === "small_value") {
      if (liveRouting.role === "hod") return "small_value_hod";
      if (liveRouting.role === "principal") return "small_value_principal";
      if (liveRouting.role === "procurement_officer") return "small_value_po";
      return "small_value_hod";
    }
    if (normCat === "routine_consumable") {
      return "routine_consumables";
    }
    if (
      ["equipment_asset", "software", "academic_research", "services_amc", "maintenance"].includes(
        normCat,
      )
    ) {
      return "equipment_assets_services";
    }
    return null;
  }, [category, liveRouting]);

  const handleAddItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        description: "",
        unit: "pcs",
        qty_required: 1,
        qty_in_stock: 0,
        est_unit_price: 1000,
        item_group: "",
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (lineItems.length === 1) {
      toast({
        title: "At least one item required",
        description: "You cannot remove all line items.",
        variant: "destructive",
      });
      return;
    }
    setLineItems((prev) => prev.filter((i) => i.id !== id));
  };

  const [rcCover, setRcCover] = useState<
    Record<string, { contract_number: string; valid_to: string }>
  >({});
  const groupsKey = lineItems.map((i) => i.item_group).join(",");
  useEffect(() => {
    const groups = lineItems.map((i) => i.item_group).filter(Boolean);
    if (groups.length === 0) return setRcCover({});
    let cancelled = false;
    rateContractCoverage({ data: { groups } })
      .then((r: any) => !cancelled && setRcCover(r?.cover ?? {}))
      .catch(() => !cancelled && setRcCover({}));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsKey]);
  const coveredGroups = Object.entries(rcCover);
  useEffect(() => {
    if (coveredGroups.length > 0 && normalizeCategory(category) === "small_value") {
      setCategory("routine_consumable");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coveredGroups.length, category]);

  const handleItemChange = (id: string, field: keyof LineItem, val: any) => {
    setLineItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: val } : i)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentId) {
      toast({ title: "Please select a department", variant: "destructive" });
      return;
    }
    if (!justification.trim()) {
      toast({ title: "Please provide a justification", variant: "destructive" });
      return;
    }
    if (isRecurring && (!recurringFrequency || !recurringFrequency.trim())) {
      toast({
        title: "Recurring Frequency Required",
        description:
          "Please specify the frequency (e.g. Monthly, Quarterly) for this recurring requisition.",
        variant: "destructive",
      });
      return;
    }
    const validItems = lineItems.filter((i) => i.description.trim().length > 0);
    const ungrouped = validItems.find((i) => !i.item_group);
    if (ungrouped) {
      toast({
        title: "Choose an item group",
        description: `Select the item group for "${ungrouped.description}".`,
        variant: "destructive",
      });
      return;
    }
    if (validItems.length === 0) {
      toast({
        title: "Please provide at least one valid line item description",
        variant: "destructive",
      });
      return;
    }
    if (noHeadForCategory) {
      toast({
        title: "No budget for this category",
        description:
          "Your department has no budget for this category this financial year. Ask your HOD to add it in Annual Budgets.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createPr({
        data: {
          department_id: departmentId,
          category: normalizeCategory(category),
          scope,
          budget_justification: isBudgetOverdraft ? budgetJustification.trim() || null : null,
          reappropriation_ref: isBudgetOverdraft ? reappropriationRef.trim() || null : null,
          estimated_value: totalEstimatedValue,
          is_recurring: isRecurring,
          recurring_frequency: isRecurring ? recurringFrequency : null,
          is_emergency: isEmergency,
          justification: justification.trim(),
          market_survey_notes: marketSurveyNotes.trim() || null,
          line_items: validItems.map((i) => ({
            description: i.description,
            unit: i.unit,
            qty_required: Number(i.qty_required),
            qty_in_stock: Number(i.qty_in_stock),
            est_unit_price: Number(i.est_unit_price),
            item_group: i.item_group,
          })),
        },
      });

      if (!res.ok) {
        toast({
          title: "Failed to create requisition",
          description: (res as any).error || "Server error",
          variant: "destructive",
        });
        return;
      }

      setCreatedResult(res);

      toast({
        title: "Requisition Raised Successfully!",
        description: `PR Number: ${res.pr.pr_number} routed to ${res.routing.role.toUpperCase()}`,
      });
    } catch (err: any) {
      console.error("Submission failed", err);
      toast({
        title: "Requisition failed",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> Procurement Compliance
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Raise Purchase Requisition (PR)
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Create structured indent requests with server-enforced Authority Matrix routing and
              instant approval preview.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate({ to: "/procurement/vendors" })}>
              Vendor Management <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>

        {/* Success Confirmation Modal / Banner */}
        {createdResult && (
          <Card className="border-2 border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <CardTitle className="text-xl text-emerald-900 dark:text-emerald-100">
                    Requisition Submitted: {createdResult.pr.pr_number}
                  </CardTitle>
                  <CardDescription className="text-emerald-700 dark:text-emerald-300">
                    Authority Matrix engine successfully evaluated and routed this purchase request.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-emerald-900 dark:text-emerald-100">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-white/80 dark:bg-slate-900/80 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div>
                  <span className="text-xs uppercase text-slate-500 font-semibold">
                    Assigned Approver
                  </span>
                  <p className="font-bold text-base text-slate-800 dark:text-slate-100 capitalize">
                    {createdResult.routing.role.replace(/_/g, " ")}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-500 font-semibold">
                    Routing Status
                  </span>
                  <p className="font-bold text-base text-slate-800 dark:text-slate-100">
                    {createdResult.routing.escalate
                      ? "🚨 Escalated to EVP"
                      : "✓ Normal Authority Band"}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-500 font-semibold">
                    Min. Quotations
                  </span>
                  <p className="font-bold text-base text-slate-800 dark:text-slate-100">
                    {createdResult.routing.minQuotations} Quotes Required
                  </p>
                </div>
              </div>
              <p className="italic text-xs text-emerald-800 dark:text-emerald-200">
                <strong>Routing Reason:</strong> {createdResult.routing.reason}
              </p>
              <div className="pt-2 flex gap-3">
                <Button size="sm" onClick={() => setCreatedResult(null)}>
                  Raise Another PR
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Requisition Form */}
          <div className="lg:col-span-2 space-y-6">
            <form noValidate onSubmit={handleSubmit} className="space-y-6">
              {/* Section 1: Classification & Scope */}
              <Card className="shadow-sm border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" /> 1. Requisition Metadata
                  </CardTitle>
                  <CardDescription>
                    Department indent details and classification category.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="department">Requesting Department *</Label>
                    <Select value={departmentId} onValueChange={setDepartmentId}>
                      <SelectTrigger id="department">
                        <SelectValue placeholder="Select department" />
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

                  <div className="space-y-2">
                    <Label htmlFor="category">Procurement Category *</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select procurement category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem
                            key={c.value}
                            value={c.value}
                            disabled={c.value === "small_value" && coveredGroups.length > 0}
                          >
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {coveredGroups.length > 0 && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        Small Value is unavailable:{" "}
                        {coveredGroups
                          .map(([g, rc]) => `${itemGroupLabel(g)} (${rc.contract_number})`)
                          .join(", ")}{" "}
                        {coveredGroups.length === 1 ? "is" : "are"} under an active rate contract,
                        which must be used for these items.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scope">Procurement Scope *</Label>
                    <Select value={scope} onValueChange={(v: any) => setScope(v)}>
                      <SelectTrigger id="scope">
                        <SelectValue placeholder="Scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="operational">Operational / Administrative</SelectItem>
                        <SelectItem value="academic">Academic / Teaching & Research</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label className="font-semibold text-xs flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-emerald-600" /> Budget head (Section B)
                    </Label>

                    {isEmergency ? (
                      <p className="text-xs rounded-lg border p-2.5 bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-200">
                        Emergency purchase: not charged to the department budget. It counts against
                        the ₹10,00,000 annual emergency limit instead.
                      </p>
                    ) : selectedBudgetHeadObj ? (
                      <p className="text-xs rounded-lg border p-2.5 bg-white dark:bg-slate-900">
                        <span className="font-mono font-semibold">
                          {selectedBudgetHeadObj.code}
                        </span>
                        <span className="text-muted-foreground"> · chosen from the category</span>
                      </p>
                    ) : noHeadForCategory ? (
                      <p className="text-xs rounded-lg border p-2.5 bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-900 text-red-900 dark:text-red-200">
                        Your department has no budget for this category this financial year. Ask
                        your HOD to add it in Annual Budgets.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-2.5">
                        {departmentId
                          ? "No budget has been set for this department this year, so no budget check applies."
                          : "Choose the department to see its budget heads."}
                      </p>
                    )}

                    {!isEmergency && selectedBudgetHeadObj && (
                      <div
                        className={`p-2.5 rounded-lg border text-xs space-y-2 ${
                          isBudgetOverdraft
                            ? "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-900 text-red-900 dark:text-red-200"
                            : "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-200"
                        }`}
                      >
                        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                          {[
                            ["Approved budget", selectedBudgetHeadObj.allocated],
                            ["Spent this year", selectedBudgetHeadObj.spent],
                            ["Committed", selectedBudgetHeadObj.committed],
                            ["Balance available", selectedBudgetHeadObj.balance],
                          ].map(([label, value]) => (
                            <div key={label as string}>
                              <dt className="font-sans text-[10px] opacity-80">{label}</dt>
                              <dd className="font-bold">₹{Number(value).toLocaleString("en-IN")}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="font-semibold">
                          Is budget available?{" "}
                          {isBudgetOverdraft
                            ? `No — this requisition (₹${totalEstimatedValue.toLocaleString("en-IN")}) is over the balance, so the EVP must approve it.`
                            : "Yes"}
                        </p>
                        {isBudgetOverdraft && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1 sm:col-span-2">
                              <Label className="text-[11px]">Justification for spending over budget</Label>
                              <Textarea
                                rows={2}
                                value={budgetJustification}
                                onChange={(e) => setBudgetJustification(e.target.value)}
                                className="bg-white dark:bg-slate-900"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Re-appropriation reference (if any)</Label>
                              <Input
                                value={reappropriationRef}
                                onChange={(e) => setReappropriationRef(e.target.value)}
                                placeholder="e.g. FIN/REAPP/2026/014"
                                className="bg-white dark:bg-slate-900"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Section 2: Line Items */}
              <Card className="shadow-sm border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Layers className="w-5 h-5 text-indigo-600" /> 2. PR Line Items
                    </CardTitle>
                    <CardDescription>
                      Specify required items. Net quantities to procure and line estimates calculate
                      automatically.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddItem}
                    className="gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Add Item
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {lineItems.map((item, idx) => {
                    const net = Math.max(
                      0,
                      Number(item.qty_required || 0) - Number(item.qty_in_stock || 0),
                    );
                    const subtotal = net * Number(item.est_unit_price || 0);

                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                            Item #{idx + 1}
                          </span>
                          {lineItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                          <div className="md:col-span-6 space-y-1">
                            <Label className="text-xs">Item group *</Label>
                            <Select
                              value={item.item_group}
                              onValueChange={(v) => handleItemChange(item.id, "item_group", v)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="What kind of item is this?" />
                              </SelectTrigger>
                              <SelectContent>
                                {ITEM_GROUPS.map((g) => (
                                  <SelectItem key={g.id} value={g.id}>
                                    {g.label}{" "}
                                    <span className="text-muted-foreground">— {g.examples}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {rcCover[item.item_group] && (
                              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                                Covered by rate contract {rcCover[item.item_group].contract_number}{" "}
                                (valid to {rcCover[item.item_group].valid_to}).
                              </p>
                            )}
                          </div>
                          <div className="md:col-span-3 space-y-1">
                            <Label className="text-xs">Description *</Label>
                            <Input
                              placeholder="Item specification & model"
                              value={item.description}
                              onChange={(e) =>
                                handleItemChange(item.id, "description", e.target.value)
                              }
                              required
                            />
                          </div>
                          <div className="md:col-span-1 space-y-1">
                            <Label className="text-xs">Unit</Label>
                            <Input
                              placeholder="pcs/kg/box"
                              value={item.unit}
                              onChange={(e) => handleItemChange(item.id, "unit", e.target.value)}
                            />
                          </div>
                          <div className="md:col-span-1 space-y-1">
                            <Label className="text-xs">Qty Req.</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.qty_required}
                              onChange={(e) =>
                                handleItemChange(
                                  item.id,
                                  "qty_required",
                                  Math.max(1, parseInt(e.target.value) || 0),
                                )
                              }
                            />
                          </div>
                          <div className="md:col-span-1 space-y-1">
                            <Label className="text-xs">In Stock</Label>
                            <Input
                              type="number"
                              min="0"
                              value={item.qty_in_stock}
                              onChange={(e) =>
                                handleItemChange(
                                  item.id,
                                  "qty_in_stock",
                                  Math.max(0, parseInt(e.target.value) || 0),
                                )
                              }
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-slate-200 dark:border-slate-800 items-center">
                          <div className="space-y-1">
                            <Label className="text-xs">Est. Unit Price (₹)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.est_unit_price}
                              onChange={(e) =>
                                handleItemChange(
                                  item.id,
                                  "est_unit_price",
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                            />
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            Net to Procure:{" "}
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {net} {item.unit}
                            </span>
                          </div>
                          <div className="text-right text-sm">
                            Line Total:{" "}
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              ₹{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        {/* Value-for-Money Historical Rate Benchmarking Widget */}
                        <RateBenchmarkingWidget
                          description={item.description}
                          unitRate={Number(item.est_unit_price || 0)}
                          onApplyJustification={(text) =>
                            setMarketSurveyNotes((prev) => (prev ? `${prev}\n${text}` : text))
                          }
                        />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Section 3: Justification & Flags */}
              <Card className="shadow-sm border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">
                    3. Justification & Pre-Indent Due Diligence
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="justification">Procurement Necessity & Justification *</Label>
                    <Textarea
                      id="justification"
                      rows={3}
                      placeholder="Explain why this procurement is necessary, proposed use, and urgency..."
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="marketSurvey">Pre-indent Market Survey Notes (Optional)</Label>
                    <Textarea
                      id="marketSurvey"
                      rows={2}
                      placeholder="Brief notes on prevailing market rates, potential vendors contacted..."
                      value={marketSurveyNotes}
                      onChange={(e) => setMarketSurveyNotes(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
                      <input
                        type="checkbox"
                        id="isEmergency"
                        checked={isEmergency}
                        onChange={(e) => setIsEmergency(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                      />
                      <div>
                        <Label
                          htmlFor="isEmergency"
                          className="font-semibold text-amber-900 dark:text-amber-200 cursor-pointer"
                        >
                          Emergency Procurement
                        </Label>
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Subject to ₹10,00,000 annual institutional cap and post-facto audit.
                          {isEmergency && emergencyRemaining !== null && (
                            <span className="block mt-1 font-semibold">
                              ₹{emergencyRemaining.toLocaleString("en-IN")} left this financial year
                              (emergency register and emergency PRs together).
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                      <input
                        type="checkbox"
                        id="isRecurring"
                        checked={isRecurring}
                        onChange={(e) => {
                          setIsRecurring(e.target.checked);
                          if (!e.target.checked) setRecurringFrequency("");
                        }}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="space-y-1.5 flex-1">
                        <Label
                          htmlFor="isRecurring"
                          className="font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          Recurring Requirement
                        </Label>
                        {isRecurring && (
                          <div className="space-y-2 mt-1.5">
                            <Select
                              value={
                                [
                                  "Monthly",
                                  "Bi-Monthly",
                                  "Quarterly",
                                  "Half-Yearly",
                                  "Annually",
                                ].includes(recurringFrequency)
                                  ? recurringFrequency
                                  : recurringFrequency
                                    ? "Custom"
                                    : ""
                              }
                              onValueChange={(val) => {
                                if (val === "Custom") {
                                  setRecurringFrequency("");
                                } else {
                                  setRecurringFrequency(val);
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-800">
                                <SelectValue placeholder="Select frequency (Required) *" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Monthly">Monthly (12x / year)</SelectItem>
                                <SelectItem value="Bi-Monthly">
                                  Bi-Monthly (Every 2 months)
                                </SelectItem>
                                <SelectItem value="Quarterly">
                                  Quarterly (Every 3 months)
                                </SelectItem>
                                <SelectItem value="Half-Yearly">
                                  Half-Yearly (Every 6 months)
                                </SelectItem>
                                <SelectItem value="Annually">Annually (Once a year)</SelectItem>
                                <SelectItem value="Custom">Custom frequency...</SelectItem>
                              </SelectContent>
                            </Select>
                            {(![
                              "Monthly",
                              "Bi-Monthly",
                              "Quarterly",
                              "Half-Yearly",
                              "Annually",
                            ].includes(recurringFrequency) ||
                              recurringFrequency === "") && (
                              <Input
                                placeholder="Enter custom frequency (e.g. Every 45 days) *"
                                value={recurringFrequency}
                                onChange={(e) => setRecurringFrequency(e.target.value)}
                                className="h-8 text-xs bg-white dark:bg-slate-800"
                                required
                              />
                            )}
                            <p className="text-[11px] text-blue-600 dark:text-blue-400">
                              💡 Routine recurring items can be bought through a 6-month rate
                              contract with Procurement.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting || noHeadForCategory}
                className="w-full text-base font-semibold shadow-md"
              >
                {isSubmitting
                  ? "Validating & Submitting PR..."
                  : `Submit Purchase Requisition (₹${totalEstimatedValue.toLocaleString("en-IN")})`}
              </Button>
            </form>
          </div>

          {/* Sidebar: Live Authority Matrix Engine Inspector */}
          <div className="space-y-6">
            <Card className="sticky top-24 border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-50/50 via-white to-slate-50 dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-900 shadow-md">
              <CardHeader className="pb-3 border-b border-indigo-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" /> Approval Routing
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold uppercase">
                      Live Engine
                    </span>
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                </div>
                <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Authority Matrix Live Routing
                </CardTitle>
                <CardDescription className="text-xs">
                  Server-enforced decision logic based on Institutional Authority Matrix.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4 text-sm">
                {/* Total Value */}
                <div className="p-3 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <IndianRupee className="w-4 h-4 text-slate-500" />
                    <span className="font-medium text-xs">Requisition Value:</span>
                  </div>
                  <span className="text-lg font-black text-slate-900 dark:text-slate-100">
                    ₹{totalEstimatedValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Level-Aware Monthly Spend Tracker (SOP §6) */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-indigo-500" />
                      Up-to-Date Spend ({liveRouting.appliedScope === "department" ? "Departmental" : "Institutional"})
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 font-semibold ${
                        liveRouting.appliedScope === "department"
                          ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300"
                          : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300"
                      }`}
                    >
                      {liveRouting.appliedScope === "department" ? "Per Department" : "Institution-Wide"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Dept MTD Spend:</span>
                      <strong className="text-slate-800 dark:text-slate-200 font-mono">
                        ₹{monthlySpendContext.departmentSpend.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Inst MTD Spend:</span>
                      <strong className="text-slate-800 dark:text-slate-200 font-mono">
                        ₹{monthlySpendContext.institutionSpend.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Resolved Role Display */}
                <div
                  className={`p-4 rounded-xl text-white shadow-sm space-y-1 ${
                    liveRouting.escalate
                      ? "bg-gradient-to-br from-amber-600 to-rose-700"
                      : "bg-gradient-to-br from-indigo-600 to-blue-700"
                  }`}
                >
                  <span className="text-xs uppercase text-indigo-100 font-semibold tracking-wider">
                    Target Approval Authority
                  </span>
                  <div className="text-2xl font-black tracking-tight">
                    {liveRouting.role === "hod"
                      ? `${departments.find((d) => d.id === departmentId)?.name || "Department"} HOD`
                      : formatRoleTitle(liveRouting.role)}
                  </div>
                  <div className="text-xs text-white/90">
                    {liveRouting.escalate ? (
                      <span className="inline-flex items-center gap-1 font-bold text-amber-200">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-300" /> Escalated to EVP /
                        Trustees (Exceeds Delegated Band)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-200">
                        <Check className="w-3.5 h-3.5" /> Within standard delegated approval band
                      </span>
                    )}
                  </div>
                </div>

                {/* Quotations & Procurement Method */}
                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">
                      Procurement Method:
                    </span>
                    <strong
                      className="text-slate-900 dark:text-slate-100 text-right max-w-[200px] truncate"
                      title={
                        normalizeCategory(category) === "routine_consumable"
                          ? "Rate Contract with Vendors approved by EVP/Trustees (Min 3 quotes, 6 mo validity)"
                          : normalizeCategory(category) === "small_value"
                            ? "Direct Purchase"
                            : "Comparative Quotations with Approved Vendors (Minimum 3)"
                      }
                    >
                      {normalizeCategory(category) === "routine_consumable"
                        ? "Rate Contract (6-mo validity)"
                        : normalizeCategory(category) === "small_value"
                          ? "Direct Purchase"
                          : "Comparative Quotations (Min 3)"}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">
                      Min. Quotations:
                    </span>
                    <strong className="text-slate-900 dark:text-slate-100 font-bold">
                      {liveRouting.minQuotations > 0
                        ? `${liveRouting.minQuotations} Quotes`
                        : "0 (Direct Purchase)"}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">
                      Rate Contract Required:
                    </span>
                    <Badge
                      variant={liveRouting.requiresRateContract ? "default" : "outline"}
                      className="text-[10px] h-5"
                    >
                      {liveRouting.requiresRateContract ? "Yes (6 Mo Validity)" : "No"}
                    </Badge>
                  </div>
                </div>

                {/* Authority Rule Explanation */}
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-950 dark:text-amber-100">
                    <FileCheck2 className="w-3.5 h-3.5 text-amber-600" />
                    <span>Authority Rule Engine:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                    {liveRouting.reason}
                  </p>
                </div>

                {/* VI. AUTHORITY MATRIX - LIVE TIERS & APPROVED LIMITS */}
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <TableProperties className="w-3.5 h-3.5 text-indigo-600" />
                      VI. Authority Matrix Tiers
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setMatrixModalOpen(true)}
                      className="h-6 px-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
                    >
                      Full Matrix View <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    {AUTHORITY_MATRIX_DEFINITIONS.map((tier) => {
                      const isActive = activeTierId === tier.id;
                      return (
                        <div
                          key={tier.id}
                          className={`p-2 rounded-lg border transition-all ${
                            isActive
                              ? "bg-indigo-50/90 dark:bg-indigo-950/50 border-indigo-400 dark:border-indigo-600 ring-1 ring-indigo-400 shadow-sm"
                              : "bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-75 hover:opacity-100"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                              {tier.procurementType}
                            </span>
                            {isActive ? (
                              <Badge className="bg-indigo-600 text-white text-[9px] px-1.5 py-0 h-4 font-bold shrink-0">
                                ACTIVE
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 h-4 text-slate-500 shrink-0"
                              >
                                {tier.approvalAuthority}
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-600 dark:text-slate-400 pt-0.5">
                            <div>
                              <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                                Limit / Txn
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-200">
                                {tier.txnLimitFormatted}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                                Limit / Month
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-200">
                                {tier.monthLimitFormatted}
                              </span>
                            </div>
                          </div>

                          <div className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px]">
                            <span className="text-slate-500 truncate">
                              {tier.procurementMethod}
                            </span>
                            <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0 ml-1">
                              &rarr; {tier.approvalAuthority}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Full Authority Matrix Modal (Exact Representation of Image 0) */}
        <Dialog open={matrixModalOpen} onOpenChange={setMatrixModalOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <DialogTitle className="text-xl font-extrabold flex items-center gap-2 text-slate-900 dark:text-white">
                    <TableProperties className="w-5 h-5 text-indigo-600" />
                    VI. AUTHORITY MATRIX
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-1">
                    Financial approval limits, procurement methods, and approving authorities for
                    each category.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="py-2">
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3 border-r border-slate-200 dark:border-slate-800">
                        Procurement Type
                      </th>
                      <th className="p-3 border-r border-slate-200 dark:border-slate-800">
                        Procurement Method
                      </th>
                      <th className="p-3 border-r border-slate-200 dark:border-slate-800">
                        Limit (Per Transaction)
                      </th>
                      <th className="p-3 border-r border-slate-200 dark:border-slate-800">
                        Limit (Per Month)
                      </th>
                      <th className="p-3 border-r border-slate-200 dark:border-slate-800">
                        Spend Scope (SOP §6)
                      </th>
                      <th className="p-3">Approval Authority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {/* Row 1 */}
                    <tr
                      className={
                        activeTierId === "small_value_hod"
                          ? "bg-indigo-50/70 dark:bg-indigo-950/40 font-semibold"
                          : ""
                      }
                    >
                      <td className="p-3 font-medium border-r border-slate-200 dark:border-slate-800">
                        Small Value Orders
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800">
                        Direct Purchase
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-mono">
                        Up to ₹2,000
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-mono">
                        Up to ₹5,000
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800">
                        <span className="font-semibold text-blue-600 dark:text-blue-400 block">Per Department</span>
                        <span className="text-[10px] text-slate-500 font-mono">Dept MTD: ₹{monthlySpendContext.departmentSpend.toLocaleString("en-IN")}</span>
                      </td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        HOD
                        {activeTierId === "small_value_hod" && (
                          <Badge className="ml-2 bg-indigo-600 text-white text-[10px]">
                            ACTIVE
                          </Badge>
                        )}
                      </td>
                    </tr>
                    {/* Row 2 */}
                    <tr
                      className={
                        activeTierId === "small_value_principal"
                          ? "bg-indigo-50/70 dark:bg-indigo-950/40 font-semibold"
                          : ""
                      }
                    >
                      <td className="p-3 font-medium border-r border-slate-200 dark:border-slate-800">
                        Small Value Orders
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800">
                        Direct Purchase
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-mono">
                        Up to ₹5,000
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-mono">
                        Up to ₹30,000
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800">
                        <span className="font-semibold text-purple-600 dark:text-purple-400 block">Institution-Wide</span>
                        <span className="text-[10px] text-slate-500 font-mono">Inst MTD: ₹{monthlySpendContext.institutionSpend.toLocaleString("en-IN")}</span>
                      </td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        Principals
                        {activeTierId === "small_value_principal" && (
                          <Badge className="ml-2 bg-indigo-600 text-white text-[10px]">
                            ACTIVE
                          </Badge>
                        )}
                      </td>
                    </tr>
                    {/* Row 3 */}
                    <tr
                      className={
                        activeTierId === "small_value_po"
                          ? "bg-indigo-50/70 dark:bg-indigo-950/40 font-semibold"
                          : ""
                      }
                    >
                      <td className="p-3 font-medium border-r border-slate-200 dark:border-slate-800">
                        Small Value Orders
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800">
                        Direct Purchase
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-mono">
                        Up to ₹5,000
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-mono">
                        Up to ₹30,000
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800">
                        <span className="font-semibold text-purple-600 dark:text-purple-400 block">Institution-Wide</span>
                        <span className="text-[10px] text-slate-500 font-mono">Inst MTD: ₹{monthlySpendContext.institutionSpend.toLocaleString("en-IN")}</span>
                      </td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        Procurement Officer
                        {activeTierId === "small_value_po" && (
                          <Badge className="ml-2 bg-indigo-600 text-white text-[10px]">
                            ACTIVE
                          </Badge>
                        )}
                      </td>
                    </tr>
                    {/* Row 4 */}
                    <tr
                      className={
                        activeTierId === "routine_consumables"
                          ? "bg-indigo-50/70 dark:bg-indigo-950/40 font-semibold"
                          : ""
                      }
                    >
                      <td className="p-3 font-medium border-r border-slate-200 dark:border-slate-800">
                        Routine Consumables
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 text-[11px]">
                        Rate Contract with Vendors approved by EVP/Trustees
                        <br />
                        <span className="text-slate-500 dark:text-slate-400">
                          (Minimum 3 quotations at the time of rate finalisation){" "}
                          <strong>Validity: 6 months</strong>
                        </span>
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 italic">
                        As per approved rate contract
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-mono">
                        Up to ₹1,00,000
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800">
                        <span className="font-semibold text-purple-600 dark:text-purple-400 block">Institution-Wide</span>
                        <span className="text-[10px] text-slate-500 font-mono">Inst MTD: ₹{monthlySpendContext.institutionSpend.toLocaleString("en-IN")}</span>
                      </td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        Procurement Officer
                        {activeTierId === "routine_consumables" && (
                          <Badge className="ml-2 bg-indigo-600 text-white text-[10px]">
                            ACTIVE
                          </Badge>
                        )}
                      </td>
                    </tr>
                    {/* Row 5 */}
                    <tr
                      className={
                        activeTierId === "equipment_assets_services"
                          ? "bg-indigo-50/70 dark:bg-indigo-950/40 font-semibold"
                          : ""
                      }
                    >
                      <td className="p-3 font-medium border-r border-slate-200 dark:border-slate-800">
                        Equipment &amp; Assets / Software Licenses Academic &amp; Research
                        <br />
                        <span className="text-slate-500">
                          Services (e.g., AMC, Contractual agreements)
                        </span>
                        <br />
                        <span className="text-slate-500">Maintenance &amp; Repairs</span>
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 text-[11px]">
                        Comparative Quotations with Approved Vendors <strong>(Minimum 3)</strong>
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-mono">
                        Up to ₹10,000
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-mono">
                        Up to ₹50,000
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800">
                        <span className="font-semibold text-purple-600 dark:text-purple-400 block">Institution-Wide</span>
                        <span className="text-[10px] text-slate-500 font-mono">Inst MTD: ₹{monthlySpendContext.institutionSpend.toLocaleString("en-IN")}</span>
                      </td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        Purchase Committee
                        {activeTierId === "equipment_assets_services" && (
                          <Badge className="ml-2 bg-indigo-600 text-white text-[10px]">
                            ACTIVE
                          </Badge>
                        )}
                      </td>
                    </tr>
                    {/* Escalation Row */}
                    <tr
                      className={
                        activeTierId === "evp_escalation"
                          ? "bg-amber-50/80 dark:bg-amber-950/50 font-semibold"
                          : "bg-slate-50/50 dark:bg-slate-900/40"
                      }
                    >
                      <td className="p-3 font-medium border-r border-slate-200 dark:border-slate-800 text-amber-900 dark:text-amber-200">
                        High Value / Above Limits / Unscheduled
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 text-[11px] text-amber-800 dark:text-amber-300">
                        Executive Sanction / Board of Trustees Formal Approval
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-mono text-amber-900 dark:text-amber-200">
                        &gt; ₹10,000 (Assets/Services) / &gt; ₹1,00,000 (Consumables)
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-mono text-amber-900 dark:text-amber-200">
                        Exceeds Monthly Band Caps
                      </td>
                      <td className="p-3 border-r border-slate-200 dark:border-slate-800 text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                        Global Institutional Ledger
                      </td>
                      <td className="p-3 font-bold text-amber-900 dark:text-amber-200">
                        Executive Vice President (EVP) / Trustees
                        {activeTierId === "evp_escalation" && (
                          <Badge className="ml-2 bg-amber-600 text-white text-[10px]">
                            ACTIVE (ESCALATED)
                          </Badge>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
