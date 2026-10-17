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
import { createRfq, sendRfq, listRfqs, awardDirectPurchase } from "@/lib/procurement/rfq.functions";
import { dispatchRfqEmail } from "@/lib/procurement/email.functions";
import {
  Send,
  PlusCircle,
  FileText,
  Building2,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Eye,
  Copy,
  Award,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { computeVendorAccessToken } from "@/lib/quotationAuth";

export default function RfqManagement() {
  const { toast } = useToast();
  const auth = useAuth();
  const [rfqs, setRfqs] = useState<any[]>([]);
  const { pagination, setPage, setPageSize, setTotal } = usePagination(10, 1);
  const [approvedPrs, setApprovedPrs] = useState<any[]>([]);
  const [empanelledVendors, setEmpanelledVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rfqFilter, setRfqFilter] = useState("active");

  // Create RFQ Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPrId, setSelectedPrId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

  // Send RFQ Modal
  const [sendOpen, setSendOpen] = useState(false);
  const [activeRfq, setActiveRfq] = useState<any>(null);
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  // Direct purchase award (no CS)
  const [awardRfq, setAwardRfq] = useState<any>(null);
  const [awardVendorId, setAwardVendorId] = useState("");
  const [awardReason, setAwardReason] = useState("");
  const [awardStoresChecked, setAwardStoresChecked] = useState(false);
  const [awarding, setAwarding] = useState(false);

  // Record Quote Modal

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await (listRfqs as any)();
      if (res?.ok) {
        const list = res.rfqs || [];
        setRfqs(list);
        setTotal(list.length);
      }

      // Fetch approved PRs
      const { data: prData } = await supabase
        .from("purchase_requisitions")
        .select("id, pr_number, category, scope, estimated_value, status, justification")
        .eq("status", "approved");
      setApprovedPrs(prData || []);

      // Fetch empanelled vendors
      const { data: vData } = await supabase
        .from("vendors")
        .select("id, name, gst_number, status, empanelment_expiry")
        .eq("status", "empanelled");
      setEmpanelledVendors(vData || []);
    } catch (e: any) {
      toast({ title: "Error loading data", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateRfq = async () => {
    if (!selectedPrId) {
      toast({
        title: "Validation Error",
        description: "Please select an approved requisition.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const res = await (createRfq as any)({
        data: {
          pr_id: selectedPrId,
          response_deadline: deadline || null,
          notes: notes || null,
        },
      });

      if (!res.ok) {
        toast({ title: "Failed to create RFQ", description: res.error, variant: "destructive" });
        return;
      }

      toast({ title: "RFQ Created", description: `RFQ created with status "${res.rfq.status}".` });
      setCreateOpen(false);
      setSelectedPrId("");
      setDeadline("");
      setNotes("");
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  /** One row per vendor that quoted: total, slowest line's delivery days, name. Lowest first. */
  const quoteSummary = (rfq: any) => {
    const byVendor = new Map<
      string,
      { vendorId: string; name: string; total: number; days: number }
    >();
    for (const l of rfq?.quotation_lines ?? []) {
      const name =
        rfq.rfq_vendors?.find((rv: any) => rv.vendor_id === l.vendor_id)?.vendors?.name ?? "Vendor";
      const row = byVendor.get(l.vendor_id) ?? { vendorId: l.vendor_id, name, total: 0, days: 0 };
      row.total += Number(l.total_price || 0);
      row.days = Math.max(row.days, Number(l.delivery_days || 0));
      byVendor.set(l.vendor_id, row);
    }
    return [...byVendor.values()].sort((a, b) => a.total - b.total);
  };

  const handleOpenAward = (rfq: any) => {
    setAwardRfq(rfq);
    setAwardVendorId(quoteSummary(rfq)[0]?.vendorId ?? "");
    setAwardReason("");
    setAwardStoresChecked(false);
  };

  const handleAward = async () => {
    if (!awardRfq || !awardVendorId) return;
    setAwarding(true);
    try {
      const res = await (awardDirectPurchase as any)({
        data: {
          rfq_id: awardRfq.id,
          vendor_id: awardVendorId,
          justification: awardReason,
          stores_confirmed: awardStoresChecked,
        },
      });
      if (!res.ok) {
        toast({ title: "Could not award", description: res.error, variant: "destructive" });
        return;
      }
      toast({
        title: "Purchase Order Created",
        description:
          res.po.status === "approved"
            ? `${res.po.po_number} is approved on the requisition's authority and ready to issue.`
            : `${res.po.po_number} sent for ${String(res.po.current_approver_role).replace(/_/g, " ").toUpperCase()} approval.`,
      });
      setAwardRfq(null);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAwarding(false);
    }
  };

  const handleOpenSend = (rfq: any) => {
    setActiveRfq(rfq);
    setSelectedVendorIds(rfq.rfq_vendors?.map((v: any) => v.vendor_id) || []);
    setSendOpen(true);
  };

  const handleCopyVendorLink = async (rfqId: string, vendorId: string, vendorName?: string) => {
    try {
      const token = await computeVendorAccessToken(rfqId, vendorId);
      const url = `${window.location.origin}/quotation/${rfqId}?vendorId=${vendorId}&token=${token}`;
      await navigator.clipboard.writeText(url);
      toast({
        title: "Vendor Link Copied",
        description: `Private quotation link for ${vendorName || "vendor"} copied to clipboard.`,
      });
    } catch (err) {
      console.error("Failed to copy link:", err);
      toast({
        title: "Copy Failed",
        description: "Could not copy link to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleSendRfq = async () => {
    if (!activeRfq) return;
    const minReq = activeRfq.required_min_quotations || 3;
    if (selectedVendorIds.length < minReq) {
      toast({
        title: "Insufficient Vendors",
        description: `Institutional Procurement Rules require at least ${minReq} empanelled vendors (currently selected ${selectedVendorIds.length}).`,
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const res = await (sendRfq as any)({
        data: {
          rfq_id: activeRfq.id,
          vendor_ids: selectedVendorIds,
        },
      });

      if (!res.ok) {
        toast({ title: "Failed to send RFQ", description: res.error, variant: "destructive" });
        return;
      }

      // Dispatch quotation invitation emails using Edge Function
      let emailsDispatched = 0;
      let emailNotice = "";
      const noEmailVendors: string[] = [];

      if (res.vendors && res.vendors.length > 0) {
        for (const v of res.vendors) {
          const vEmail = (v.bank_details_json as any)?.email;
          const token = await computeVendorAccessToken(res.rfqId, v.id);
          const publicQuotationUrl = `${window.location.origin}/quotation/${res.rfqId}?vendorId=${v.id}&token=${token}`;

          if (vEmail) {
            try {
              const emailRes = await (dispatchRfqEmail as any)({
                data: {
                  rfq_id: res.rfqId,
                  vendor_id: v.id,
                  quotation_url: publicQuotationUrl,
                },
              });

              if (emailRes && emailRes.ok) {
                emailsDispatched++;
              } else {
                emailNotice = emailRes?.error || "Email delivery failed";
              }
            } catch (callErr: any) {
              emailNotice = callErr?.message;
            }
          } else {
            noEmailVendors.push(v.name);
          }
        }
      }
      if (noEmailVendors.length > 0) {
        const missing = `No email on file for: ${noEmailVendors.join(", ")}`;
        emailNotice = emailNotice ? `${emailNotice}. ${missing}` : missing;
      }

      toast({
        title: "RFQ Dispatched",
        description:
          emailsDispatched > 0
            ? `RFQ sent to ${res.sentCount} vendors. Dispatched ${emailsDispatched} invitation emails.`
            : emailNotice
              ? `RFQ sent to ${res.sentCount} vendors. Email notice: ${emailNotice}. You can copy private links directly from each vendor badge.`
              : `RFQ sent to ${res.sentCount} vendors. Quotation links generated and ready to copy.`,
      });
      setSendOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const rfqFilterOptions = statusFilterOptions(rfqs, (r: any) => r.status, ["closed", "cancelled"]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 mb-2">
              <FileText className="w-3.5 h-3.5" /> Request For Quotations
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              RFQ & Vendor Solicitations
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Create RFQs against approved PRs, invite empanelled vendors, and capture line-item
              quotations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(auth.hasRole("admin") ||
              auth.hasRole("procurement_officer") ||
              auth.hasRole("procurement_executive")) && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              >
                <PlusCircle className="w-4 h-4" /> Create RFQ
              </Button>
            )}
          </div>
        </div>

        {/* Status filter */}
        <FilterSelect
          value={rfqFilter}
          onChange={(v) => {
            setRfqFilter(v);
            setPage(1);
          }}
          options={rfqFilterOptions}
          title="Filter RFQs"
        />

        {/* RFQ List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading RFQs...</div>
          ) : rfqs.length === 0 ? (
            <Card className="text-center p-8">
              <p className="text-slate-500">
                No RFQs created yet. Create one from an approved Purchase Requisition.
              </p>
            </Card>
          ) : (
            (() => {
              const filteredRfqs = applyFilter(rfqs, rfqFilterOptions, rfqFilter);
              if (filteredRfqs.length === 0)
                return (
                  <Card className="text-center p-8 text-sm text-muted-foreground">
                    No RFQs match this filter. Choose History or All to see others.
                  </Card>
                );
              const startIndex = (pagination.page - 1) * pagination.pageSize;
              const paginatedRfqs = filteredRfqs.slice(
                startIndex,
                startIndex + pagination.pageSize,
              );
              return (
                <>
                  {paginatedRfqs.map((rfq) => {
                    const vendorsCount = rfq.rfq_vendors?.length || 0;
                    const responsesCount =
                      rfq.rfq_vendors?.filter((v: any) => v.response_received_at)?.length || 0;
                    const minReq = rfq.required_min_quotations || 3;
                    const pr = rfq.purchase_requisitions;

                    return (
                      <Card
                        key={rfq.id}
                        className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300"
                      >
                        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold whitespace-nowrap text-base text-slate-900 dark:text-slate-100">
                                  {rfq.rfq_number || "RFQ-PENDING"}
                                </span>
                                <Badge
                                  variant={
                                    rfq.status === "sent"
                                      ? "default"
                                      : rfq.status === "closed"
                                        ? "secondary"
                                        : "outline"
                                  }
                                >
                                  {rfq.status.toUpperCase()}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Min {minReq} Quotes Required
                                </Badge>
                                {rfq.is_direct && (
                                  <Badge className="text-xs bg-teal-100 text-teal-800 hover:bg-teal-100 dark:bg-teal-950 dark:text-teal-300">
                                    Direct purchase · no CS
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">
                                PR Ref:{" "}
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {pr?.pr_number || "PR"}
                                </span>{" "}
                                • Category: {pr?.category} • Est. Value: ₹
                                {Number(pr?.estimated_value || 0).toLocaleString("en-IN")}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {(auth.hasRole("admin") ||
                                auth.hasRole("procurement_officer") ||
                                auth.hasRole("procurement_executive")) && (
                                <>
                                  {rfq.status === "draft" && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleOpenSend(rfq)}
                                      className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      <Send className="w-3.5 h-3.5" /> Invite Vendors
                                    </Button>
                                  )}
                                  {rfq.status === "sent" &&
                                    rfq.is_direct &&
                                    (auth.hasRole("admin") ||
                                      auth.hasRole("procurement_officer")) && (
                                      <Button
                                        size="sm"
                                        onClick={() => handleOpenAward(rfq)}
                                        disabled={quoteSummary(rfq).length === 0}
                                        title={
                                          quoteSummary(rfq).length === 0
                                            ? "Waiting for vendor quotations"
                                            : "Choose a vendor and create the purchase order"
                                        }
                                        className="gap-1 bg-teal-600 hover:bg-teal-700 text-white"
                                      >
                                        <Award className="w-3.5 h-3.5" /> Award PO
                                      </Button>
                                    )}
                                </>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4 text-sm space-y-3">
                          {/* Scope */}
                          <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-2.5 rounded border">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              Scope of Requirement:{" "}
                            </span>
                            {pr?.scope || "Requisitioned goods/services."}
                          </div>

                          {/* Stats */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded border text-center">
                              <span className="text-slate-400 block text-[10px]">
                                Invited Vendors
                              </span>
                              <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                                {vendorsCount}
                              </span>
                            </div>
                            <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded border text-center">
                              <span className="text-slate-400 block text-[10px]">
                                Quotes Received
                              </span>
                              <span
                                className={`font-bold text-sm ${responsesCount >= minReq ? "text-emerald-600" : "text-amber-600"}`}
                              >
                                {responsesCount} / {minReq}
                              </span>
                            </div>
                            <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded border text-center">
                              <span className="text-slate-400 block text-[10px]">
                                Response Deadline
                              </span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {rfq.response_deadline
                                  ? new Date(rfq.response_deadline).toLocaleDateString()
                                  : "Open"}
                              </span>
                            </div>
                            <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded border text-center">
                              <span className="text-slate-400 block text-[10px]">
                                Minimum Quotes
                              </span>
                              <span
                                className={`font-semibold text-xs ${responsesCount >= minReq ? "text-emerald-600" : "text-amber-600"}`}
                              >
                                {responsesCount >= minReq ? "✓ Quorum Met" : "⏳ Pending Bids"}
                              </span>
                            </div>
                          </div>

                          {/* Vendor responses preview */}
                          {rfq.rfq_vendors && rfq.rfq_vendors.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Invited Empanelled Vendors:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {rfq.rfq_vendors.map((rv: any) => (
                                  <div
                                    key={rv.id}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                                      rv.response_received_at
                                        ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50"
                                        : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800"
                                    }`}
                                  >
                                    <Building2 className="w-3.5 h-3.5 opacity-70" />
                                    <span className="font-medium">
                                      {rv.vendors?.name || "Vendor"}
                                    </span>
                                    {rv.response_received_at ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold ml-1">
                                        <CheckCircle className="w-3 h-3" /> Submitted
                                      </span>
                                    ) : (
                                      <div className="inline-flex items-center gap-1 ml-1">
                                        <span className="text-[11px] text-amber-600 dark:text-amber-400">
                                          <Clock className="w-3 h-3 inline mr-0.5" /> Pending
                                        </span>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-5 px-1.5 text-[10px] text-slate-600 hover:text-slate-900 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold ml-0.5"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleCopyVendorLink(
                                              rfq.id,
                                              rv.vendor_id,
                                              rv.vendors?.name,
                                            );
                                          }}
                                          title="Copy Vendor's Private Quotation Link"
                                        >
                                          <Copy className="w-3 h-3 mr-0.5" /> Copy Link
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}

                  <PaginationControls
                    currentPage={pagination.page}
                    totalPages={Math.max(1, Math.ceil(filteredRfqs.length / pagination.pageSize))}
                    pageSize={pagination.pageSize}
                    totalItems={filteredRfqs.length}
                    currentItemsCount={paginatedRfqs.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </>
              );
            })()
          )}
        </div>

        {/* Modal: Create RFQ */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Request for Quotation</DialogTitle>
              <DialogDescription>
                Select an approved Purchase Requisition to initiate a multi-vendor RFQ.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Approved Purchase Requisition</Label>
                <Select value={selectedPrId} onValueChange={setSelectedPrId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select approved PR..." />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedPrs
                      .filter(
                        (pr) => !rfqs.some((r: any) => r.pr_id === pr.id && r.status !== "closed"),
                      )
                      .map((pr) => (
                        <SelectItem key={pr.id} value={pr.id}>
                          {pr.pr_number || pr.id.slice(0, 8)} — {pr.category} (₹
                          {Number(pr.estimated_value).toLocaleString("en-IN")})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {approvedPrs.filter(
                  (pr) => !rfqs.some((r: any) => r.pr_id === pr.id && r.status !== "closed"),
                ).length === 0 && (
                  <p className="text-xs text-amber-600">
                    No active approved PRs available. Raise and approve a new PR first.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Response Deadline</Label>
                <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Procurement Notes / Terms</Label>
                <Textarea
                  placeholder="Standard delivery terms, inspection requirements..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateRfq} disabled={creating || !selectedPrId}>
                {creating ? "Creating..." : "Create RFQ"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Send RFQ to Empanelled Vendors */}
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Invite Empanelled Vendors</DialogTitle>
              <DialogDescription>
                Select at least {activeRfq?.required_min_quotations || 3} empanelled vendors.
                Free-text email input is restricted to empanelled vendors.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between font-semibold text-blue-900 dark:text-blue-200">
                  <span>Required Vendors: ≥ {activeRfq?.required_min_quotations || 3}</span>
                  <span>Selected: {selectedVendorIds.length}</span>
                </div>
                {selectedVendorIds.length < (activeRfq?.required_min_quotations || 3) && (
                  <p className="text-amber-700 dark:text-amber-400">
                    ⚠️ You must select{" "}
                    {(activeRfq?.required_min_quotations || 3) - selectedVendorIds.length} more
                    vendor(s) to meet the minimum quotation rule.
                  </p>
                )}
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 border p-3 rounded-md">
                {empanelledVendors.map((vendor) => {
                  const isChecked = selectedVendorIds.includes(vendor.id);
                  return (
                    <div
                      key={vendor.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer"
                      onClick={() => {
                        setSelectedVendorIds((prev) =>
                          isChecked ? prev.filter((id) => id !== vendor.id) : [...prev, vendor.id],
                        );
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <Checkbox checked={isChecked} />
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            {vendor.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            GST: {vendor.gst_number || "N/A"}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-xs text-emerald-600 border-emerald-500"
                      >
                        Empanelled
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSendOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSendRfq}
                disabled={
                  sending || selectedVendorIds.length < (activeRfq?.required_min_quotations || 3)
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {sending ? "Sending..." : `Send to ${selectedVendorIds.length} Vendors`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Award direct purchase */}
        <Dialog open={!!awardRfq} onOpenChange={(o) => !o && setAwardRfq(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Award Purchase Order</DialogTitle>
              <DialogDescription>
                {awardRfq?.rfq_number} is a direct purchase. Choose the vendor; the purchase order
                is created at their quoted price, approved on the requisition's authority. No
                Comparative Statement is needed.
              </DialogDescription>
            </DialogHeader>
            {(() => {
              const quotes = quoteSummary(awardRfq);
              const lowest = quotes[0]?.total ?? 0;
              const chosen = quotes.find((q) => q.vendorId === awardVendorId);
              const notLowest = !!chosen && chosen.total > lowest + 1;
              return (
                <div className="space-y-3">
                  <div role="radiogroup" className="space-y-2">
                    {quotes.map((q, idx) => {
                      const selected = q.vendorId === awardVendorId;
                      return (
                        <button
                          key={q.vendorId}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setAwardVendorId(q.vendorId)}
                          className={`w-full text-left rounded-lg border p-3 flex items-center justify-between gap-3 transition-colors ${
                            selected
                              ? "border-teal-600 bg-teal-50 dark:bg-teal-950/40"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="font-semibold block truncate">{q.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {q.days ? `Delivery in ${q.days} days` : "Delivery not specified"}
                            </span>
                          </span>
                          <span className="text-right shrink-0">
                            <span className="font-mono font-bold whitespace-nowrap block">
                              ₹{q.total.toLocaleString("en-IN")}
                            </span>
                            {idx === 0 && (
                              <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                                Lowest
                              </Badge>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {quotes.length} of {awardRfq?.rfq_vendors?.length ?? 0} invited vendors have
                    quoted.
                  </p>
                  {notLowest && (
                    <div className="space-y-1.5">
                      <Label htmlFor="award-reason">Why not the lowest quote? *</Label>
                      <Textarea
                        id="award-reason"
                        rows={3}
                        value={awardReason}
                        onChange={(e) => setAwardReason(e.target.value)}
                        placeholder="e.g. faster delivery, better warranty, lowest bidder failed specification…"
                      />
                    </div>
                  )}
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-teal-600"
                      checked={awardStoresChecked}
                      onChange={(e) => setAwardStoresChecked(e.target.checked)}
                    />
                    <span>
                      I confirmed these items are <strong>not available in Central Stores</strong>.
                    </span>
                  </label>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAwardRfq(null)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAward}
                      disabled={
                        awarding ||
                        !awardVendorId ||
                        !awardStoresChecked ||
                        (notLowest && !awardReason.trim())
                      }
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      {awarding ? "Creating…" : "Create Purchase Order"}
                    </Button>
                  </DialogFooter>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
