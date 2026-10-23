import { useState, useEffect } from "react";
import { FilterSelect } from "@/components/FilterSelect";
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
import { useToast } from "@/hooks/use-toast";
import { getMyPendingApprovals, getMyApprovalHistory } from "@/lib/procurement/approvals.functions";
import { approvePr, rejectPr, escalateToEvp } from "@/lib/procurement/pr.functions";
import { approveCs, rejectCs } from "@/lib/procurement/cs.functions";
import { approvePo, rejectPo } from "@/lib/procurement/po.functions";
import { approveInvoice, decideDeviation } from "@/lib/procurement/invoice.functions";
import { approveEmergency } from "@/lib/procurement/emergency.functions";
import { decideRateContract } from "@/lib/procurement/rateContract.functions";
import { rateCategoryLabel } from "@/lib/procurement/rateContracts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  RefreshCw,
  FileSpreadsheet,
  Scale,
  ShoppingBag,
  FileEdit,
  Receipt,
  Zap,
  ScrollText,
  UserCheck,
  History,
  Calendar,
  Filter,
  ChevronDown,
} from "lucide-react";
import { TurnaroundWidget } from "@/components/procurement/TurnaroundWidget";
import { statusLabel, roleLabel, poTypeLabel, categoryLabel } from "@/lib/procurement/labels";
import { RateBenchmarkingWidget } from "@/components/procurement/RateBenchmarkingWidget";

export default function MyApprovals() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any>(null);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<"all" | "prs" | "pos" | "css" | "invoices">("all");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Decision Modal
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<
    | "pr_approve"
    | "pr_reject"
    | "pr_escalate"
    | "cs_approve"
    | "cs_reject"
    | "po_approve"
    | "po_reject"
    | "am_approve"
    | "am_reject"
    | "inv_approve"
    | "dev_approve"
    | "dev_reject"
    | "ep_approve"
    | "ep_reject"
    | "rc_approve"
    | "rc_reject"
  >("pr_approve");
  const [activeItem, setActiveItem] = useState<any>(null);
  const [remarks, setRemarks] = useState("");
  const [activeTab, setActiveTab] = useState<string>("prs");

  const loadData = async () => {
    setLoading(true);
    try {
      const [res, histRes] = await Promise.all([
        (getMyPendingApprovals as any)(),
        (getMyApprovalHistory as any)(),
      ]);
      if (res?.ok) {
        setData(res);
        // If PR has 0 items but PO has items, default activeTab to pos
        if ((res.prs || []).length === 0 && (res.purchaseOrders || []).length > 0) {
          setActiveTab("pos");
        } else if ((res.prs || []).length === 0 && (res.comparativeStatements || []).length > 0) {
          setActiveTab("css");
        }
      }
      if (histRes?.ok) {
        setHistoryData(histRes);
      }
    } catch (e: any) {
      toast({ title: "Error loading approvals", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, []);

  const handleOpenAction = (item: any, type: any) => {
    setActiveItem(item);
    setDialogType(type);
    setRemarks("");
    setDialogOpen(true);
  };

  const handleExecuteAction = async () => {
    if (!activeItem) return;

    if (dialogType.includes("reject") && !remarks.trim()) {
      toast({
        title: "Rejection Reason Required",
        description: "Enter a reason for rejecting this request.",
        variant: "destructive",
      });
      return;
    }

    setActing(true);
    try {
      if (dialogType === "pr_approve") {
        const res = await (approvePr as any)({ data: { pr_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        // Over budget: the approval sends it on to the EVP rather than approving it.
        toast(
          res.status === "escalated_to_evp"
            ? { title: "Sent to the EVP", description: `${activeItem.pr_number}: ${res.reason}` }
            : { title: "Requisition Approved", description: `PR ${activeItem.pr_number} approved.` },
        );
      } else if (dialogType === "pr_reject") {
        const res = await (rejectPr as any)({ data: { pr_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({
          title: "Requisition Rejected",
          description: `PR ${activeItem.pr_number} rejected.`,
        });
      } else if (dialogType === "pr_escalate") {
        const res = await (escalateToEvp as any)({ data: { pr_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({
          title: "Requisition Escalated",
          description: `PR ${activeItem.pr_number} escalated to EVP.`,
        });
      } else if (dialogType === "cs_approve") {
        const res = await (approveCs as any)({ data: { cs_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({
          title: "Comparative Statement Approved",
          description: `CS ${activeItem.cs_number} approved.`,
        });
      } else if (dialogType === "cs_reject") {
        const res = await (rejectCs as any)({
          data: { cs_id: activeItem.id, rejection_remarks: remarks },
        });
        if (!res.ok) throw new Error(res.error);
        toast({
          title: "Comparative Statement Rejected",
          description: `CS ${activeItem.cs_number} rejected.`,
        });
      } else if (dialogType === "po_approve") {
        const res = await (approvePo as any)({ data: { po_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({
          title: "Purchase Order Approved",
          description: `PO ${activeItem.po_number} approved.`,
        });
      } else if (dialogType === "po_reject" || dialogType === "am_reject") {
        // An amendment awaiting re-approval is decided on its purchase order.
        const poId = dialogType === "am_reject" ? activeItem.po_id : activeItem.id;
        const res = await (rejectPo as any)({ data: { po_id: poId, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({
          title: dialogType === "am_reject" ? "Amendment Rejected" : "Purchase Order Rejected",
          description:
            res.status === "amendment_rejected"
              ? "The order is back to its previous value."
              : res.status === "increase_rejected"
                ? "The increase was rejected; the order stays issued at its previous value."
                : "The purchase order was cancelled.",
        });
      } else if (dialogType === "am_approve") {
        const res = await (approvePo as any)({ data: { po_id: activeItem.po_id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({
          title: "Amendment Approved",
          description: `${activeItem.purchase_orders?.po_number ?? "Order"} approved at the new value.`,
        });
      } else if (dialogType === "inv_approve") {
        const res = await (approveInvoice as any)({ data: { invoice_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({
          title: "Invoice Approved",
          description: `Invoice ${activeItem.invoice_number} approved for payment.`,
        });
      } else if (dialogType === "dev_approve" || dialogType === "dev_reject") {
        const res = await (decideDeviation as any)({
          data: { invoice_id: activeItem.id, approve: dialogType === "dev_approve", remarks },
        });
        if (!res.ok) throw new Error(res.error);
        toast({
          title: dialogType === "dev_approve" ? "Deviation Approved" : "Deviation Rejected",
          description:
            dialogType === "dev_approve"
              ? `Invoice ${activeItem.invoice_number} can now be approved for payment.`
              : `Invoice ${activeItem.invoice_number} stays on hold.`,
        });
      } else if (dialogType === "ep_approve") {
        const res = await (approveEmergency as any)({
          data: { emergency_id: activeItem.id, decision: "approved" },
        });
        if (!res.ok) throw new Error(res.error);
        toast({
          title: "Emergency Procurement Authorized",
          description: "EVP approval registered.",
        });
      } else if (dialogType === "ep_reject") {
        const res = await (approveEmergency as any)({
          data: { emergency_id: activeItem.id, decision: "rejected", rejection_remarks: remarks },
        });
        if (!res.ok) throw new Error(res.error);
        toast({ title: "Emergency Procurement Rejected", description: "Recorded in register." });
      } else if (dialogType === "rc_approve" || dialogType === "rc_reject") {
        const approved = dialogType === "rc_approve";
        const res = await decideRateContract({
          data: { id: activeItem.id, decision: approved ? "approved" : "rejected", remarks },
        });
        if (!res.ok) throw new Error(res.error);
        toast({
          title: approved ? "Rate contract approved" : "Rate contract rejected",
          description: approved
            ? `${activeItem.contract_number} now covers purchases until ${activeItem.valid_to}.`
            : `${activeItem.contract_number} won't be used.`,
        });
      }

      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Action Failed", description: e.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const counts = data?.counts || {
    prs: 0,
    css: 0,
    pos: 0,
    amendments: 0,
    invoices: 0,
    emergency: 0,
    rateContracts: 0,
    total: 0,
  };
  const userRoles = data?.roles || [];

  const historyTotalCount =
    (historyData?.prHistory || []).length +
    (historyData?.csHistory || []).length +
    (historyData?.poHistory || []).length +
    (historyData?.invHistory || []).length;

  const filterOptions = [
    {
      id: "prs",
      label: "PR",
      fullLabel: "Purchase Requisitions (PR)",
      icon: FileSpreadsheet,
      color: "text-blue-600",
      count: counts.prs,
    },
    {
      id: "css",
      label: "CS",
      fullLabel: "Comparative Statements (CS)",
      icon: Scale,
      color: "text-emerald-600",
      count: counts.css,
    },
    {
      id: "pos",
      label: "PO",
      fullLabel: "Purchase Orders (PO)",
      icon: ShoppingBag,
      color: "text-indigo-600",
      count: counts.pos,
    },
    {
      id: "amendments",
      label: "Amend",
      fullLabel: "PO Amendments",
      icon: FileEdit,
      color: "text-purple-600",
      count: counts.amendments,
    },
    {
      id: "invoices",
      label: "Invoices",
      fullLabel: "Vendor Invoices",
      icon: Receipt,
      color: "text-teal-600",
      count: counts.invoices,
    },
    {
      id: "emergency",
      label: "Emergency",
      fullLabel: "Emergency Procurement",
      icon: Zap,
      color: "text-amber-600",
      count: counts.emergency,
    },
    {
      id: "rateContracts",
      label: "Rate contracts",
      fullLabel: "Rate Contracts (EVP approval)",
      icon: ScrollText,
      color: "text-violet-600",
      count: counts.rateContracts ?? 0,
    },
    {
      id: "history",
      label: "History",
      fullLabel: "Approval History",
      icon: History,
      color: "text-slate-500",
      count: historyTotalCount,
    },
  ];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200 mb-2">
              <UserCheck className="w-3.5 h-3.5" /> Approvals
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              My Procurement Approvals
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Requisitions, Comparative Statements, Purchase Orders, Invoices, and Emergency
              authorisations awaiting your role.
            </p>
          </div>
        </div>

        {/* User Roles Banner */}
        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-slate-500 font-medium block">Your roles:</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {userRoles.length > 0 ? (
                userRoles.map((r: string) => (
                  <Badge
                    key={r}
                    variant="secondary"
                    className="font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                  >
                    {roleLabel(r)}
                  </Badge>
                ))
              ) : (
                <span className="text-slate-400">No procurement roles assigned.</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
            <span>Total Pending: </span>
            <Badge variant="default" className="text-sm px-2.5 py-0.5">
              {counts.total}
            </Badge>
          </div>
        </div>

        {/* How long open items have been waiting */}
        <TurnaroundWidget />

        {/* Tabs for PR, CS, PO, Amendments, Invoices, Emergency */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <FilterSelect
            value={activeTab}
            onChange={setActiveTab}
            options={filterOptions.map((o) => ({
              id: o.id,
              label: o.fullLabel,
              count: o.count,
              icon: o.icon,
              color: o.color,
            }))}
            title="Show approvals for"
          />

          {/* Requisitions Tab */}
          <TabsContent value="prs" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading pending requisitions...</div>
            ) : (data?.prs || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">
                No purchase requisitions awaiting your approval.
              </Card>
            ) : (
              data?.prs?.map((pr: any) => (
                <Card key={pr.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold whitespace-nowrap">{pr.pr_number}</span>
                        <Badge variant="outline">{categoryLabel(pr.category)}</Badge>
                        <Badge variant="secondary">{statusLabel(pr.status)}</Badge>
                        {pr.budget_status === "over" && (
                          <Badge className="bg-red-600 hover:bg-red-600 text-white">Over budget</Badge>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                        <span>
                          Dept: {pr.departments?.name || "Academic"} • Est. Value: ₹
                          {Number(pr.estimated_value).toLocaleString("en-IN")}
                        </span>
                        <RateBenchmarkingWidget
                          compact
                          description={pr.pr_line_items?.[0]?.description || categoryLabel(pr.category)}
                          unitRate={
                            Number(pr.estimated_value || 0) /
                            Math.max(1, pr.pr_line_items?.length || 1)
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleOpenAction(pr, "pr_approve")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleOpenAction(pr, "pr_reject")}
                        className="gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenAction(pr, "pr_escalate")}
                        className="gap-1"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" /> Escalate
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs space-y-2">
                    <p className="text-slate-600 dark:text-slate-300">
                      <span className="font-medium">Justification: </span>
                      {pr.justification}
                    </p>
                    <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded text-slate-500">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        Routing:{" "}
                      </span>
                      {pr.routing_reason}
                    </div>
                    {pr.budget_status === "over" && (pr.budget_justification || pr.reappropriation_ref) && (
                      <div className="p-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200">
                        <span className="font-medium">Why over budget: </span>
                        {pr.budget_justification}
                        {pr.reappropriation_ref && (
                          <span className="font-mono"> (re-appropriation {pr.reappropriation_ref})</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Comparative Statements Tab */}
          <TabsContent value="css" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">
                Loading comparative statements...
              </div>
            ) : (data?.comparativeStatements || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">
                No comparative statements awaiting your review.
              </Card>
            ) : (
              data?.comparativeStatements?.map((cs: any) => (
                <Card key={cs.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold whitespace-nowrap">{cs.cs_number}</span>
                        <Badge variant="outline">
                          {cs.is_lowest_price ? "L1 Lowest" : "Non-Lowest Quote"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Recommended Vendor:{" "}
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {cs.vendors?.name}
                        </span>{" "}
                        • Total: ₹{Number(cs.recommended_total).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleOpenAction(cs, "cs_approve")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve CS
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleOpenAction(cs, "cs_reject")}
                        className="gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs space-y-2">
                    {!cs.is_lowest_price && (
                      <div className="p-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 rounded text-amber-900 dark:text-amber-200">
                        <span className="font-semibold">Non-Lowest Rationale: </span>
                        {cs.non_lowest_rationale}
                      </div>
                    )}
                    <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded text-slate-500">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        Routing Rule:{" "}
                      </span>
                      {cs.routing_reason}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Purchase Orders Tab */}
          <TabsContent value="pos" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading purchase orders...</div>
            ) : (data?.purchaseOrders || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">
                No purchase orders awaiting your approval.
              </Card>
            ) : (
              data?.purchaseOrders?.map((po: any) => (
                <Card key={po.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold whitespace-nowrap">{po.po_number}</span>
                        <Badge variant="outline">{poTypeLabel(po.type)}</Badge>
                        {po.budget_status === "over_pending_evp" && (
                          <Badge className="bg-red-600 hover:bg-red-600 text-white">Over budget</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Vendor:{" "}
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {po.vendors?.name}
                        </span>{" "}
                        • Total Value: ₹
                        {(Number(po.price || 0) + Number(po.taxes || 0)).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleOpenAction(po, "po_approve")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve PO
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleOpenAction(po, "po_reject")}
                        className="gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs space-y-1">
                    <p className="text-slate-600 dark:text-slate-300">
                      <span className="font-medium">Scope: </span>
                      {po.scope_of_supply}
                    </p>
                    <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded text-slate-500">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        Routing Rule:{" "}
                      </span>
                      {po.routing_reason}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Amendments Tab */}
          <TabsContent value="amendments" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading amendments...</div>
            ) : (data?.amendments || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">
                No order amendments requiring re-approval.
              </Card>
            ) : (
              data?.amendments?.map((am: any) => (
                <Card key={am.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold whitespace-nowrap">
                          {am.purchase_orders?.po_number} Amendment
                        </span>
                        <Badge variant="outline" className="text-purple-700 border-purple-400">
                          Needs re-approval
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Vendor: {am.purchase_orders?.vendors?.name} • ₹
                        {Number(am.old_value_total).toLocaleString("en-IN")} → ₹
                        {Number(am.new_value_total).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleOpenAction(am, "am_approve")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve Amendment
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleOpenAction(am, "am_reject")}
                        className="gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs space-y-1">
                    <p className="text-slate-600 dark:text-slate-300">
                      <span className="font-medium">Reason: </span>
                      {am.reason}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading matched invoices...</div>
            ) : (data?.invoices || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">
                No invoices awaiting approval.
              </Card>
            ) : (
              data?.invoices?.map((inv: any) => (
                <Card key={inv.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold whitespace-nowrap">Invoice: {inv.invoice_number}</span>
                        {inv.deviation_status === "requested" ? (
                          <Badge variant="outline" className="text-amber-700 border-amber-400 dark:text-amber-300">
                            Deviation request
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-emerald-700 border-emerald-400">
                            Matches order & delivery
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Vendor: {inv.vendors?.name} • PO: {inv.purchase_orders?.po_number} • Amount:
                        ₹{Number(inv.invoice_amount).toLocaleString("en-IN")}
                      </p>
                      {inv.deviation_status === "requested" && (
                        <div className="mt-2 space-y-1 text-xs">
                          <p className="text-red-700 dark:text-red-300">{inv.hold_reason}</p>
                          <p className="text-slate-600 dark:text-slate-300">
                            <span className="font-semibold">Why accept it: </span>
                            {inv.deviation_reason}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {inv.deviation_status === "requested" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleOpenAction(inv, "dev_approve")}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Accept Difference
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleOpenAction(inv, "dev_reject")}>
                            Reject
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleOpenAction(inv, "inv_approve")}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Approve for Payment
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Emergency Tab */}
          <TabsContent value="emergency" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading emergency requests...</div>
            ) : (data?.emergencyProcurements || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">
                No emergency procurements awaiting EVP authorization.
              </Card>
            ) : (
              data?.emergencyProcurements?.map((ep: any) => (
                <Card key={ep.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold whitespace-nowrap">{ep.emergency_number}</span>
                        <Badge variant="outline" className="text-amber-700 border-amber-400">
                          {ep.is_post_facto ? "Post-Facto Ratification" : "Emergency Request"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Dept: {ep.departments?.name || "Central"} • Estimated Cost: ₹
                        {Number(ep.estimated_cost).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleOpenAction(ep, "ep_approve")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Authorize
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleOpenAction(ep, "ep_reject")}
                        className="gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs space-y-1">
                    <p className="text-slate-600 dark:text-slate-300">
                      <span className="font-medium">Description: </span>
                      {ep.description}
                    </p>
                    <p className="text-amber-800 dark:text-amber-300">
                      <span className="font-medium">Reason Standard Process Failed: </span>
                      {ep.reason_standard_process_failed}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Rate Contracts Tab (SOP Section VI: approved by the EVP, from 3+ quotations) */}
          <TabsContent value="rateContracts" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading rate contracts...</div>
            ) : (data?.rateContracts || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">
                No rate contracts awaiting EVP approval.
              </Card>
            ) : (
              data?.rateContracts?.map((rc: any) => (
                <Card key={rc.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold whitespace-nowrap">
                          {rc.contract_number}
                        </span>
                        <Badge variant="outline" className="text-violet-700 border-violet-400">
                          {rateCategoryLabel(rc.category)}
                        </Badge>
                        {rc.rfqs?.rfq_number && (
                          <Badge variant="secondary">From {rc.rfqs.rfq_number}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {rc.title} • Vendor: {rc.vendors?.name} • Valid {rc.valid_from} to{" "}
                        {rc.valid_to}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleOpenAction(rc, "rc_approve")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleOpenAction(rc, "rc_reject")}
                        className="gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs space-y-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {(rc.approved_rates_json || []).map((r: any, i: number) => (
                        <span key={i}>
                          {r.description}:{" "}
                          <span className="font-mono font-semibold">
                            ₹{Number(r.rate).toLocaleString("en-IN")}
                          </span>
                          /{r.unit}
                        </span>
                      ))}
                    </div>
                    {rc.quotes?.length ? (
                      <p className="text-slate-600 dark:text-slate-300">
                        <span className="font-medium">Quotes (total of unit rates): </span>
                        {rc.quotes
                          .map(
                            (q: any, i: number) =>
                              `${q.vendor_name} ₹${Number(q.total).toLocaleString("en-IN")}${i === 0 ? " (lowest)" : ""}`,
                          )
                          .join(" · ")}
                      </p>
                    ) : (
                      <p className="text-amber-700 dark:text-amber-300">
                        Registered before the 3-quotation rule: no quotes on record.
                      </p>
                    )}
                    {rc.selection_note && (
                      <p className="text-amber-800 dark:text-amber-300">
                        <span className="font-medium">Why not the lowest quote: </span>
                        {rc.selection_note}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            {/* Filter by Type */}
            <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <Button
                variant={historyTypeFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setHistoryTypeFilter("all")}
                className="text-xs h-8 gap-1.5"
              >
                All History
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] ml-1">
                  {((historyData?.prHistory || []).length +
                    (historyData?.csHistory || []).length +
                    (historyData?.poHistory || []).length +
                    (historyData?.invHistory || []).length)}
                </Badge>
              </Button>
              <Button
                variant={historyTypeFilter === "prs" ? "default" : "outline"}
                size="sm"
                onClick={() => setHistoryTypeFilter("prs")}
                className="text-xs h-8 gap-1.5 text-blue-600 dark:text-blue-400"
              >
                Requisitions (PR)
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] ml-1">
                  {(historyData?.prHistory || []).length}
                </Badge>
              </Button>
              <Button
                variant={historyTypeFilter === "css" ? "default" : "outline"}
                size="sm"
                onClick={() => setHistoryTypeFilter("css")}
                className="text-xs h-8 gap-1.5 text-emerald-600 dark:text-emerald-400"
              >
                Comparative Statements
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] ml-1">
                  {(historyData?.csHistory || []).length}
                </Badge>
              </Button>
              <Button
                variant={historyTypeFilter === "pos" ? "default" : "outline"}
                size="sm"
                onClick={() => setHistoryTypeFilter("pos")}
                className="text-xs h-8 gap-1.5 text-indigo-600 dark:text-indigo-400"
              >
                Purchase Orders
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] ml-1">
                  {(historyData?.poHistory || []).length}
                </Badge>
              </Button>
              <Button
                variant={historyTypeFilter === "invoices" ? "default" : "outline"}
                size="sm"
                onClick={() => setHistoryTypeFilter("invoices")}
                className="text-xs h-8 gap-1.5 text-teal-600 dark:text-teal-400"
              >
                Invoices
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] ml-1">
                  {(historyData?.invHistory || []).length}
                </Badge>
              </Button>
            </div>

            {/* Content List */}
            {(() => {
              const prs =
                historyTypeFilter === "all" || historyTypeFilter === "prs"
                  ? historyData?.prHistory || []
                  : [];
              const css =
                historyTypeFilter === "all" || historyTypeFilter === "css"
                  ? historyData?.csHistory || []
                  : [];
              const pos =
                historyTypeFilter === "all" || historyTypeFilter === "pos"
                  ? historyData?.poHistory || []
                  : [];
              const invs =
                historyTypeFilter === "all" || historyTypeFilter === "invoices"
                  ? historyData?.invHistory || []
                  : [];

              const totalItems = prs.length + css.length + pos.length + invs.length;
              if (totalItems === 0) {
                return (
                  <Card className="p-8 text-center text-slate-500">
                    No approval history found for your role or department yet.
                  </Card>
                );
              }

              return (
                <div className="space-y-3">
                  {/* PRs */}
                  {prs.map((pr: any) => {
                    const isApproved = pr.status === "approved";
                    const isRejected = pr.status === "rejected";
                    return (
                      <Card
                        key={`pr-${pr.id}`}
                        className="border border-slate-200 dark:border-slate-800"
                      >
                        <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                PR
                              </Badge>
                              <span className="font-mono font-bold whitespace-nowrap">{pr.pr_number}</span>
                              <Badge variant="outline">{categoryLabel(pr.category)}</Badge>
                              <Badge
                                variant={
                                  isApproved ? "default" : isRejected ? "destructive" : "secondary"
                                }
                                className={isApproved ? "bg-emerald-600 text-white" : ""}
                              >
                                {statusLabel(pr.status)}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              Dept: {pr.departments?.name || "Academic"} • Est. Value: ₹
                              {Number(pr.estimated_value).toLocaleString("en-IN")}
                              {pr.updated_at &&
                                ` • Updated: ${new Date(pr.updated_at).toLocaleDateString()}`}
                            </p>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-1 text-xs space-y-1">
                          {pr.justification && (
                            <p className="text-slate-600 dark:text-slate-300">
                              <span className="font-medium">Justification: </span>
                              {pr.justification}
                            </p>
                          )}
                          {pr.routing_reason && (
                            <p className="text-slate-500">
                              <span className="font-medium">Routing: </span>
                              {pr.routing_reason}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}

                  {/* CS */}
                  {css.map((cs: any) => {
                    const isApproved = cs.status === "approved";
                    const isRejected = cs.status === "rejected";
                    return (
                      <Card
                        key={`cs-${cs.id}`}
                        className="border border-slate-200 dark:border-slate-800"
                      >
                        <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                CS
                              </Badge>
                              <span className="font-mono font-bold whitespace-nowrap">{cs.cs_number}</span>
                              <Badge
                                variant={
                                  isApproved ? "default" : isRejected ? "destructive" : "secondary"
                                }
                                className={isApproved ? "bg-emerald-600 text-white" : ""}
                              >
                                {statusLabel(cs.status)}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              RFQ: {cs.rfqs?.rfq_number || "—"} • Recommended Total: ₹
                              {Number(cs.recommended_total || 0).toLocaleString("en-IN")}
                              {cs.updated_at &&
                                ` • Updated: ${new Date(cs.updated_at).toLocaleDateString()}`}
                            </p>
                          </div>
                        </CardHeader>
                        {cs.remarks && (
                          <CardContent className="p-4 pt-1 text-xs">
                            <p className="text-slate-600 dark:text-slate-300">
                              <span className="font-medium">Remarks: </span>
                              {cs.remarks}
                            </p>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}

                  {/* POs */}
                  {pos.map((po: any) => {
                    return (
                      <Card
                        key={`po-${po.id}`}
                        className="border border-slate-200 dark:border-slate-800"
                      >
                        <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                                PO
                              </Badge>
                              <span className="font-mono font-bold whitespace-nowrap">{po.po_number}</span>
                              <Badge variant="outline">{po.vendors?.name || "Vendor"}</Badge>
                              <Badge
                                variant={po.status === "issued" ? "default" : "secondary"}
                                className={po.status === "issued" ? "bg-indigo-600 text-white" : ""}
                              >
                                {statusLabel(po.status)}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              Total Value: ₹{Number(po.total_value).toLocaleString("en-IN")} • PR
                              Ref: {po.purchase_requisitions?.pr_number || "Direct"}
                              {po.updated_at &&
                                ` • Updated: ${new Date(po.updated_at).toLocaleDateString()}`}
                            </p>
                          </div>
                        </CardHeader>
                        {po.scope_of_supply && (
                          <CardContent className="p-4 pt-1 text-xs">
                            <p className="text-slate-600 dark:text-slate-300">
                              <span className="font-medium">Scope: </span>
                              {po.scope_of_supply}
                            </p>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}

                  {/* Invoices */}
                  {invs.map((inv: any) => {
                    return (
                      <Card
                        key={`inv-${inv.id}`}
                        className="border border-slate-200 dark:border-slate-800"
                      >
                        <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                Invoice
                              </Badge>
                              <span className="font-mono font-bold whitespace-nowrap">{inv.invoice_number}</span>
                              <Badge variant="outline">{inv.vendors?.name || "Vendor"}</Badge>
                              <Badge
                                variant={inv.match_status === "paid" ? "default" : "secondary"}
                                className={
                                  inv.match_status === "paid" ? "bg-emerald-600 text-white" : ""
                                }
                              >
                                {statusLabel(inv.match_status)}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              PO: {inv.purchase_orders?.po_number || "—"} • Amount: ₹
                              {Number(inv.invoice_amount).toLocaleString("en-IN")}
                              {inv.updated_at &&
                                ` • Updated: ${new Date(inv.updated_at).toLocaleDateString()}`}
                            </p>
                          </div>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>

        {/* Action Remarks Modal */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {dialogType.includes("approve")
                  ? "Approve Item"
                  : dialogType.includes("reject")
                    ? "Reject Item"
                    : "Escalate Item"}
              </DialogTitle>
              <DialogDescription>
                Record your authorization decision and remarks in the audit trail.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Label className="flex items-center justify-between">
                <span>Remarks / Observations</span>
                {dialogType.includes("reject") && (
                  <span className="text-xs text-red-500 font-semibold">(Mandatory for Rejection)</span>
                )}
              </Label>
              <Textarea
                placeholder={
                  dialogType.includes("reject")
                    ? "Enter required reason for rejection..."
                    : "Enter audit remarks (optional)..."
                }
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                className={
                  dialogType.includes("reject") && !remarks.trim()
                    ? "border-red-300 focus-visible:ring-red-400"
                    : ""
                }
              />
              {dialogType.includes("reject") && !remarks.trim() && (
                <p className="text-xs text-red-500">
                  A written reason is required before confirming rejection.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleExecuteAction}
                disabled={acting || (dialogType.includes("reject") && !remarks.trim())}
                className={
                  dialogType.includes("reject")
                    ? "bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                }
              >
                {acting ? "Processing..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
