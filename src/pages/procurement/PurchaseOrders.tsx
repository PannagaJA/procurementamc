import { useState, useEffect } from "react";
import { FilterSelect, statusFilterOptions, applyFilter } from "@/components/FilterSelect";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { supabase } from "@/integrations/supabase/client";
import {
  createPo,
  approvePo,
  issuePo,
  amendPo,
  closePo,
  listPurchaseOrders,
} from "@/lib/procurement/po.functions";
import { dispatchPoEmail } from "@/lib/procurement/email.functions";
import { createRfq, sendRfq } from "@/lib/procurement/rfq.functions";
import { emailQuoteInvites } from "@/lib/procurement/quoteInvites";
import { useNavigate } from "@tanstack/react-router";
import { listComparativeStatements } from "@/lib/procurement/cs.functions";
import {
  ShoppingBag,
  PlusCircle,
  CheckCircle,
  FileEdit,
  Send,
  Lock,
  AlertTriangle,
  History,
  Building2,
  RefreshCw,
  CreditCard,
  Clock,
  FileText,
  Printer,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PoPrintPreviewModal } from "@/components/procurement/PoPrintPreviewModal";
import { buildPoPdf } from "@/lib/procurement/poPdf";
import { isActiveRateContract } from "@/lib/procurement/rateContracts";
import { roleLabel } from "@/lib/procurement/labels";

export default function PurchaseOrders() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const auth = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const { pagination, setPage, setPageSize, setTotal } = usePagination(10, 1);
  const [approvedCss, setApprovedCss] = useState<any[]>([]);
  const [rateContracts, setRateContracts] = useState<any[]>([]);
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [matrixRules, setMatrixRules] = useState<any[]>([]);
  const [approvedPrs, setApprovedPrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("active");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
      case "issued":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-300";
      case "pending_approval":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-300";
      case "closed":
        return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300";
      case "partially_closed":
        return "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200 border-teal-300";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 border-red-300";
      default:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200";
    }
  };

  // Create PO Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [poType, setPoType] = useState<"regular" | "rate_contract" | "direct_purchase">("regular");
  const [selectedCsId, setSelectedCsId] = useState("");
  const [selectedRcId, setSelectedRcId] = useState("");
  const [selectedPrId, setSelectedPrId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  // Direct purchase (small value): stores check is required; quotes are optional.
  const [storesConfirmed, setStoresConfirmed] = useState(false);
  const [quotesNote, setQuotesNote] = useState("");
  // Direct purchase: buy from one vendor now, or ask several vendors for quotes first
  const [directMode, setDirectMode] = useState<"single" | "quotes">("single");
  const [quoteVendorIds, setQuoteVendorIds] = useState<string[]>([]);
  const [quoteDeadline, setQuoteDeadline] = useState(() =>
    new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
  );
  const [quoteNotes, setQuoteNotes] = useState("");
  // PR id -> RFQ number for requisitions already out for quotes
  const [openRfqByPr, setOpenRfqByPr] = useState<Record<string, string>>({});
  const [scopeOfSupply, setScopeOfSupply] = useState("");
  const [price, setPrice] = useState<number | "">(0);
  const [taxes, setTaxes] = useState<number | "">(0);
  const [deliveryTimeline, setDeliveryTimeline] = useState("30 days");
  const [paymentTerms, setPaymentTerms] = useState("100% on delivery and inspection");
  const [creating, setCreating] = useState(false);

  // Amend PO Modal
  const [amendOpen, setAmendOpen] = useState(false);
  const [activePo, setActivePo] = useState<any>(null);
  const [newPrice, setNewPrice] = useState<number | "">(0);
  const [newTaxes, setNewTaxes] = useState<number | "">(0);
  const [amendReason, setAmendReason] = useState("");
  const [amending, setAmending] = useState(false);

  // Print Preview Modal
  const [printOpen, setPrintOpen] = useState(false);
  const [selectedPoForPrint, setSelectedPoForPrint] = useState<any>(null);

  const handleOpenPrintPreview = (po: any) => {
    setSelectedPoForPrint(po);
    setPrintOpen(true);
  };

  // General action state
  const [acting, setActing] = useState(false);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentPoForVendor = (orders || []).find((o: any) => {
    if (o.status === "cancelled") return false;
    const isSameVendor = selectedVendorId && o.vendor_id === selectedVendorId;
    const isSamePr = selectedPrId && o.pr_id === selectedPrId;
    const isRecent = new Date(o.created_at) >= thirtyDaysAgo;
    return isRecent && (isSameVendor || isSamePr);
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [poRes, csRes] = await Promise.all([
        (listPurchaseOrders as any)(),
        (listComparativeStatements as any)(),
      ]);

      if (poRes?.ok) {
        const list = poRes.purchaseOrders || [];
        setOrders(list);
        setTotal(list.length);
      }
      const poList = poRes?.purchaseOrders || [];
      const existingPoCsIds = new Set(
        poList
          .filter((o: any) => o.status !== "cancelled")
          .map((o: any) => o.cs_id)
          .filter(Boolean),
      );

      if (csRes?.ok) {
        setApprovedCss(
          (csRes.comparativeStatements || []).filter(
            (cs: any) => cs.status === "approved" && !existingPoCsIds.has(cs.id),
          ),
        );
      }

      // Fetch active rate contracts
      const { data: rcData } = await supabase
        .from("rate_contracts")
        .select("*, vendors(id, name)")
        .order("created_at", { ascending: false });
      setRateContracts(rcData || []);

      // Approved PRs without an active PO (for rate-contract orders)
      const { data: prData } = await supabase
        .from("purchase_requisitions")
        .select(
          `
          id, pr_number, estimated_value, category, justification,
          departments (id, name),
          pr_line_items (id, description, net_qty_to_procure, est_unit_price, est_total)
        `,
        )
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      // Filter eligible direct purchase PRs (<= 5000) that do not already have an active PO
      const existingPoPrIds = new Set(
        poList.filter((o: any) => o.status !== "cancelled").map((o: any) => o.pr_id),
      );
      setApprovedPrs((prData || []).filter((p: any) => !existingPoPrIds.has(p.id)));

      const { data: openRfqs } = await supabase
        .from("rfqs")
        .select("pr_id, rfq_number")
        .in("status", ["draft", "sent"]);
      setOpenRfqByPr(Object.fromEntries((openRfqs || []).map((r: any) => [r.pr_id, r.rfq_number])));

      // Vendors that can be awarded work: empanelled and not past expiry (same rule as assertVendorEmpanelled)
      const { data: vData } = await supabase
        .from("vendors")
        .select("id, name, gst_number, status, empanelment_expiry")
        .eq("status", "empanelled")
        .or(
          `empanelment_expiry.is.null,empanelment_expiry.gte.${new Date().toISOString().split("T")[0]}`,
        )
        .order("name");
      setVendorsList(vData || []);

      // Fetch matrix rules for previewing approver
      const { data: rules } = await supabase
        .from("approval_matrix_rules")
        .select("*")
        .eq("active", true);
      setMatrixRules(rules || []);
    } catch (e: any) {
      toast({ title: "Error loading data", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When CS or Rate Contract selection changes in Create PO Modal
  useEffect(() => {
    if (poType === "regular") {
      if (selectedCsId) {
        const cs = approvedCss.find((c) => c.id === selectedCsId);
        if (cs) {
          setSelectedPrId(cs.pr_id || cs.rfqs?.purchase_requisitions?.id || "");
          setSelectedVendorId(cs.recommended_vendor_id || "");
          setPrice(Number(cs.recommended_total || 0));
          setTaxes(0);
          setScopeOfSupply(`Supply as per RFQ ${cs.rfqs?.rfq_number || ""}`);
        }
      }
    } else if (poType === "rate_contract") {
      if (selectedRcId) {
        const rc = rateContracts.find((r) => r.id === selectedRcId);
        if (rc) {
          setSelectedVendorId(rc.vendor_id || rc.vendors?.id || "");
          setScopeOfSupply(`Supply against Rate Contract ${rc.contract_number} (${rc.title})`);
        }
      }
    }
  }, [selectedCsId, selectedRcId, poType, approvedCss, rateContracts]);

  const handleRequestQuotes = async () => {
    if (!selectedPrId || quoteVendorIds.length < 2) {
      toast({
        title: "Select vendors",
        description: "Choose the requisition and at least 2 vendors to compare quotes.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const created = await (createRfq as any)({
        data: {
          pr_id: selectedPrId,
          response_deadline: quoteDeadline || null,
          notes: quoteNotes.trim() || null,
        },
      });
      if (!created.ok) {
        toast({
          title: "Couldn't request quotes",
          description: created.error,
          variant: "destructive",
        });
        return;
      }
      const rfqNumber = created.rfq.rfq_number;
      const sent = await (sendRfq as any)({
        data: { rfq_id: created.rfq.id, vendor_ids: quoteVendorIds },
      });
      if (!sent.ok) {
        toast({
          title: "Quote request saved but not sent",
          description: `${sent.error} Send ${rfqNumber} from the RFQ page.`,
          variant: "destructive",
        });
        setCreateOpen(false);
        navigate({ to: "/procurement/rfqs" });
        return;
      }
      const { sent: emailed, notice } = await emailQuoteInvites(sent.rfqId, sent.vendors ?? []);
      toast({
        title: "Quote requests sent",
        description: [
          `${rfqNumber} sent to ${sent.sentCount} vendors${emailed ? `, ${emailed} by email` : ""}.`,
          notice || null,
          "When the quotes are in, award the lowest from the RFQ page.",
        ]
          .filter(Boolean)
          .join(" "),
      });
      setCreateOpen(false);
      navigate({ to: "/procurement/rfqs" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleCreatePo = async () => {
    if (!selectedPrId || !selectedVendorId || Number(price) <= 0) {
      toast({
        title: "Validation Error",
        description: "Please complete all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (poType === "rate_contract") {
      const chosenRc = activeRateContracts.find((c) => c.id === selectedRcId);
      if (chosenRc) {
        if (chosenRc.vendor_id && chosenRc.vendor_id !== selectedVendorId) {
          toast({
            title: "Vendor Mismatch",
            description: `The purchase order must go to the vendor awarded in rate contract ${chosenRc.contract_number}.`,
            variant: "destructive",
          });
          return;
        }
        const approvedRates = Array.isArray(chosenRc.approved_rates_json) ? chosenRc.approved_rates_json : [];
        const approvedGroups = new Set(
          approvedRates.map((r: any) => r.group?.trim().toLowerCase()).filter(Boolean),
        );
        const pr = approvedPrs.find((p) => p.id === selectedPrId);
        const prItems = pr?.pr_line_items || [];
        const uncovered = prItems.find((it: any) => {
          const g = it.item_group?.trim().toLowerCase();
          const groupMatches = g && approvedGroups.has(g);
          const descMatches = approvedRates.some((ar: any) => {
            const arDesc = (ar.description || "").trim().toLowerCase();
            const itDesc = (it.description || "").trim().toLowerCase();
            return arDesc && itDesc && (arDesc === itDesc || itDesc.includes(arDesc) || arDesc.includes(itDesc));
          });
          return !groupMatches && !descMatches;
        });
        if (uncovered) {
          toast({
            title: "Item Not Covered",
            description: `Item "${uncovered.description}" is not covered by rate contract ${chosenRc.contract_number}.`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    setCreating(true);
    try {
      const res = await (createPo as any)({
        data: {
          pr_id: selectedPrId,
          cs_id: poType === "regular" ? selectedCsId : null,
          rate_contract_id: poType === "rate_contract" ? selectedRcId : null,
          type: poType,
          vendor_id: selectedVendorId,
          scope_of_supply: scopeOfSupply,
          price: Number(price) || 0,
          taxes: Number(taxes) || 0,
          delivery_timeline: deliveryTimeline,
          payment_terms: paymentTerms,
          stores_confirmed: poType === "direct_purchase" ? storesConfirmed : undefined,
          quotes_note: poType === "direct_purchase" ? quotesNote : undefined,
        },
      });

      if (!res.ok) {
        const isSplitting =
          res.code === "po_splitting" || res.error?.toLowerCase().includes("splitting");
        toast({
          title: isSplitting
            ? "Order exceeds approved requisition value"
            : "Failed to create purchase order",
          description: res.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Purchase Order Created",
        description:
          res.po.status === "approved"
            ? `PO ${res.po.po_number} is approved on the requisition's authority and ready to issue.`
            : `PO ${res.po.po_number} routed to ${res.routing?.role?.toUpperCase()} for approval.`,
      });
      setCreateOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleApprovePo = async (po: any) => {
    setActing(true);
    try {
      const res = await (approvePo as any)({
        data: { po_id: po.id },
      });
      if (!res.ok) {
        toast({ title: "Approval Failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "PO Approved", description: `Purchase Order ${po.po_number} approved.` });
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleIssuePo = async (po: any) => {
    setActing(true);
    try {
      const res = await (issuePo as any)({
        data: { po_id: po.id },
      });
      if (!res.ok) {
        toast({ title: "Failed to Issue PO", description: res.error, variant: "destructive" });
        return;
      }
      // Email the PO PDF to the vendor. The PO is already issued, so an email failure is reported, not fatal.
      let emailNote: string;
      try {
        const doc = await buildPoPdf({ ...po, status: "issued" });
        const pdfBase64 = doc.output("datauristring").split(",")[1];
        const mail = await (dispatchPoEmail as any)({
          data: { po_id: po.id, pdf_base64: pdfBase64 },
        });
        emailNote =
          mail && mail.ok
            ? `PDF emailed to ${mail.to}.` +
              (mail.copiesCount
                ? ` Copies sent to internal stakeholders (${mail.copiesCount}).`
                : "")
            : `Email notice: ${mail?.error || "could not dispatch email"}. Download the PDF and send it manually.`;
      } catch (mailEx: any) {
        emailNote = `Email not sent: ${mailEx?.message || "could not generate the PDF"}.`;
      }

      toast({
        title: "Purchase Order Issued",
        description: `Order ${po.po_number} issued. ${emailNote}`,
      });
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleOpenAmend = (po: any) => {
    setActivePo(po);
    setNewPrice(Number(po.price || 0));
    setNewTaxes(Number(po.taxes || 0));
    setAmendReason("");
    setAmendOpen(true);
  };

  const handleAmendPo = async () => {
    if (!activePo || !amendReason.trim() || Number(newPrice) <= 0) {
      toast({
        title: "Validation Error",
        description: "Please provide valid amended values and reason.",
        variant: "destructive",
      });
      return;
    }

    setAmending(true);
    try {
      const res = await (amendPo as any)({
        data: {
          po_id: activePo.id,
          new_price: Number(newPrice) || 0,
          new_taxes: Number(newTaxes) || 0,
          reason: amendReason,
        },
      });

      if (!res.ok) {
        toast({ title: "Amendment Blocked", description: res.error, variant: "destructive" });
        return;
      }

      if (res.requiresReapproval) {
        toast({
          title: "Amendment Requires Re-approval",
          description: `Sent to the ${roleLabel(res.newApproverRole)} for approval. Re-issue the order once it is approved; if it is rejected, the order goes back to its previous value.`,
          variant: "default",
        });
      } else {
        toast({ title: "PO Amended", description: "Purchase order value updated successfully." });
      }

      setAmendOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAmending(false);
    }
  };

  const handleClosePo = async (po: any) => {
    if (!confirm(`Are you sure you want to close Purchase Order ${po.po_number}?`)) return;
    setActing(true);
    try {
      const res = await (closePo as any)({
        data: { po_id: po.id },
      });
      if (!res.ok) {
        toast({ title: "Failed to close PO", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "PO Closed", description: `Order ${po.po_number} marked as closed.` });
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  // Only EVP-approved contracts inside their validity window can back a PO (SOP Section VI)
  const todayIso = new Date().toISOString().split("T")[0];
  const activeRateContracts = rateContracts.filter((rc) => isActiveRateContract(rc, todayIso));
  const pendingRateContracts = rateContracts.filter(
    (rc) => rc.status === "pending_approval",
  ).length;

  const poFilterOptions = statusFilterOptions(orders, (o: any) => o.status, [
    "closed",
    "cancelled",
    "partially_closed",
  ]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200 mb-2">
              <ShoppingBag className="w-3.5 h-3.5" /> Purchase Order Governance
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Purchase Orders & Amendments
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Issue binding POs backed by approved CS or Rate Contracts, with automated tier
              re-approval on value amendments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {(auth.hasRole("admin") || auth.hasRole("procurement_officer")) && (
              <>
                <Button
                  variant="outline"
                  onClick={() => navigate({ to: "/procurement/rfqs" })}
                  title="Rate contracts are finalised from at least 3 quotations through a rate contract RFQ, then approved by the EVP"
                  className="gap-2 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                >
                  <FileText className="w-4 h-4" /> + New Rate Contract
                </Button>
                <Button
                  onClick={() => setCreateOpen(true)}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" /> Create PO
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Status filter */}
        <FilterSelect
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={poFilterOptions}
          title="Filter purchase orders"
        />

        {/* PO List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading Purchase Orders...</div>
          ) : orders.length === 0 ? (
            <Card className="text-center p-8">
              <p className="text-slate-500">
                No Purchase Orders created yet. Create one from an approved Comparative Statement.
              </p>
            </Card>
          ) : (
            (() => {
              const filteredOrders = applyFilter(orders, poFilterOptions, statusFilter);
              if (filteredOrders.length === 0)
                return (
                  <Card className="text-center p-8 text-sm text-muted-foreground">
                    No purchase orders match this filter. Choose History or All to see others.
                  </Card>
                );
              const startIndex = (pagination.page - 1) * pagination.pageSize;
              const paginatedOrders = filteredOrders.slice(
                startIndex,
                startIndex + pagination.pageSize,
              );
              return (
                <>
                  {paginatedOrders.map((po) => {
                    const pr = po.purchase_requisitions;
                    const isPending = po.status === "pending_approval";
                    const isApproved = po.status === "approved";
                    // "amended" (legacy) is a live, already-issued order.
                    const isIssued = po.status === "issued" || po.status === "amended";
                    const amendments = po.po_amendments || [];

                    return (
                      <Card
                        key={po.id}
                        className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300"
                      >
                        <CardHeader className="bg-slate-50/70 dark:bg-slate-900/70 p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2.5">
                                <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                                  {po.po_number}
                                </span>
                                <Badge className={getStatusBadge(po.status)}>
                                  {po.status?.toUpperCase()}
                                </Badge>
                                <Badge variant="outline" className="text-xs capitalize">
                                  {po.po_type?.replace("_", " ")}
                                </Badge>
                              </div>
                              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                                <span>
                                  Vendor:{" "}
                                  <strong className="text-slate-700 dark:text-slate-300">
                                    {po.vendors?.name || "N/A"}
                                  </strong>
                                </span>
                                {pr && (
                                  <span>
                                    PR:{" "}
                                    <strong className="text-slate-700 dark:text-slate-300">
                                      {pr.pr_number}
                                    </strong>
                                  </span>
                                )}
                                <span>Created: {new Date(po.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenPrintPreview(po)}
                                className="gap-1.5 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                                title="Print Preview & Formal Institutional PDF"
                              >
                                <Printer className="w-3.5 h-3.5" /> Print / PDF
                              </Button>

                              {isPending &&
                                (auth.hasRole("admin") ||
                                (po.current_approver_role &&
                                  auth.hasRole(po.current_approver_role) &&
                                  (po.current_approver_role !== "hod" ||
                                    !auth.departmentId ||
                                    !po.department_id ||
                                    auth.departmentId === po.department_id ||
                                    auth.departmentId ===
                                      po.purchase_requisitions?.departments?.id)) ? (
                                  <Button
                                    size="sm"
                                    onClick={() => handleApprovePo(po)}
                                    disabled={acting}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                                  </Button>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 gap-1 text-[11px]"
                                  >
                                    <Clock className="w-3 h-3" />
                                    Awaiting {po.current_approver_role?.toUpperCase()} Approval
                                  </Badge>
                                ))}

                              {isApproved &&
                                (auth.hasRole("admin") ||
                                  auth.hasRole("procurement_officer") ||
                                  auth.hasRole("procurement_executive")) && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleIssuePo(po)}
                                    disabled={acting}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1 text-xs"
                                  >
                                    <Send className="w-3.5 h-3.5" /> Issue to Vendor
                                  </Button>
                                )}

                              {isIssued &&
                                (auth.hasRole("admin") ||
                                  auth.hasRole("procurement_officer")) && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleOpenAmend(po)}
                                      className="gap-1 text-xs border-amber-600 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-950 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60 dark:hover:text-amber-100 transition-colors"
                                    >
                                      <FileEdit className="w-3.5 h-3.5" /> Amend
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleClosePo(po)}
                                      disabled={acting}
                                      className="gap-1 text-xs border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors"
                                    >
                                      <Lock className="w-3.5 h-3.5" /> Close PO
                                    </Button>
                                  </>
                                )}
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="p-4 sm:p-6 space-y-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                            <div>
                              <span className="text-slate-400 block font-medium">Base Price:</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                ₹{Number(po.price || 0).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium">Taxes:</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                ₹{Number(po.taxes || 0).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium">Total Value:</span>
                              <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                                ₹{Number(po.total_value || 0).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium">
                                Approver Role:
                              </span>
                              <span className="font-semibold uppercase text-slate-700 dark:text-slate-300">
                                {po.current_approver_role || "N/A"}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1 text-xs">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              Scope of Supply:
                            </span>
                            <p className="text-slate-600 dark:text-slate-400">
                              {po.scope_of_supply || "Standard institutional procurement supply."}
                            </p>
                          </div>

                          {amendments.length > 0 && (
                            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                <History className="w-3.5 h-3.5 text-amber-500" /> Amendment History
                                ({amendments.length})
                              </div>
                              <div className="space-y-1.5">
                                {amendments.map((am: any) => {
                                  const oldVal = Number(
                                    am.old_value_total ?? am.previous_total_value ?? 0,
                                  );
                                  const newVal = Number(
                                    am.new_value_total ?? am.new_total_value ?? 0,
                                  );
                                  return (
                                    <div
                                      key={am.id}
                                      className="p-2.5 rounded bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                    >
                                      <div>
                                        <span className="font-medium text-slate-800 dark:text-slate-200">
                                          ₹{oldVal.toLocaleString("en-IN")} → ₹
                                          {newVal.toLocaleString("en-IN")}
                                        </span>
                                        <span className="text-slate-500 block sm:inline sm:ml-2">
                                          ({am.reason})
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {am.requires_reapproval ? (
                                          <Badge className="bg-amber-500 text-white text-[10px]">
                                            Re-approval: {roleLabel(am.new_approver_role)}
                                          </Badge>
                                        ) : (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] text-slate-600 dark:text-slate-300"
                                          >
                                            No re-approval needed
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}

                  <PaginationControls
                    currentPage={pagination.page}
                    totalPages={Math.max(1, Math.ceil(filteredOrders.length / pagination.pageSize))}
                    pageSize={pagination.pageSize}
                    totalItems={filteredOrders.length}
                    currentItemsCount={paginatedOrders.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </>
              );
            })()
          )}
        </div>

        {/* Modal: Create PO */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
              <DialogDescription>
                Create a Purchase Order backed by an approved Comparative Statement or Rate
                Contract.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Order Type</Label>
                  <Select value={poType} onValueChange={(val: any) => setPoType(val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular Order (Approved CS)</SelectItem>
                      <SelectItem value="rate_contract">Rate Contract Order</SelectItem>
                      <SelectItem value="direct_purchase">Direct Purchase (Small Value)</SelectItem>
                    </SelectContent>
                  </Select>
                  {poType === "direct_purchase" && (
                    <p className="text-[11px] text-muted-foreground">
                      No minimum number of quotes. Buy from one vendor, or ask several for quotes
                      and pick the lowest.
                    </p>
                  )}
                </div>

                {poType === "regular" && (
                  <div className="space-y-1">
                    <Label>Approved Comparative Statement</Label>
                    <Select value={selectedCsId} onValueChange={setSelectedCsId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select CS..." />
                      </SelectTrigger>
                      <SelectContent>
                        {approvedCss.map((cs) => (
                          <SelectItem key={cs.id} value={cs.id}>
                            {cs.cs_number} — {cs.vendors?.name} (₹
                            {Number(cs.recommended_total).toLocaleString("en-IN")})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {poType === "rate_contract" && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label>Active Rate Contract</Label>
                      <button
                        type="button"
                        onClick={() => navigate({ to: "/procurement/rfqs" })}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                      >
                        + New Contract (via RFQ)
                      </button>
                    </div>
                    <Select
                      value={selectedRcId}
                      onValueChange={(val) => {
                        setSelectedRcId(val);
                        const rc = activeRateContracts.find((c) => c.id === val);
                        if (rc && rc.vendor_id) {
                          setSelectedVendorId(rc.vendor_id);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Rate Contract..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeRateContracts.length === 0 ? (
                          <SelectItem value="_none" disabled>
                            No EVP-approved rate contracts in force
                          </SelectItem>
                        ) : (
                          activeRateContracts.map((rc) => (
                            <SelectItem key={rc.id} value={rc.id}>
                              {rc.contract_number} — {rc.vendors?.name} ({rc.category})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {pendingRateContracts > 0 && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        {pendingRateContracts} rate contract
                        {pendingRateContracts === 1 ? " is" : "s are"} waiting for the EVP's
                        approval and can't be used yet.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {poType === "direct_purchase" && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div
                    role="radiogroup"
                    aria-label="How to choose the vendor"
                    className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-xs font-medium"
                  >
                    {(
                      [
                        ["single", "Buy from one vendor"],
                        ["quotes", "Compare quotes"],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={directMode === mode}
                        onClick={() => setDirectMode(mode)}
                        className={`rounded px-2 py-1.5 transition-colors ${
                          directMode === mode
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Label>Approved Small-Value Requisition *</Label>
                    <Select
                      value={selectedPrId}
                      onValueChange={(val) => {
                        setSelectedPrId(val);
                        const pr = approvedPrs.find((p) => p.id === val);
                        if (pr) {
                          setPrice(Number(pr.estimated_value || 0));
                          setTaxes(0);
                          setScopeOfSupply(
                            (pr.pr_line_items || [])
                              .map(
                                (i: any) => `${i.description} (Qty: ${i.net_qty_to_procure ?? 1})`,
                              )
                              .join(", ") || `Direct purchase against ${pr.pr_number}`,
                          );
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select approved small-value PR..." />
                      </SelectTrigger>
                      <SelectContent>
                        {approvedPrs.filter((p) => p.category === "small_value").length === 0 ? (
                          <SelectItem value="_none" disabled>
                            No approved small-value requisitions without a PO
                          </SelectItem>
                        ) : (
                          approvedPrs
                            .filter((p) => p.category === "small_value")
                            .map((pr) => (
                              <SelectItem key={pr.id} value={pr.id} disabled={!!openRfqByPr[pr.id]}>
                                {pr.pr_number} — {pr.departments?.name || "Dept"} (₹
                                {Number(pr.estimated_value || 0).toLocaleString("en-IN")})
                                {openRfqByPr[pr.id]
                                  ? ` · quotes requested on ${openRfqByPr[pr.id]}`
                                  : ""}
                              </SelectItem>
                            ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {directMode === "quotes" ? (
                    <>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label>Vendors to ask for quotes *</Label>
                          <span className="text-[11px] text-muted-foreground">
                            {quoteVendorIds.length} selected
                          </span>
                        </div>
                        <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                          {vendorsList
                            .filter((v: any) => v.status === "empanelled")
                            .map((v: any) => (
                              <label
                                key={v.id}
                                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-indigo-600"
                                  checked={quoteVendorIds.includes(v.id)}
                                  onChange={(e) =>
                                    setQuoteVendorIds((ids) =>
                                      e.target.checked
                                        ? [...ids, v.id]
                                        : ids.filter((id) => id !== v.id),
                                    )
                                  }
                                />
                                <span className="truncate">{v.name}</span>
                              </label>
                            ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Quotes due by</Label>
                          <Input
                            type="date"
                            min={new Date().toISOString().slice(0, 10)}
                            value={quoteDeadline}
                            onChange={(e) => setQuoteDeadline(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Note to vendors (optional)</Label>
                          <Input
                            value={quoteNotes}
                            onChange={(e) => setQuoteNotes(e.target.value)}
                            placeholder="e.g. Include GST and delivery"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Each vendor gets a private link to quote. No Comparative Statement is
                        needed: once the quotes are in, award the lowest from the RFQ page (choosing
                        anyone else needs a reason).
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label>Vendor *</Label>
                        <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select empanelled vendor..." />
                          </SelectTrigger>
                          <SelectContent>
                            {vendorsList.map((v: any) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex items-start gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-indigo-600"
                          checked={storesConfirmed}
                          onChange={(e) => setStoresConfirmed(e.target.checked)}
                        />
                        <span>
                          I confirmed these items are{" "}
                          <strong>not available in Central Stores</strong>.
                        </span>
                      </label>
                      <div className="space-y-1">
                        <Label className="text-xs">Quotes obtained (optional)</Label>
                        <Input
                          value={quotesNote}
                          onChange={(e) => setQuotesNote(e.target.value)}
                          placeholder="e.g. 2 shop quotes: ₹1,650 (Lenovo), ₹1,720 (Dell)"
                          className="h-8 text-xs"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        The requisition's approval authorises this purchase, so the PO is approved
                        on creation (unless recent orders to the same vendor need a higher
                        approval).
                      </p>
                    </>
                  )}
                </div>
              )}

              {poType === "rate_contract" && (
                <div className="space-y-1">
                  <Label>Approved Purchase Requisition (PR) *</Label>
                  <Select
                    value={selectedPrId}
                    onValueChange={(val) => {
                      setSelectedPrId(val);
                      const pr = approvedPrs.find((p) => p.id === val);
                      if (pr && (!price || price === 0)) {
                        setPrice(Number(pr.estimated_value || 0));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select approved PR to fulfill..." />
                    </SelectTrigger>
                    <SelectContent>
                      {approvedPrs.length === 0 ? (
                        <SelectItem value="_none" disabled>
                          No approved requisitions available
                        </SelectItem>
                      ) : (
                        approvedPrs.map((pr) => (
                          <SelectItem key={pr.id} value={pr.id}>
                            {pr.pr_number} — {pr.category} (₹
                            {Number(pr.estimated_value || 0).toLocaleString("en-IN")})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!(poType === "direct_purchase" && directMode === "quotes") && (
                <>
                  <div className="space-y-1">
                    <Label>Scope of Supply / Order Description</Label>
                    <Textarea
                      value={scopeOfSupply}
                      onChange={(e) => setScopeOfSupply(e.target.value)}
                      placeholder="Detailed specifications, model numbers, deliverables..."
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Base Price (₹)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={price}
                        onChange={(e) =>
                          setPrice(e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Taxes & GST (₹)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={taxes}
                        onChange={(e) =>
                          setTaxes(e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-500">Calculated Total PO Value:</span>
                    <span className="font-mono font-bold whitespace-nowrap text-base text-slate-900 dark:text-white">
                      ₹{(Number(price) + Number(taxes)).toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Delivery Timeline</Label>
                      <Input
                        value={deliveryTimeline}
                        onChange={(e) => setDeliveryTimeline(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Payment Terms</Label>
                      <Input
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                      />
                    </div>
                  </div>

                  {recentPoForVendor && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-semibold">Recent order to this vendor:</span>{" "}
                        <strong className="font-mono">{recentPoForVendor.po_number}</strong> was
                        issued to this vendor in the last 30 days. If this is the same requirement,
                        combine it into one order. Splitting it to stay under an approval limit
                        isn't allowed.
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              {poType === "direct_purchase" && directMode === "quotes" ? (
                <Button
                  onClick={handleRequestQuotes}
                  disabled={creating || !selectedPrId || quoteVendorIds.length < 2}
                  className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Send className="w-4 h-4" />
                  {creating ? "Sending..." : `Send quote requests (${quoteVendorIds.length})`}
                </Button>
              ) : (
                <Button
                  onClick={handleCreatePo}
                  disabled={
                    creating ||
                    !selectedPrId ||
                    Number(price) <= 0 ||
                    (poType === "direct_purchase" && !storesConfirmed)
                  }
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {creating
                    ? "Creating..."
                    : poType === "direct_purchase"
                      ? "Create Purchase Order"
                      : "Create & Route for Approval"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Amend PO */}
        <Dialog open={amendOpen} onOpenChange={setAmendOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Amend Purchase Order Value</DialogTitle>
              <DialogDescription>
                Order amendments that breach the original approver's matrix limit trigger automatic
                re-approval at the higher tier.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded text-xs">
                <span className="text-slate-500 block">Current Total Value:</span>
                <span className="font-mono font-bold whitespace-nowrap text-sm text-slate-800 dark:text-slate-200">
                  ₹
                  {(Number(activePo?.price || 0) + Number(activePo?.taxes || 0)).toLocaleString(
                    "en-IN",
                  )}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>New Price (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newPrice}
                    onChange={(e) =>
                      setNewPrice(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>New Taxes (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newTaxes}
                    onChange={(e) =>
                      setNewTaxes(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Amendment Justification / Reason</Label>
                <Textarea
                  placeholder="Detailed justification for value change..."
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAmendOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAmendPo}
                disabled={amending || !amendReason.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {amending ? "Amending..." : "Submit Amendment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Formal Institutional Print Preview & PDF Modal */}
        <PoPrintPreviewModal open={printOpen} onOpenChange={setPrintOpen} po={selectedPoForPrint} />
      </div>
    </Layout>
  );
}
