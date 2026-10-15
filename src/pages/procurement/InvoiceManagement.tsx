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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { supabase } from "@/integrations/supabase/client";
import {
  submitInvoice,
  runThreeWayMatch,
  approveInvoice,
  recordPayment,
  listInvoices,
} from "@/lib/procurement/invoice.functions";
import { listPurchaseOrders } from "@/lib/procurement/po.functions";
import { listGrns } from "@/lib/procurement/grn.functions";
import {
  Receipt,
  PlusCircle,
  CheckCircle2,
  AlertOctagon,
  CreditCard,
  RefreshCw,
  FileCheck,
  ShieldCheck,
  Scale,
  DollarSign,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function InvoiceManagement() {
  const { toast } = useToast();
  const auth = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const { pagination, setPage, setPageSize, setTotal } = usePagination(10, 1);
  const [pos, setPos] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter tabs
  const [statusFilter, setStatusFilter] = useState("active");

  // Submit Invoice Modal
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [selectedGrnId, setSelectedGrnId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [vendorGstin, setVendorGstin] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState<number | "">(0);
  const [isServicePo, setIsServicePo] = useState(false);
  const [serviceCertUrl, setServiceCertUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Payment Modal
  const [payOpen, setPayOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<any>(null);
  const [payAmount, setPayAmount] = useState<number | "">(0);
  const [paymentMode, setPaymentMode] = useState<
    "bank_transfer" | "neft" | "rtgs" | "cheque" | "upi"
  >("bank_transfer");
  const [externalRef, setExternalRef] = useState("");
  const [paymentTermsRef, setPaymentTermsRef] = useState("Immediate RTGS");
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [paying, setPaying] = useState(false);

  // Action state
  const [acting, setActing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invRes, poRes, grnRes] = await Promise.all([
        (listInvoices as any)(),
        (listPurchaseOrders as any)(),
        (listGrns as any)(),
      ]);

      if (invRes?.ok) {
        const list = invRes.invoices || [];
        setInvoices(list);
        setTotal(list.length);
      }
      if (poRes?.ok) setPos(poRes.purchaseOrders || []);
      if (grnRes?.ok) setGrns(grnRes.grns || []);
    } catch (e: any) {
      toast({ title: "Error loading data", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When PO selection changes in Submit Invoice Modal
  useEffect(() => {
    if (!selectedPoId) {
      setVendorGstin("");
      return;
    }
    const po = pos.find((p) => p.id === selectedPoId);
    if (po) {
      const gstinVal = po.vendors?.gst_number || po.vendors?.gstin || "";
      setVendorGstin(gstinVal);
      const matchedGrn = grns.find(
        (g) =>
          g.po_id === selectedPoId && (g.status === "accepted" || g.status === "partially_accepted"),
      );
      if (matchedGrn) {
        setSelectedGrnId(matchedGrn.id);
        setInvoiceAmount(Number(matchedGrn.accepted_value || po.total_value || 0));
      } else {
        setSelectedGrnId("");
        setInvoiceAmount(Number(po.total_value || 0));
      }
    }
  }, [selectedPoId, pos, grns]);

  const handleSubmitInvoice = async () => {
    if (!selectedPoId || !invoiceNumber.trim() || Number(invoiceAmount) <= 0) {
      toast({
        title: "Validation Error",
        description: "Please complete all required fields.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await (submitInvoice as any)({
        data: {
          po_id: selectedPoId,
          grn_id: isServicePo ? null : selectedGrnId || null,
          invoice_number: invoiceNumber,
          invoice_amount: Number(invoiceAmount || 0),
          gst_details_json: {
            gstin: vendorGstin.trim(),
          },
          is_service_po: isServicePo,
          service_completion_cert_url: serviceCertUrl || null,
        },
      });

      if (!res.ok) {
        toast({
          title: "Invoice Submission Blocked",
          description: res.error,
          variant: "destructive",
        });
        return;
      }

      if (res.matchStatus === "matched") {
        toast({
          title: "Three-Way Match Passed",
          description: `Invoice ${res.invoice.invoice_number} matched PO and GRN values. Ready for approval.`,
        });
      } else {
        toast({
          title: "Invoice Placed On Hold",
          description: `Discrepancy detected: ${res.holdReason}`,
          variant: "destructive",
        });
      }

      setSubmitOpen(false);
      setInvoiceNumber("");
      setVendorGstin("");
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (inv: any) => {
    setActing(true);
    try {
      const res = await (approveInvoice as any)({
        data: { invoice_id: inv.id },
      });

      if (!res.ok) {
        toast({ title: "Approval Blocked", description: res.error, variant: "destructive" });
        return;
      }

      toast({
        title: "Invoice Approved",
        description: `Invoice ${inv.invoice_number} approved for payment.`,
      });
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleOpenPay = (inv: any) => {
    setActiveInvoice(inv);
    setPayAmount(Number(inv.invoice_amount || 0));
    setExternalRef(`UTR-${Date.now().toString().slice(-8)}`);
    const poNum = inv.purchase_orders?.po_number || "";
    setPaymentRemarks(
      poNum
        ? `Full and final settlement against ${poNum}`
        : `Full and final settlement against ${inv.invoice_number}`,
    );
    setPayOpen(true);
  };

  const handleRecordPayment = async () => {
    const amountNum = Number(payAmount || 0);
    if (!activeInvoice || amountNum <= 0) return;
    setPaying(true);
    try {
      const res = await (recordPayment as any)({
        data: {
          invoice_id: activeInvoice.id,
          amount: amountNum,
          payment_mode: paymentMode,
          payment_terms_ref: paymentRemarks.trim() || paymentTermsRef,
          external_ref: externalRef,
          remarks: paymentRemarks.trim(),
        },
      });

      if (!res.ok) {
        toast({
          title: "Payment Recording Failed",
          description: res.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Payment Recorded & Settled",
        description: `Payment of ₹${Number(payAmount).toLocaleString("en-IN")} logged. PO settlement status updated.`,
      });
      setPayOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };

  const invoiceFilterOptions = statusFilterOptions(invoices, (i: any) => i.match_status, ["paid", "rejected"], {
    matched: "Matched (ready to approve)",
    on_hold: "On Hold",
    approved: "Approved for Payment",
  });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 mb-2">
              <Receipt className="w-3.5 h-3.5" /> Finance Three-Way Match & Payment Gate
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Invoices & Three-Way Match Verification
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Verify Purchase Order (PO) ↔ Goods Receipt Note (GRN) ↔ Invoice agreement before
              payment release.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {(auth.hasRole("admin") || auth.hasRole("finance")) && (
              <Button
                onClick={() => setSubmitOpen(true)}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                <PlusCircle className="w-4 h-4" /> Submit Invoice
              </Button>
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
          options={invoiceFilterOptions}
          title="Filter invoices"
        />

        {/* Invoices List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <Card className="text-center p-8">
              <p className="text-slate-500">
                No invoices submitted yet. Submit an invoice against an issued Purchase Order.
              </p>
            </Card>
          ) : (
            (() => {
              const filteredInvoices = applyFilter(invoices, invoiceFilterOptions, statusFilter);

              if (filteredInvoices.length === 0) {
                return (
                  <Card className="text-center p-8">
                    <p className="text-slate-500">
                      No invoices found under the selected &quot;{invoiceFilterOptions.find((o) => o.id === statusFilter)?.label}&quot; status filter.
                    </p>
                  </Card>
                );
              }

              const startIndex = (pagination.page - 1) * pagination.pageSize;
              const paginatedInvoices = filteredInvoices.slice(
                startIndex,
                startIndex + pagination.pageSize,
              );
              const totalPages = Math.ceil(filteredInvoices.length / pagination.pageSize);

              return (
                <>
                  {paginatedInvoices.map((inv) => {
                    const po = inv.purchase_orders;
                    const grn = inv.grns;
                    const isMatched = inv.match_status === "matched";
                    const isOnHold = inv.match_status === "on_hold";
                    const isApproved = inv.match_status === "approved";
                    const isPaid = inv.match_status === "paid";
                    const poVal = Number(po?.total_value || 0);
                    const grnVal = Number(grn?.accepted_value || 0);
                    const invVal = Number(inv.invoice_amount || 0);

                    const prNumber =
                      (Array.isArray(po?.purchase_requisitions)
                        ? po?.purchase_requisitions[0]?.pr_number
                        : po?.purchase_requisitions?.pr_number) ||
                      po?.pr_number ||
                      "—";

                    const grnNumber =
                      grn?.grn_number ||
                      (inv.is_service_po ? "Service Certificate" : "—");

                    const gstin =
                      inv.gst_details_json?.gstin ||
                      inv.vendors?.gst_number ||
                      "—";

                    // Re-evaluate reconciliation from actual values at render time.
                    const exceedsGrn = !inv.is_service_po && grn && invVal > grnVal + 1;
                    const exceedsPo = invVal > poVal + 1;
                    const hasValueMismatch = exceedsGrn || exceedsPo;
                    const reconciliationLabel = (() => {
                      if (isPaid)
                        return {
                          icon: "💰",
                          text: "Settled",
                          cls: "text-indigo-700 dark:text-indigo-300",
                        };
                      if (isApproved)
                        return {
                          icon: "✅",
                          text: "Approved for Disbursement",
                          cls: "text-emerald-700 dark:text-emerald-300",
                        };
                      if (hasValueMismatch)
                        return {
                          icon: "❌",
                          text: "Amount Mismatch — Not Reconciled",
                          cls: "text-red-700 dark:text-red-400 font-semibold",
                        };
                      if (isMatched)
                        return {
                          icon: "✅",
                          text: "Fully Reconciled",
                          cls: "text-emerald-700 dark:text-emerald-300",
                        };
                      if (isOnHold)
                        return {
                          icon: "⚠️",
                          text: "Verification Hold",
                          cls: "text-amber-700 dark:text-amber-400",
                        };
                      return { icon: "⏳", text: "Pending", cls: "text-slate-500" };
                    })();

                    return (
                      <Card
                        key={inv.id}
                        className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300"
                      >
                        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold whitespace-nowrap text-base text-slate-900 dark:text-slate-100">
                                  Invoice: {inv.invoice_number}
                                </span>
                                <Badge
                                  variant={
                                    isPaid
                                      ? "default"
                                      : isApproved
                                        ? "secondary"
                                        : isMatched
                                          ? "outline"
                                          : "destructive"
                                  }
                                >
                                  {inv.match_status.toUpperCase()}
                                </Badge>
                                {inv.is_service_po && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs text-blue-600 border-blue-400"
                                  >
                                    Service PO (Completion Certificate)
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span>
                                  Vendor:{" "}
                                  <strong className="text-slate-700 dark:text-slate-300">
                                    {inv.vendors?.name || "Direct"}
                                  </strong>
                                </span>
                                <span>•</span>
                                <span>
                                  PO:{" "}
                                  <strong className="font-mono text-slate-700 dark:text-slate-300">
                                    {po?.po_number || "—"}
                                  </strong>
                                </span>
                                <span>•</span>
                                <span>
                                  PR:{" "}
                                  <strong className="font-mono text-slate-700 dark:text-slate-300">
                                    {prNumber}
                                  </strong>
                                </span>
                                <span>•</span>
                                <span>
                                  GRN:{" "}
                                  <strong className="font-mono text-slate-700 dark:text-slate-300">
                                    {grnNumber}
                                  </strong>
                                </span>
                                <span>•</span>
                                <span>
                                  GSTIN:{" "}
                                  <strong className="font-mono text-slate-700 dark:text-slate-300">
                                    {gstin}
                                  </strong>
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {(auth.hasRole("admin") || auth.hasRole("finance")) && (
                                <>
                                  {isMatched && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleApprove(inv)}
                                      disabled={acting}
                                      className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve Invoice
                                    </Button>
                                  )}
                                  {isApproved && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleOpenPay(inv)}
                                      disabled={acting}
                                      className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                                    >
                                      <CreditCard className="w-3.5 h-3.5" /> Record Payment
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4 text-sm space-y-3">
                          {/* Visual Three-Way Match Comparator */}
                          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                              <span className="flex items-center gap-1.5">
                                <Scale className="w-4 h-4 text-indigo-500" /> Three-Way Verification
                                Matrix
                              </span>
                              <span className={reconciliationLabel.cls}>
                                {reconciliationLabel.icon} {reconciliationLabel.text}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {/* 1. PO */}
                              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border">
                                <span className="text-slate-400 block text-[11px]">
                                  1. PO Authorised Value
                                </span>
                                <span className="font-mono font-bold whitespace-nowrap text-sm text-slate-800 dark:text-slate-100">
                                  ₹{poVal.toLocaleString("en-IN")}
                                </span>
                                <span className="text-[10px] text-slate-500 block mt-0.5">
                                  PO: {po?.po_number || "—"} • PR: {prNumber}
                                </span>
                              </div>

                              {/* 2. GRN */}
                              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border">
                                <span className="text-slate-400 block text-[11px]">
                                  2. GRN Accepted Value
                                </span>
                                <span className="font-mono font-bold whitespace-nowrap text-sm text-slate-800 dark:text-slate-100">
                                  {inv.is_service_po
                                    ? "N/A (Service)"
                                    : `₹${grnVal.toLocaleString("en-IN")}`}
                                </span>
                                <span className="text-[10px] text-slate-500 block mt-0.5">
                                  GRN: {grnNumber} {grn?.status ? `(${grn.status})` : ""}
                                </span>
                              </div>

                              {/* 3. Invoice */}
                              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border">
                                <span className="text-slate-400 block text-[11px]">
                                  3. Claimed Invoice Amount
                                </span>
                                <span className="font-mono font-bold whitespace-nowrap text-sm text-slate-800 dark:text-slate-100">
                                  ₹{invVal.toLocaleString("en-IN")}
                                </span>
                                <span className="text-[10px] text-slate-500 block mt-0.5">
                                  Invoice: {inv.invoice_number}
                                </span>
                              </div>
                            </div>

                            {/* Hold reason message (from DB) */}
                            {isOnHold && inv.hold_reason && (
                              <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 rounded-lg text-xs text-red-900 dark:text-red-200 flex items-start gap-2">
                                <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-semibold">Match Discrepancy / Hold: </span>
                                  {inv.hold_reason}
                                </div>
                              </div>
                            )}

                            {/* Value mismatch warning — caught at render time */}
                            {hasValueMismatch && (
                              <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 rounded-lg text-xs text-red-900 dark:text-red-200 flex items-start gap-2">
                                <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-semibold">Three-Way Match Failed: </span>
                                  {exceedsGrn
                                    ? `Invoice amount ₹${invVal.toLocaleString("en-IN")} exceeds GRN accepted value ₹${grnVal.toLocaleString("en-IN")}. Payment should not be released.`
                                    : `Invoice amount ₹${invVal.toLocaleString("en-IN")} exceeds PO authorised value ₹${poVal.toLocaleString("en-IN")}.`}
                                </div>
                              </div>
                            )}

                            {/* Payment Settlement Details (when Paid) */}
                            {isPaid && inv.payments && inv.payments.length > 0 && (
                              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs space-y-1.5 mt-2">
                                <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 font-semibold">
                                  <span className="flex items-center gap-1.5">
                                    <CreditCard className="w-4 h-4 text-emerald-600" /> Payment
                                    Voucher Settled
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-emerald-700 border-emerald-400 bg-white dark:bg-slate-900 text-[10px]"
                                  >
                                    {(
                                      inv.payments[0].payment_mode || "bank_transfer"
                                    ).toUpperCase()}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-600 dark:text-slate-400 pt-1">
                                  <div>
                                    <span className="text-slate-400 block text-[10px]">
                                      Disbursed Amount
                                    </span>
                                    <span className="font-mono font-bold whitespace-nowrap text-slate-800 dark:text-slate-100 text-xs">
                                      ₹
                                      {Number(
                                        inv.payments[0].amount || invVal,
                                      ).toLocaleString("en-IN")}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block text-[10px]">
                                      Transaction / UTR Ref
                                    </span>
                                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 text-xs">
                                      {inv.payments[0].external_ref || "—"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block text-[10px]">
                                      Disbursement Date
                                    </span>
                                    <span className="text-slate-700 dark:text-slate-300 text-xs">
                                      {inv.payments[0].paid_at
                                        ? new Date(inv.payments[0].paid_at).toLocaleString()
                                        : "Settled"}
                                    </span>
                                  </div>
                                </div>
                                {inv.payments[0].payment_terms_ref && (
                                  <div className="pt-1 border-t border-emerald-100 dark:border-emerald-900/60 text-[11px] text-slate-600 dark:text-slate-300">
                                    <span className="font-semibold text-slate-500">Remarks: </span>
                                    {inv.payments[0].payment_terms_ref}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}

                  <PaginationControls
                    currentPage={pagination.page}
                    totalPages={totalPages || 1}
                    pageSize={pagination.pageSize}
                    totalItems={filteredInvoices.length}
                    currentItemsCount={paginatedInvoices.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </>
              );
            })()
          )}
        </div>

        {/* Modal: Submit Invoice */}
        <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Submit Vendor Invoice</DialogTitle>
              <DialogDescription>
                Finance entry for vendor invoice with automatic 3-way match validation.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Issued Purchase Order</Label>
                <Select value={selectedPoId} onValueChange={setSelectedPoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select PO..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pos
                      .filter((p) => {
                        // Exclude closed, cancelled, or rejected POs
                        if (
                          p.status === "closed" ||
                          p.status === "cancelled" ||
                          p.status === "rejected"
                        )
                          return false;

                        // Exclude POs that already have an invoice submitted, approved, or paid
                        const alreadyInvoiced = invoices.some(
                          (inv: any) => inv.po_id === p.id && inv.match_status !== "rejected",
                        );
                        if (alreadyInvoiced) return false;

                        // If goods PO, must have an accepted GRN (or partially accepted)
                        const isService = p.type === "service" || p.po_type === "service";
                        if (!isService) {
                          const hasAcceptedGrn = grns.some(
                            (g) =>
                              g.po_id === p.id &&
                              (g.status === "accepted" || g.status === "partially_accepted"),
                          );
                          if (!hasAcceptedGrn) return false;
                        } else {
                          // Service PO must be issued or approved
                          if (p.status !== "issued" && p.status !== "approved") return false;
                        }
                        return true;
                      })
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.po_number} — {p.vendors?.name} (₹
                          {Number(p.total_value).toLocaleString("en-IN")})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPoId &&
                (() => {
                  const po = pos.find((p) => p.id === selectedPoId);
                  const poPr =
                    (Array.isArray(po?.purchase_requisitions)
                      ? po?.purchase_requisitions[0]?.pr_number
                      : po?.purchase_requisitions?.pr_number) ||
                    po?.pr_number ||
                    "—";
                  const matchedGrn = grns.find(
                    (g) =>
                      g.po_id === selectedPoId &&
                      (g.status === "accepted" || g.status === "partially_accepted"),
                  );
                  return (
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border text-xs space-y-1 text-slate-600 dark:text-slate-400">
                      <div>
                        Linked PO:{" "}
                        <strong className="font-mono text-slate-800 dark:text-slate-200">
                          {po?.po_number}
                        </strong>
                      </div>
                      <div>
                        Linked PR:{" "}
                        <strong className="font-mono text-slate-800 dark:text-slate-200">
                          {poPr}
                        </strong>
                      </div>
                      {!isServicePo && (
                        <div>
                          Goods Receipt Note:{" "}
                          <strong className="font-mono text-slate-800 dark:text-slate-200">
                            {matchedGrn
                              ? `${matchedGrn.grn_number} (Accepted: ₹${Number(
                                  matchedGrn.accepted_value || 0,
                                ).toLocaleString("en-IN")})`
                              : "No accepted GRN found"}
                          </strong>
                        </div>
                      )}
                    </div>
                  );
                })()}

              <div className="space-y-1">
                <Label>Vendor Invoice Number</Label>
                <Input
                  placeholder="e.g. INV-2026-0042"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Vendor GSTIN</Label>
                <Input
                  placeholder="e.g. 29AAACL1965L1Z1"
                  value={vendorGstin}
                  onChange={(e) => setVendorGstin(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Claimed Invoice Amount (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={invoiceAmount}
                  onChange={(e) =>
                    setInvoiceAmount(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="srv-po"
                  checked={isServicePo}
                  onCheckedChange={(c) => setIsServicePo(!!c)}
                />
                <Label htmlFor="srv-po" className="text-xs cursor-pointer">
                  Service / AMC PO (Completion certificate in lieu of GRN)
                </Label>
              </div>

              {isServicePo && (
                <div className="space-y-1">
                  <Label>Service Completion Certificate Reference / URL</Label>
                  <Input
                    placeholder="e.g. CERT-AMC-2026-01"
                    value={serviceCertUrl}
                    onChange={(e) => setServiceCertUrl(e.target.value)}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSubmitOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitInvoice}
                disabled={submitting || !selectedPoId || !invoiceNumber.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submitting ? "Verifying..." : "Submit & Run 3-Way Match"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Record Payment */}
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record Payment Release</DialogTitle>
              <DialogDescription>
                Release payment for approved invoice {activeInvoice?.invoice_number}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded text-xs flex justify-between items-center">
                <span className="text-slate-500">Approved Invoice Amount:</span>
                <span className="font-mono font-bold whitespace-nowrap text-sm text-slate-800 dark:text-slate-100">
                  ₹{Number(activeInvoice?.invoice_amount || 0).toLocaleString("en-IN")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Payment Mode</Label>
                  <Select value={paymentMode} onValueChange={(v: any) => setPaymentMode(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer / NEFT</SelectItem>
                      <SelectItem value="rtgs">RTGS</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI / Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Payment Amount (₹)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={payAmount}
                    onChange={(e) =>
                      setPayAmount(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Bank UTR / Transaction Reference</Label>
                <Input
                  placeholder="e.g. UTR-9876543210"
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Payment Remarks / Settlement Note</Label>
                <Textarea
                  rows={2}
                  placeholder="e.g. Full and final settlement against PO-2026-____"
                  value={paymentRemarks}
                  onChange={(e) => setPaymentRemarks(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPayOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRecordPayment}
                disabled={paying || Number(payAmount) <= 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {paying ? "Releasing..." : "Confirm Payment Release"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
