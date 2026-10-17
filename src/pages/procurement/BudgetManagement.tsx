import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  listBudgetProposals,
  saveDepartmentProposal,
  consolidateDepartmentBudgets,
  submitConsolidatedToEvp,
  sanctionAnnualBudget,
  listActiveBudgetHeads,
  getBudgetTransactions,
  initializeBaselineBudgetData,
  BUDGET_CATEGORIES,
  type DepartmentBudgetProposal,
  type BudgetHead,
  type BudgetCategoryKey,
  type BudgetLineItem,
} from "@/lib/procurement/budget.functions";
import {
  PieChart,
  Wallet,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
  AlertCircle,
  Plus,
  Trash2,
  Lock,
  Unlock,
  RefreshCw,
  TrendingUp,
  FileCheck2,
  Send,
  Sliders,
} from "lucide-react";

export default function BudgetManagement() {
  const { toast } = useToast();
  const { hasRole, departmentId: userDeptId } = useAuth();
  const isAdmin = hasRole("admin");
  const isFinance = hasRole("finance") || isAdmin;
  const isEvp = hasRole("evp") || hasRole("principal") || isAdmin;
  const isHod = hasRole("hod") || isAdmin;

  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [financialYear, setFinancialYear] = useState<string>("2026-27");
  const [proposals, setProposals] = useState<DepartmentBudgetProposal[]>([]);
  const [budgetHeads, setBudgetHeads] = useState<BudgetHead[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<string>("proposals");

  // HOD Formulation Form State
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [categoryAllocations, setCategoryAllocations] = useState<Record<BudgetCategoryKey, number>>({
    academic_labs: 450000,
    routine_consumables: 350000,
    equipment_asset: 1200000,
    software_cloud: 400000,
    services_amc: 250000,
    maintenance_repairs: 150000,
    library_resources: 100000,
  });
  const [lineItems, setLineItems] = useState<BudgetLineItem[]>([
    {
      id: "item-1",
      category: "equipment_asset",
      description: "Advanced Embedded Systems & IoT Rig Workstations",
      justification: "NBA Tier-1 compliance and 4th-year capstone design laboratory upgrade",
      qty: 8,
      est_unit_cost: 125000,
      total_est: 1000000,
      phasing: { q1: 500000, q2: 500000, q3: 0, q4: 0 },
    },
    {
      id: "item-2",
      category: "routine_consumables",
      description: "Annual Lab Consumable Components & Testing Probes",
      justification: "Semester 1 & 2 electronics lab experiments and maintenance",
      qty: 1,
      est_unit_cost: 250000,
      total_est: 250000,
      phasing: { q1: 100000, q2: 50000, q3: 50000, q4: 50000 },
    },
  ]);
  const [hodRemarks, setHodRemarks] = useState<string>(
    "Proposed based on curriculum lab requirements reviewed by Department Advisory Board.",
  );
  const [savingProposal, setSavingProposal] = useState(false);

  // Consolidation Modal State
  const [consolidationModalOpen, setConsolidationModalOpen] = useState(false);
  const [financeRemarks, setFinanceRemarks] = useState(
    "Consolidated institutional annual budget proposal. Cross-referenced against previous FY utilization and verified capital limits.",
  );

  // Sanction Modal State
  const [sanctionModalOpen, setSanctionModalOpen] = useState(false);
  const [sanctionDecision, setSanctionDecision] = useState<"approved" | "rework">("approved");
  const [sanctionRemarks, setSanctionRemarks] = useState(
    "Formally sanctioned and locked by Executive Vice President & Board of Trustees. Budget heads activated for FY 2026-27.",
  );

  // Proposal Detail Drawer
  const [detailProposal, setDetailProposal] = useState<DepartmentBudgetProposal | null>(null);

  // Load Initial Data
  const loadData = async () => {
    setLoading(true);
    try {
      const { data: depts } = await supabase.from("departments").select("id, name").order("name");
      const deptsList = depts || [];
      setDepartments(deptsList);

      // Seed baseline if empty
      initializeBaselineBudgetData(deptsList);

      const [propRes, headRes] = await Promise.all([
        listBudgetProposals(financialYear),
        listActiveBudgetHeads({ financialYear }),
      ]);

      if (propRes.ok) setProposals(propRes.proposals);
      if (headRes.ok) setBudgetHeads(headRes.budgetHeads);
      setTransactions(getBudgetTransactions());

      // Default selected department
      if (userDeptId && deptsList.some((d) => d.id === userDeptId)) {
        setSelectedDeptId(userDeptId);
      } else if (deptsList.length > 0 && !selectedDeptId) {
        setSelectedDeptId(deptsList[0].id);
      }
    } catch (e: any) {
      toast({ title: "Failed to load budget data", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [financialYear]);

  // When selected department changes, load its proposal if exists
  useEffect(() => {
    if (!selectedDeptId) return;
    const existing = proposals.find(
      (p) => p.department_id === selectedDeptId && p.financial_year === financialYear,
    );
    if (existing) {
      setCategoryAllocations(existing.category_allocations);
      setLineItems(existing.line_items || []);
      setHodRemarks(existing.hod_remarks || "");
    }
  }, [selectedDeptId, proposals, financialYear]);

  // Calculate Subtotals
  const totalAllocations = useMemo(() => {
    return Object.values(categoryAllocations).reduce((sum, val) => sum + Number(val || 0), 0);
  }, [categoryAllocations]);

  const totalLineItems = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + Number(item.total_est || 0), 0);
  }, [lineItems]);

  // Institutional Summary Metrics
  const institutionalMetrics = useMemo(() => {
    const totalProposed = proposals.reduce((sum, p) => sum + Number(p.total_proposed || 0), 0);
    const totalAllocated = budgetHeads.reduce((sum, h) => sum + Number(h.allocated_amount || 0), 0);
    const totalCommitted = budgetHeads.reduce((sum, h) => sum + Number(h.committed_amount || 0), 0);
    const totalSpent = budgetHeads.reduce((sum, h) => sum + Number(h.spent_amount || 0), 0);
    const totalAvailable = totalAllocated - (totalCommitted + totalSpent);
    const sanctionedCount = proposals.filter((p) => p.status === "sanctioned").length;

    return {
      totalProposed,
      totalAllocated,
      totalCommitted,
      totalSpent,
      totalAvailable,
      sanctionedCount,
      totalDepts: departments.length,
    };
  }, [proposals, budgetHeads, departments]);

  // Handle Add Line Item
  const handleAddLineItem = () => {
    const newItem: BudgetLineItem = {
      id: `item-${Date.now()}`,
      category: "academic_labs",
      description: "",
      justification: "",
      qty: 1,
      est_unit_cost: 50000,
      total_est: 50000,
      phasing: { q1: 25000, q2: 25000, q3: 0, q4: 0 },
    };
    setLineItems([...lineItems, newItem]);
  };

  const handleUpdateLineItem = (id: string, field: keyof BudgetLineItem, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === "qty" || field === "est_unit_cost") {
          updated.total_est = Number(updated.qty || 1) * Number(updated.est_unit_cost || 0);
        }
        return updated;
      }),
    );
  };

  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((i) => i.id !== id));
  };

  // Submit or Save HOD Proposal
  const handleSaveProposal = async (status: "draft" | "submitted_to_finance") => {
    if (!selectedDeptId) {
      toast({ title: "Department Required", description: "Select a department.", variant: "destructive" });
      return;
    }
    setSavingProposal(true);
    try {
      const deptName = departments.find((d) => d.id === selectedDeptId)?.name || "Department";
      const res = await saveDepartmentProposal({
        financial_year: financialYear,
        department_id: selectedDeptId,
        department_name: deptName,
        status,
        total_proposed: totalAllocations,
        category_allocations: categoryAllocations,
        line_items: lineItems,
        hod_remarks: hodRemarks,
      });

      if (!res.ok) throw new Error(res.error);

      toast({
        title: status === "draft" ? "Proposal Draft Saved" : "Budget Submitted to Finance",
        description:
          status === "draft"
            ? "Your departmental budget draft has been preserved."
            : `Annual budget estimate of ₹${totalAllocations.toLocaleString("en-IN")} submitted to Finance for institutional consolidation.`,
      });
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingProposal(false);
    }
  };

  // Consolidate & Transmit to EVP
  const handleConsolidateAndSubmit = async () => {
    try {
      const res1 = await consolidateDepartmentBudgets(financialYear, financeRemarks);
      const res2 = await submitConsolidatedToEvp(financialYear, financeRemarks);

      if (!res1.ok || !res2.ok) throw new Error("Consolidation failed");

      toast({
        title: "Consolidated Institutional Budget Submitted",
        description: `Institutional budget package for FY ${financialYear} transmitted to Executive Leadership / Board of Trustees for formal sanction.`,
      });
      setConsolidationModalOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Action Failed", description: e.message, variant: "destructive" });
    }
  };

  // EVP Sanction & Lock
  const handleSanctionAction = async () => {
    try {
      const res = await sanctionAnnualBudget({
        financialYear,
        decision: sanctionDecision,
        remarks: sanctionRemarks,
      });

      if (!res.ok) throw new Error(res.error);

      toast({
        title: sanctionDecision === "approved" ? "Annual Budget Sanctioned & Locked" : "Rework Requested",
        description: res.message,
      });
      setSanctionModalOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Action Failed", description: e.message, variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sanctioned":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"><CheckCircle2 className="w-3 h-3" /> Sanctioned & Locked</Badge>;
      case "submitted_to_evp":
        return <Badge className="bg-indigo-600 text-white gap-1"><Clock className="w-3 h-3" /> Under Trustee / EVP Review</Badge>;
      case "under_consolidation":
        return <Badge className="bg-sky-600 text-white gap-1"><Sliders className="w-3 h-3" /> In Finance Consolidation</Badge>;
      case "submitted_to_finance":
        return <Badge className="bg-amber-600 text-white gap-1"><Send className="w-3 h-3" /> Submitted to Finance</Badge>;
      case "rework_requested":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> Rework Requested</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><FileCheck2 className="w-3 h-3" /> Draft Formulation</Badge>;
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 mb-2">
              <PieChart className="w-3.5 h-3.5 text-emerald-600" /> Annual Budget Formulation & Consolidation
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Departmental Budget Hub & Live Spend Ledger
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              March HOD estimates formulation, April Finance compilation, May Trustee/EVP sanction, and year-round live committed spend deductions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>Fiscal Year:</span>
              <Select value={financialYear} onValueChange={setFinancialYear}>
                <SelectTrigger className="h-7 w-28 text-xs font-bold border-none bg-transparent shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2026-27">FY 2026-27</SelectItem>
                  <SelectItem value="2027-28">FY 2027-28</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* Lifecycle Timeline Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl shadow-md border border-indigo-900/50">
          <div className="flex items-start gap-3 p-2 border-r border-indigo-800/40">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 font-mono text-xs font-bold text-slate-950">1</span>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">March Formulation</span>
              <p className="text-xs text-slate-300 mt-0.5 font-medium">HODs prepare departmental estimates</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2 border-r border-indigo-800/40">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500 font-mono text-xs font-bold text-slate-950">2</span>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">April Consolidation</span>
              <p className="text-xs text-slate-300 mt-0.5 font-medium">Finance compiles institutional proposal</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2 border-r border-indigo-800/40">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500 font-mono text-xs font-bold text-slate-950">3</span>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400">May Sanction</span>
              <p className="text-xs text-slate-300 mt-0.5 font-medium">EVP / Trustees review & lock budget</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 font-mono text-xs font-bold text-slate-950">4</span>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Year-Round Execution</span>
              <p className="text-xs text-slate-300 mt-0.5 font-medium">PR/PO live balance deductions</p>
            </div>
          </div>
        </div>

        {/* High-Level Institutional KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-600 shadow-sm">
            <CardContent className="p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Institutional Proposed</span>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                ₹{institutionalMetrics.totalProposed.toLocaleString("en-IN")}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Across {institutionalMetrics.totalDepts} academic departments</span>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-600 shadow-sm">
            <CardContent className="p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sanctioned & Allocated</span>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                ₹{institutionalMetrics.totalAllocated.toLocaleString("en-IN")}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">{institutionalMetrics.sanctionedCount} sanctioned proposals locked</span>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 shadow-sm">
            <CardContent className="p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Committed PR & PO Spend</span>
              <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                ₹{institutionalMetrics.totalCommitted.toLocaleString("en-IN")}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Encumbered against active requisitions & orders</span>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-indigo-600 shadow-sm">
            <CardContent className="p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Live Balance Available</span>
              <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                ₹{institutionalMetrics.totalAvailable.toLocaleString("en-IN")}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Ready for new departmental purchase requisitions</span>
            </CardContent>
          </Card>
        </div>

        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 h-auto p-1.5 bg-slate-200/70 dark:bg-slate-900 rounded-xl">
            <TabsTrigger value="proposals" className="py-2.5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <Building2 className="w-4 h-4 mr-2 text-blue-600" /> 1. Dept Proposals (HOD)
            </TabsTrigger>
            <TabsTrigger value="consolidation" className="py-2.5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <FileSpreadsheet className="w-4 h-4 mr-2 text-sky-600" /> 2. Finance Consolidation
            </TabsTrigger>
            <TabsTrigger value="sanction" className="py-2.5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <ShieldCheck className="w-4 h-4 mr-2 text-purple-600" /> 3. Executive Sanction
            </TabsTrigger>
            <TabsTrigger value="ledger" className="py-2.5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <Wallet className="w-4 h-4 mr-2 text-emerald-600" /> 4. Live Spend Ledger
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Department Proposals (HOD Formulation) */}
          <TabsContent value="proposals" className="space-y-6">
            <Card className="border border-slate-200 dark:border-slate-800">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-blue-600" /> Annual Departmental Requirements Formulation
                    </CardTitle>
                    <CardDescription>
                      Formulate annual estimates categorized by academic labs, consumables, equipment, AMC, and software for the upcoming fiscal year.
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-semibold whitespace-nowrap">Department:</Label>
                    <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
                      <SelectTrigger className="w-52 h-9 text-xs">
                        <SelectValue placeholder="Select Department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* Category Allocations Grid */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Annual Estimates by Category Allocation
                    </h3>
                    <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                      Total Proposed: ₹{totalAllocations.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {BUDGET_CATEGORIES.map((cat) => (
                      <div key={cat.key} className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">{cat.label}</Label>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{cat.desc}</p>
                        <div className="relative mt-1">
                          <span className="absolute left-2.5 top-2 text-xs font-semibold text-slate-400">₹</span>
                          <Input
                            type="number"
                            className="pl-7 h-8 font-mono font-semibold text-xs"
                            value={categoryAllocations[cat.key] || 0}
                            onChange={(e) =>
                              setCategoryAllocations({
                                ...categoryAllocations,
                                [cat.key]: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Itemized Requirements Table */}
                <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Itemized Requirements & Quarterly Phasing (Q1–Q4)
                      </h3>
                      <p className="text-xs text-slate-500">Break down critical capital equipment, software, and consumables.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleAddLineItem} className="gap-1.5 text-xs">
                      <Plus className="w-3.5 h-3.5" /> Add Item
                    </Button>
                  </div>

                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 dark:bg-slate-900 border-b">
                        <tr>
                          <th className="p-2.5 font-semibold">Description</th>
                          <th className="p-2.5 font-semibold w-40">Category</th>
                          <th className="p-2.5 font-semibold text-center w-16">Qty</th>
                          <th className="p-2.5 font-semibold text-right w-28">Est. Unit (₹)</th>
                          <th className="p-2.5 font-semibold text-right w-32">Total (₹)</th>
                          <th className="p-2.5 font-semibold w-64">Justification</th>
                          <th className="p-2.5 text-center w-12">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {lineItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            <td className="p-2">
                              <Input
                                value={item.description}
                                onChange={(e) => handleUpdateLineItem(item.id, "description", e.target.value)}
                                placeholder="Item / Equipment specification..."
                                className="h-7 text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <Select
                                value={item.category}
                                onValueChange={(val: any) => handleUpdateLineItem(item.id, "category", val)}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {BUDGET_CATEGORIES.map((c) => (
                                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-2 text-center">
                              <Input
                                type="number"
                                value={item.qty}
                                onChange={(e) => handleUpdateLineItem(item.id, "qty", Number(e.target.value))}
                                className="h-7 text-xs text-center font-mono"
                              />
                            </td>
                            <td className="p-2 text-right">
                              <Input
                                type="number"
                                value={item.est_unit_cost}
                                onChange={(e) => handleUpdateLineItem(item.id, "est_unit_cost", Number(e.target.value))}
                                className="h-7 text-xs text-right font-mono"
                              />
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                              ₹{(Number(item.qty || 0) * Number(item.est_unit_cost || 0)).toLocaleString("en-IN")}
                            </td>
                            <td className="p-2">
                              <Input
                                value={item.justification}
                                onChange={(e) => handleUpdateLineItem(item.id, "justification", e.target.value)}
                                placeholder="Academic necessity / lab requirement..."
                                className="h-7 text-xs"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleRemoveLineItem(item.id)}
                                className="h-6 w-6 text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* HOD Remarks & Submission Actions */}
                <div className="space-y-2 pt-2">
                  <Label className="text-xs font-semibold">HOD Governance Notes & Advisory Board Endorsement</Label>
                  <Textarea
                    value={hodRemarks}
                    onChange={(e) => setHodRemarks(e.target.value)}
                    rows={2}
                    placeholder="Enter remarks and statutory references..."
                    className="text-xs"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Status:</span>
                    {getStatusBadge(
                      proposals.find((p) => p.department_id === selectedDeptId)?.status || "draft",
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSaveProposal("draft")}
                      disabled={savingProposal}
                      className="gap-1.5"
                    >
                      Save Draft
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSaveProposal("submitted_to_finance")}
                      disabled={savingProposal}
                      className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" /> Submit to Finance (April Consolidation)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: Finance Consolidation Dashboard */}
          <TabsContent value="consolidation" className="space-y-6">
            <Card className="border border-slate-200 dark:border-slate-800">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-sky-600" /> Finance Consolidation & Review (April)
                    </CardTitle>
                    <CardDescription>
                      Review all departmental annual proposals, verify historical spend benchmarks, and prepare the institutional proposal.
                    </CardDescription>
                  </div>

                  {isFinance && (
                    <Button
                      onClick={() => setConsolidationModalOpen(true)}
                      className="bg-sky-600 hover:bg-sky-700 text-white gap-2 shadow-sm"
                    >
                      <Send className="w-4 h-4" /> Consolidate & Transmit to EVP
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-4">
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 dark:bg-slate-900 border-b">
                      <tr>
                        <th className="p-3 font-semibold">Department</th>
                        <th className="p-3 font-semibold">Status</th>
                        <th className="p-3 font-semibold text-right">Equipment (₹)</th>
                        <th className="p-3 font-semibold text-right">Consumables (₹)</th>
                        <th className="p-3 font-semibold text-right">Software (₹)</th>
                        <th className="p-3 font-semibold text-right">AMC (₹)</th>
                        <th className="p-3 font-semibold text-right">Total Proposed (₹)</th>
                        <th className="p-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {proposals.map((prop) => (
                        <tr key={prop.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                            {prop.department_name}
                          </td>
                          <td className="p-3">{getStatusBadge(prop.status)}</td>
                          <td className="p-3 text-right font-mono">
                            ₹{(prop.category_allocations?.equipment_asset || 0).toLocaleString("en-IN")}
                          </td>
                          <td className="p-3 text-right font-mono">
                            ₹{(prop.category_allocations?.routine_consumables || 0).toLocaleString("en-IN")}
                          </td>
                          <td className="p-3 text-right font-mono">
                            ₹{(prop.category_allocations?.software_cloud || 0).toLocaleString("en-IN")}
                          </td>
                          <td className="p-3 text-right font-mono">
                            ₹{(prop.category_allocations?.services_amc || 0).toLocaleString("en-IN")}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            ₹{prop.total_proposed.toLocaleString("en-IN")}
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDetailProposal(prop)}
                              className="h-7 text-xs"
                            >
                              Inspect Details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: Executive Sanction & Lock (EVP / Board of Trustees) */}
          <TabsContent value="sanction" className="space-y-6">
            <Card className="border border-purple-200 dark:border-purple-900 bg-gradient-to-r from-purple-50/50 via-indigo-50/30 to-blue-50/50 dark:from-purple-950/20 dark:via-indigo-950/20 dark:to-blue-950/20">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2 text-purple-950 dark:text-purple-200">
                      <ShieldCheck className="w-5 h-5 text-purple-600" /> Board of Trustees / Executive Vice President Sanction (May)
                    </CardTitle>
                    <CardDescription>
                      Review consolidated institutional commitments and authorize formal lock of departmental budget heads for the upcoming fiscal year.
                    </CardDescription>
                  </div>

                  {isEvp && (
                    <Button
                      onClick={() => setSanctionModalOpen(true)}
                      className="bg-purple-600 hover:bg-purple-700 text-white gap-2 shadow-sm"
                    >
                      <Lock className="w-4 h-4" /> Sanction & Lock Annual Budget
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-white dark:bg-slate-950 border border-purple-200 dark:border-purple-900/60 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-xs text-slate-500 font-semibold uppercase">Total Institutional Budget Head</span>
                    <p className="text-2xl font-bold font-mono text-purple-900 dark:text-purple-300 mt-1">
                      ₹{institutionalMetrics.totalAllocated.toLocaleString("en-IN")}
                    </p>
                    <span className="text-[11px] text-slate-500">Statutory fiscal ceiling for FY {financialYear}</span>
                  </div>

                  <div>
                    <span className="text-xs text-slate-500 font-semibold uppercase">Governance Status</span>
                    <div className="mt-1">
                      {institutionalMetrics.sanctionedCount > 0 ? (
                        <Badge className="bg-emerald-600 text-white gap-1"><Lock className="w-3 h-3" /> FORMALLY SANCTIONED & LOCKED</Badge>
                      ) : (
                        <Badge className="bg-amber-600 text-white gap-1"><Clock className="w-3 h-3" /> AWAITING SANCTION</Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">Institutional ledger established</span>
                  </div>

                  <div>
                    <span className="text-xs text-slate-500 font-semibold uppercase">Automatic Spend Control</span>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      Active: Each PR automatically verifies <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded font-mono">balance_available</code> before submission.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: Active Budget Heads & Live Spend Ledger */}
          <TabsContent value="ledger" className="space-y-6">
            <Card className="border border-slate-200 dark:border-slate-800">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-emerald-600" /> Active Budget Heads & Dynamic Spend Ledger
                    </CardTitle>
                    <CardDescription>
                      Approved figures establish allocated budget heads where each PR automatically deducts committed spend from balance_available.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 dark:bg-slate-900 border-b">
                      <tr>
                        <th className="p-3 font-semibold">Head Code</th>
                        <th className="p-3 font-semibold">Title & Department</th>
                        <th className="p-3 font-semibold text-right">Allocated (₹)</th>
                        <th className="p-3 font-semibold text-right">Committed (PR/PO) (₹)</th>
                        <th className="p-3 font-semibold text-right">Disbursed (₹)</th>
                        <th className="p-3 font-semibold text-right">Balance Available (₹)</th>
                        <th className="p-3 font-semibold text-center w-36">Utilization</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {budgetHeads.map((head) => {
                        const totalUsed = head.committed_amount + head.spent_amount;
                        const pct = Math.min(100, Math.round((totalUsed / (head.allocated_amount || 1)) * 100));
                        return (
                          <tr key={head.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                              {head.code}
                            </td>
                            <td className="p-3">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 block">{head.title}</span>
                              <span className="text-[10px] text-slate-500">{head.department_name}</span>
                            </td>
                            <td className="p-3 text-right font-mono font-semibold">
                              ₹{head.allocated_amount.toLocaleString("en-IN")}
                            </td>
                            <td className="p-3 text-right font-mono text-amber-600 dark:text-amber-400 font-semibold">
                              ₹{head.committed_amount.toLocaleString("en-IN")}
                            </td>
                            <td className="p-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                              ₹{head.spent_amount.toLocaleString("en-IN")}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                              ₹{head.balance_available.toLocaleString("en-IN")}
                            </td>
                            <td className="p-3 text-center">
                              <div className="space-y-1">
                                <Progress value={pct} className="h-2" />
                                <span className="text-[10px] text-slate-500 font-mono">{pct}% encumbered</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Live Transactions Audit Stream */}
                <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" /> Real-Time Spend Encumbrance & Deduction Audit Log
                  </h3>

                  <div className="space-y-2">
                    {transactions.slice(0, 5).map((txn) => (
                      <div key={txn.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            {txn.type.toUpperCase()}
                          </span>
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{txn.description}</span>
                            <span className="text-slate-500 block text-[11px]">Head: {txn.budget_head_code}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-900 dark:text-white block">
                            ₹{txn.amount.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] text-slate-400">{new Date(txn.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal: Consolidate & Transmit to EVP */}
        <Dialog open={consolidationModalOpen} onOpenChange={setConsolidationModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Consolidate Institutional Annual Budget</DialogTitle>
              <DialogDescription>
                Compile all department requirements into the master institutional budget proposal for EVP / Board of Trustees sanction.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Label className="text-xs">Finance Review Remarks & Variance Rationale</Label>
              <Textarea
                rows={4}
                value={financeRemarks}
                onChange={(e) => setFinanceRemarks(e.target.value)}
                className="text-xs"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setConsolidationModalOpen(false)}>Cancel</Button>
              <Button onClick={handleConsolidateAndSubmit} className="bg-sky-600 hover:bg-sky-700 text-white">
                Transmit to EVP
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: EVP Sanction & Lock */}
        <Dialog open={sanctionModalOpen} onOpenChange={setSanctionModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Executive Budget Sanction Decision</DialogTitle>
              <DialogDescription>
                Formally sanction and lock the FY {financialYear} annual institutional budget.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Decision</Label>
                <Select value={sanctionDecision} onValueChange={(v: any) => setSanctionDecision(v)}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Sanction & Lock Annual Budget</SelectItem>
                    <SelectItem value="rework">Return for Rework Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Governance Endorsement Remarks</Label>
                <Textarea
                  rows={4}
                  value={sanctionRemarks}
                  onChange={(e) => setSanctionRemarks(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSanctionModalOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSanctionAction}
                className={sanctionDecision === "approved" ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
              >
                {sanctionDecision === "approved" ? "Authorize & Lock" : "Send Back for Rework"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Detail Inspection Drawer */}
        {detailProposal && (
          <Dialog open={!!detailProposal} onOpenChange={() => setDetailProposal(null)}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{detailProposal.department_name} — Budget Formulation Detail</DialogTitle>
                <DialogDescription>
                  FY {detailProposal.financial_year} • Total: ₹{detailProposal.total_proposed.toLocaleString("en-IN")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Category Allocations</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(detailProposal.category_allocations || {}).map(([k, v]) => (
                      <div key={k} className="p-2 border rounded flex justify-between">
                        <span className="capitalize">{k.replace(/_/g, " ")}:</span>
                        <span className="font-mono font-bold">₹{Number(v).toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Line Item Requirements</h4>
                  <div className="border rounded overflow-hidden text-xs">
                    <table className="w-full">
                      <thead className="bg-slate-100 dark:bg-slate-900 border-b">
                        <tr>
                          <th className="p-2 text-left">Description</th>
                          <th className="p-2 text-center">Qty</th>
                          <th className="p-2 text-right">Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(detailProposal.line_items || []).map((item) => (
                          <tr key={item.id}>
                            <td className="p-2 font-medium">{item.description}</td>
                            <td className="p-2 text-center">{item.qty}</td>
                            <td className="p-2 text-right font-mono">₹{item.total_est.toLocaleString("en-IN")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={() => setDetailProposal(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </Layout>
  );
}
