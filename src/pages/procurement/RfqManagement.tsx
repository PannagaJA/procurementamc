import { useState, useEffect } from "react";
import { FilterSelect, statusFilterOptions, applyFilter } from "@/components/FilterSelect";
import Layout from "@/components/Layout";
import { WhatsAppButtons } from "@/components/WhatsAppButtons";
import { ChannelToggle } from "@/components/procurement/ChannelToggle";
import {
  InviteDeliveryDialog,
  quoteMessage,
  vendorQuoteMessage,
  type DeliveryVendor,
} from "@/components/procurement/InviteDeliveryDialog";
import { defaultChannel } from "@/lib/whatsapp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { supabase } from "@/integrations/supabase/client";
import {
  createRfq,
  sendRfq,
  type InviteChannel,
  listRfqs,
  awardDirectPurchase,
  getVendorQuoteLink,
  inviteReplacementVendor,
  debarVendorForNonResponse,
} from "@/lib/procurement/rfq.functions";
import { workingDaysSince } from "@/lib/procurement/turnaround";
import { emailQuoteInvites } from "@/lib/procurement/quoteInvites";
import { NewRateRfqDialog, RateQuotesDialog } from "@/components/procurement/RateContractRfq";
import { rateCategoryLabel } from "@/lib/procurement/rateContracts";
import {
  Send,
  PlusCircle,
  FileText,
  Building2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Eye,
  Copy,
  Award,
  UserPlus,
  UserX,
  FileEdit,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { publicAppOrigin } from "@/lib/quotationAuth";

export default function RfqManagement() {
  const { toast } = useToast();
  const auth = useAuth();
  const [rfqs, setRfqs] = useState<any[]>([]);
  const { pagination, setPage, setPageSize, setTotal } = usePagination(10, 1);
  const [approvedPrs, setApprovedPrs] = useState<any[]>([]);
  const [existingRfqPrIds, setExistingRfqPrIds] = useState<string[]>([]);
  const [empanelledVendors, setEmpanelledVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rfqFilter, setRfqFilter] = useState("active");
  const [viewQuotesRfq, setViewQuotesRfq] = useState<any>(null);
  // Rate finalisation RFQs (rate contracts, SOP Section VI)
  const [rateRfqOpen, setRateRfqOpen] = useState(false);
  const [rateQuotesRfq, setRateQuotesRfq] = useState<any>(null);

  // Create RFQ Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmRfqOpen, setConfirmRfqOpen] = useState(false);
  const [selectedPrId, setSelectedPrId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

  // Send RFQ Modal
  const [sendOpen, setSendOpen] = useState(false);
  const [activeRfq, setActiveRfq] = useState<any>(null);
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  /** Email or WhatsApp per vendor in the invite dialog. */
  const [channels, setChannels] = useState<Record<string, InviteChannel>>({});
  /** The Delivery step: per-vendor send / retry after inviting, or when reminding. */
  const [delivery, setDelivery] = useState<{
    rfq: any;
    vendors: DeliveryVendor[];
    title?: string;
  } | null>(null);

  // Direct purchase award (no CS)
  const [awardRfq, setAwardRfq] = useState<any>(null);
  const [awardVendorId, setAwardVendorId] = useState("");
  const [awardReason, setAwardReason] = useState("");
  const [awardStoresChecked, setAwardStoresChecked] = useState(false);
  const [awarding, setAwarding] = useState(false);
  // Solution 1: Replacement Vendor & Debarment State (SOP §8.4 & §8.2)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRfq, setInviteRfq] = useState<any>(null);
  const [replacementVendorId, setReplacementVendorId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [lastQuoteUrl, setLastQuoteUrl] = useState<string | null>(null);
  const [lastQuoteVendor, setLastQuoteVendor] = useState<{
    name: string;
    phone: string | null;
    rfqNumber: string;
  } | null>(null);
  const [debarOpen, setDebarOpen] = useState(false);
  const [debarVendor, setDebarVendor] = useState<{
    id: string;
    name: string;
    rfqId: string;
  } | null>(null);
  const [debarReason, setDebarReason] = useState("");
  const [debarring, setDebarring] = useState(false);

  // Record Quote Modal

  const loadData = async () => {
    setLoading(true);
    try {
      // Parallelize all queries concurrently in a single batch
      const [res, { data: prData }, { data: allRfqPrs }, { data: allPoPrs }, { data: vData }] =
        await Promise.all([
          (listRfqs as any)(),
          supabase
            .from("purchase_requisitions")
            .select(
              "id, pr_number, category, scope, estimated_value, status, justification, pr_line_items (id, description, net_qty_to_procure, unit)",
            )
            .eq("status", "approved"),
          supabase.from("rfqs").select("pr_id"),
          supabase.from("purchase_orders").select("pr_id"),
          supabase
            .from("vendors")
            .select(
              "id, name, gst_number, status, empanelment_expiry, email:bank_details_json->>email, phone:bank_details_json->>phone",
            )
            .eq("status", "empanelled"),
        ]);

      const list = res?.ok ? res.rfqs || [] : [];
      if (res?.ok) {
        setRfqs(list);
        setTotal(list.length);
      }

      const takenPrIds = new Set<string>();
      (allRfqPrs || []).forEach((r: any) => {
        if (r.pr_id) takenPrIds.add(r.pr_id);
      });
      (allPoPrs || []).forEach((p: any) => {
        if (p.pr_id) takenPrIds.add(p.pr_id);
      });
      (list || []).forEach((r: any) => {
        if (r.pr_id) takenPrIds.add(r.pr_id);
      });

      setExistingRfqPrIds(Array.from(takenPrIds));
      setApprovedPrs(prData || []);
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

  const handleCreateRfq = () => {
    if (!selectedPrId) {
      toast({
        title: "Validation Error",
        description: "Please select an approved requisition.",
        variant: "destructive",
      });
      return;
    }
    setConfirmRfqOpen(true);
  };

  const executeCreateRfq = async () => {
    setConfirmRfqOpen(false);
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
    const saved: Record<string, InviteChannel> = {};
    for (const rv of rfq.rfq_vendors ?? []) saved[rv.vendor_id] = rv.invite_channel || "email";
    setChannels(saved);
    setSendOpen(true);
  };

  const channelOf = (v: any): InviteChannel => channels[v.id] ?? defaultChannel(v);

  /** Pending vendors of an RFQ, each with the channel they were invited by. */
  const pendingDeliveryVendors = (rfq: any): DeliveryVendor[] =>
    (rfq.rfq_vendors ?? [])
      .filter((rv: any) => !rv.response_received_at)
      .map((rv: any) => ({
        id: rv.vendor_id,
        name: rv.vendors?.name,
        email: rv.vendors?.email,
        phone: rv.vendors?.phone,
        channel: rv.invite_channel === "whatsapp" ? "whatsapp" : "email",
      }));

  const handleCopyVendorLink = async (rfqId: string, vendorId: string, vendorName?: string) => {
    try {
      const res = await (getVendorQuoteLink as any)({
        data: { rfq_id: rfqId, vendor_id: vendorId, origin: publicAppOrigin() },
      });
      if (!res?.ok) throw new Error(res?.error);
      await navigator.clipboard.writeText(res.url);
      toast({
        title: "Vendor Link Copied",
        description: `Private quotation link for ${vendorName || "vendor"} copied to clipboard.`,
      });
    } catch (err) {
      console.error("Failed to copy link:", err);
      toast({
        title: "Copy Failed",
        description: (err as Error)?.message || "Could not copy link to clipboard.",
        variant: "destructive",
      });
    }
  };

  /** Remind vendors who haven't quoted: each by their saved channel, sent from the dialog. */
  const handleReemail = (rfq: any) => {
    const pending = pendingDeliveryVendors(rfq);
    if (pending.length) setDelivery({ rfq, vendors: pending, title: "Send / remind vendors" });
  };

  const handleInviteReplacement = async () => {
    if (!inviteRfq || !replacementVendorId) return;
    setInviting(true);
    try {
      const res = await (inviteReplacementVendor as any)({
        data: {
          rfq_id: inviteRfq.id,
          vendor_id: replacementVendorId,
          origin: publicAppOrigin(),
        },
      });
      if (!res.ok) {
        toast({
          title: "Failed to invite replacement",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Replacement Vendor Invited",
        description: res.message || "Quotation invitation link generated successfully.",
      });
      setLastQuoteUrl(res.quoteUrl || null);
      setLastQuoteVendor({
        name: res.vendorName,
        phone: res.vendorPhone ?? null,
        rfqNumber: res.rfqNumber,
      });
      setReplacementVendorId("");
      await loadData();
      const updated = (await (listRfqs as any)())?.rfqs?.find((r: any) => r.id === inviteRfq.id);
      if (updated) setViewQuotesRfq(updated);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleDebarVendor = async () => {
    if (!debarVendor) return;
    setDebarring(true);
    try {
      const res = await (debarVendorForNonResponse as any)({
        data: {
          rfq_id: debarVendor.rfqId,
          vendor_id: debarVendor.id,
          reason: debarReason.trim() || undefined,
        },
      });
      if (!res.ok) {
        toast({ title: "Debarment Failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({
        title: "Vendor Debarred",
        description:
          res.message || `${debarVendor.name} has been debarred from institutional procurement.`,
      });
      setDebarOpen(false);
      setDebarVendor(null);
      setDebarReason("");
      await loadData();
      const updated = (await (listRfqs as any)())?.rfqs?.find(
        (r: any) => r.id === debarVendor.rfqId,
      );
      if (updated) setViewQuotesRfq(updated);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDebarring(false);
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
      const chosen = empanelledVendors.filter((v) => selectedVendorIds.includes(v.id));
      const picked: Record<string, InviteChannel> = {};
      for (const v of chosen) picked[v.id] = channelOf(v);
      const res = await (sendRfq as any)({
        data: {
          rfq_id: activeRfq.id,
          vendor_ids: selectedVendorIds,
          channels: picked,
        },
      });

      if (!res.ok) {
        toast({ title: "Failed to send RFQ", description: res.error, variant: "destructive" });
        return;
      }

      // Email goes out in bulk; WhatsApp needs one click per vendor (Delivery dialog).
      const byEmail = chosen.filter((v) => picked[v.id] === "email");
      const { sent: emailsDispatched, results } = await emailQuoteInvites(res.rfqId, byEmail);
      const vendors: DeliveryVendor[] = chosen.map((v) => ({
        id: v.id,
        name: v.name,
        email: v.email,
        phone: v.phone,
        channel: picked[v.id],
        emailResult: results.find((r) => r.id === v.id),
      }));
      const waCount = vendors.filter((v) => v.channel === "whatsapp").length;
      const failed = vendors.filter((v) => v.emailResult && !v.emailResult.ok).length;

      toast({
        title: "RFQ Dispatched",
        description: [
          `RFQ sent to ${res.sentCount} vendors.`,
          byEmail.length ? `${emailsDispatched} of ${byEmail.length} emailed.` : null,
          waCount ? `${waCount} to send on WhatsApp.` : null,
        ]
          .filter(Boolean)
          .join(" "),
        variant: failed ? "destructive" : undefined,
      });
      setSendOpen(false);
      if (waCount || failed) setDelivery({ rfq: { ...activeRfq, id: res.rfqId }, vendors });
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
      <div className="w-full max-w-full space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
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
                onClick={() => {
                  setCreateOpen(true);
                  loadData();
                }}
                className="gap-2 bg-[#0B1437] hover:bg-[#111f54] text-white shadow-sm rounded-full"
              >
                <PlusCircle className="w-4 h-4" /> Create RFQ
              </Button>
            )}
            {(auth.hasRole("admin") || auth.hasRole("procurement_officer")) && (
              <Button
                onClick={() => setRateRfqOpen(true)}
                className="gap-2 bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-semibold shadow-xs"
                title="Collect at least 3 quotations to finalise rate-contract rates"
              >
                <PlusCircle className="w-4 h-4 text-white" /> Rate contract RFQ
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
            <div className="space-y-3 p-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : rfqs.length === 0 ? (
            <Card className="border-slate-100 shadow-none">
              <div className="flex flex-col items-center justify-center py-14 text-center px-8">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-14 h-14 mb-4 text-slate-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 17v-2m3 2v-4m3 4v-6M3 21h18M3 10.5L12 3l9 7.5"
                  />
                </svg>
                <p className="text-base font-semibold text-slate-500">No data found</p>
                <p className="text-sm text-slate-400 mt-1">
                  No RFQs created yet. Create one from an approved Purchase Requisition.
                </p>
              </div>
            </Card>
          ) : (
            (() => {
              const filteredRfqs = applyFilter(rfqs, rfqFilterOptions, rfqFilter);
              if (filteredRfqs.length === 0)
                return (
                  <Card className="border-slate-100 shadow-none">
                    <div className="flex flex-col items-center justify-center py-12 text-center px-8">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-10 h-10 mb-3 text-slate-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                        />
                      </svg>
                      <p className="text-sm font-semibold text-slate-500">
                        No results match this filter
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        No RFQs match this filter. Choose History or All to see others.
                      </p>
                    </div>
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
                    const isRateRfq = rfq.purpose === "rate_contract";

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
                                {rfq.has_cs && (
                                  <Badge className="text-xs bg-indigo-100 text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300">
                                    CS Prepared ({rfq.cs?.cs_number || "CS"})
                                  </Badge>
                                )}
                                {rfq.is_direct && (
                                  <Badge className="text-xs bg-teal-100 text-teal-800 hover:bg-teal-100 dark:bg-teal-950 dark:text-teal-300">
                                    Direct purchase · no CS
                                  </Badge>
                                )}
                                {isRateRfq && (
                                  <Badge className="text-xs bg-violet-100 text-violet-800 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-300">
                                    Rate contract · no CS
                                  </Badge>
                                )}
                              </div>
                              {isRateRfq ? (
                                <p className="text-xs text-slate-500">
                                  Rate finalisation • {rateCategoryLabel(rfq.category)} •{" "}
                                  {(rfq.rate_items_json ?? []).length} item(s) to price
                                </p>
                              ) : (
                                <p className="text-xs text-slate-500">
                                  PR Ref:{" "}
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                                    {pr?.pr_number || "PR"}
                                  </span>{" "}
                                  • Category: {pr?.category} • Est. Value: ₹
                                  {Number(pr?.estimated_value || 0).toLocaleString("en-IN")}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {rfq.quotation_lines && rfq.quotation_lines.length > 0 && (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    isRateRfq ? setRateQuotesRfq(rfq) : setViewQuotesRfq(rfq)
                                  }
                                  className="gap-1.5 bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-semibold shadow-xs"
                                >
                                  <Eye className="w-3.5 h-3.5 text-white" />
                                  View Quotations ({rfq.quotation_lines.length})
                                </Button>
                              )}
                              {(auth.hasRole("admin") ||
                                auth.hasRole("procurement_officer") ||
                                auth.hasRole("procurement_executive")) && (
                                <>
                                  {rfq.status === "draft" && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleOpenSend(rfq)}
                                      className="gap-1 bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-semibold"
                                    >
                                      <Send className="w-3.5 h-3.5" /> Invite Vendors
                                    </Button>
                                  )}
                                  {rfq.status === "sent" &&
                                    !rfq.has_cs &&
                                    (rfq.rfq_vendors ?? []).some(
                                      (rv: any) => !rv.response_received_at,
                                    ) && (
                                      <Button
                                        size="sm"
                                        onClick={() => handleReemail(rfq)}
                                        className="gap-1 bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-semibold shadow-xs"
                                        title="Send or resend the invitation to every vendor who hasn't quoted yet, by email or WhatsApp"
                                      >
                                        <Send className="w-3.5 h-3.5 text-white" />
                                        Send / remind vendors
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
                                        className="gap-1 bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-bold"
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
                            {isRateRfq
                              ? `${rfq.title}: ${(rfq.rate_items_json ?? []).map((it: any) => it.description).join(", ")}`
                              : pr?.scope || "Requisitioned goods/services."}
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
                                    ) : rfq.has_cs || rfq.status === "closed" ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium ml-1">
                                        <XCircle className="w-3 h-3 text-slate-400" /> Not Submitted
                                      </span>
                                    ) : (
                                      <div className="inline-flex items-center gap-1 ml-1">
                                        <span className="text-[11px] text-amber-600 dark:text-amber-400">
                                          <Clock className="w-3 h-3 inline mr-0.5" /> Pending
                                        </span>
                                        <span
                                          className={`text-[10px] font-semibold rounded px-1 ${
                                            rv.invite_channel === "whatsapp"
                                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                              : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
                                          }`}
                                          title="How this vendor was invited"
                                        >
                                          via{" "}
                                          {rv.invite_channel === "whatsapp" ? "WhatsApp" : "Email"}
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
                                        <WhatsAppButtons
                                          compact
                                          phone={rv.vendors?.phone}
                                          getMessage={() =>
                                            vendorQuoteMessage(rfq, rv.vendor_id, rv.vendors?.name)
                                          }
                                        />
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
                    {(() => {
                      const eligiblePrs = approvedPrs.filter(
                        (pr) =>
                          pr.status === "approved" &&
                          !existingRfqPrIds.includes(pr.id) &&
                          !rfqs.some((r: any) => r.pr_id === pr.id),
                      );

                      if (eligiblePrs.length === 0) {
                        return (
                          <SelectItem
                            value="_no_pr"
                            disabled
                            className="text-slate-700 dark:text-slate-300 font-medium text-xs py-2 text-center"
                          >
                            No approved Requisitions (PR) found
                          </SelectItem>
                        );
                      }

                      return eligiblePrs.map((pr) => {
                        const lineItems = pr.pr_line_items || [];
                        const itemDesc = lineItems
                          .map((i: any) => i.description)
                          .filter(Boolean)
                          .join(", ");
                        return (
                          <SelectItem key={pr.id} value={pr.id}>
                            {pr.pr_number} — {itemDesc || pr.category} (₹
                            {Number(pr.estimated_value).toLocaleString("en-IN")})
                          </SelectItem>
                        );
                      });
                    })()}
                  </SelectContent>
                </Select>
                {approvedPrs.filter(
                  (pr) =>
                    pr.status === "approved" &&
                    !existingRfqPrIds.includes(pr.id) &&
                    !rfqs.some((r: any) => r.pr_id === pr.id),
                ).length === 0 && (
                  <p className="text-xs text-amber-600">
                    No approved requisitions available. All approved PRs already have an RFQ
                    created.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Response Deadline</Label>
                <DatePicker
                  value={deadline}
                  onChange={setDeadline}
                  placeholder="Select response deadline"
                />
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

        {/* Confirmation Modal to prevent accidental RFQ creation */}
        <AlertDialog open={confirmRfqOpen} onOpenChange={setConfirmRfqOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm RFQ Initiation</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 pt-2">
                  <p>
                    Are you sure you want to initiate this Request for Quotation (RFQ)? Once
                    created, you can invite empanelled vendors to submit competitive bids.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={executeCreateRfq}
                className="bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-semibold"
              >
                Confirm & Create RFQ
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <InviteDeliveryDialog
          open={!!delivery}
          onOpenChange={(o) => {
            if (!o) {
              setDelivery(null);
              loadData();
            }
          }}
          rfq={delivery?.rfq ?? null}
          vendors={delivery?.vendors ?? []}
          title={delivery?.title}
        />
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
                {selectedVendorIds.length > 0 &&
                  (() => {
                    const wa = empanelledVendors.filter(
                      (v) => selectedVendorIds.includes(v.id) && channelOf(v) === "whatsapp",
                    ).length;
                    return (
                      <p className="text-slate-600 dark:text-slate-400">
                        {selectedVendorIds.length - wa} by email (sent together)
                        {wa ? ` · ${wa} by WhatsApp (one chat each, after you press Send)` : ""}
                      </p>
                    );
                  })()}
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
                      {isChecked ? (
                        <ChannelToggle
                          value={channelOf(vendor)}
                          email={vendor.email}
                          phone={vendor.phone}
                          onChange={(c) => setChannels((prev) => ({ ...prev, [vendor.id]: c }))}
                        />
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs text-emerald-600 border-emerald-500"
                        >
                          Empanelled
                        </Badge>
                      )}
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
                className="bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-bold"
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
                      className="bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-bold"
                    >
                      {awarding ? "Creating…" : "Create Purchase Order"}
                    </Button>
                  </DialogFooter>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Modal: View Submitted Quotations */}
        <NewRateRfqDialog open={rateRfqOpen} onOpenChange={setRateRfqOpen} onCreated={loadData} />
        <RateQuotesDialog
          key={rateQuotesRfq?.id ?? "none"}
          rfq={rateQuotesRfq}
          canCreate={
            auth.hasRole("admin") ||
            auth.hasRole("procurement_officer") ||
            auth.hasRole("procurement_executive")
          }
          onClose={() => setRateQuotesRfq(null)}
          onCreated={loadData}
        />

        <Dialog open={!!viewQuotesRfq} onOpenChange={(open) => !open && setViewQuotesRfq(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <FileText className="w-5 h-5 text-emerald-600" />
                Submitted Quotations — {viewQuotesRfq?.rfq_number}
              </DialogTitle>
              <DialogDescription>
                PR: {viewQuotesRfq?.purchase_requisitions?.pr_number} • Category:{" "}
                {viewQuotesRfq?.purchase_requisitions?.category} • Est. Value: ₹
                {Number(viewQuotesRfq?.purchase_requisitions?.estimated_value || 0).toLocaleString(
                  "en-IN",
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Cost Overrun Alert Banner (SOP §8.4 & §6) */}
              {(() => {
                const prEst = Number(viewQuotesRfq?.purchase_requisitions?.estimated_value || 0);
                const quotes = viewQuotesRfq?.quotation_lines || [];
                if (quotes.length === 0 || prEst <= 0) return null;
                const minQuote = quotes.reduce((min: number, q: any) => {
                  const tot = Number(q.total_price || 0);
                  return tot > 0 && tot < min ? tot : min;
                }, Number.POSITIVE_INFINITY);

                if (minQuote !== Number.POSITIVE_INFINITY && minQuote > prEst) {
                  const diff = minQuote - prEst;
                  const diffPct = ((diff / prEst) * 100).toFixed(1);
                  return (
                    <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-400 rounded-lg text-xs text-rose-800 dark:text-rose-200">
                      <div>
                        <span className="font-bold flex items-center gap-1.5 text-rose-900 dark:text-rose-100 text-sm">
                          <AlertTriangle className="w-4 h-4 text-rose-600" /> Quotation Exceeds
                          Approved PR Estimate
                        </span>
                        <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                          Lowest quotation (
                          <strong className="font-mono">₹{minQuote.toLocaleString("en-IN")}</strong>
                          ) exceeds approved PR estimate (
                          <strong className="font-mono">₹{prEst.toLocaleString("en-IN")}</strong>)
                          by{" "}
                          <strong className="font-mono">
                            ₹{diff.toLocaleString("en-IN")} (+{diffPct}%)
                          </strong>
                          .
                        </p>
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                          A Comparative Statement and Purchase Order cannot be created. If needed,
                          please raise a new Purchase Requisition with the appropriate estimate.
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {(() => {
                const quotes = viewQuotesRfq?.quotation_lines || [];
                if (quotes.length === 0) {
                  return (
                    <div className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-12 h-12 mb-3 text-slate-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 17v-2m3 2v-4m3 4v-6M3 21h18M3 10.5L12 3l9 7.5"
                          />
                        </svg>
                        <p className="text-base font-semibold text-slate-500">No data found</p>
                        <p className="text-sm text-slate-400 mt-1">
                          No quotations submitted by vendors yet.
                        </p>
                      </div>
                    </div>
                  );
                }

                // Group quotes by vendor
                const vendorGroups = new Map<string, any>();
                for (const q of quotes) {
                  const vId = q.vendor_id;
                  const vName =
                    q.vendors?.name ||
                    viewQuotesRfq?.rfq_vendors?.find((rv: any) => rv.vendor_id === vId)?.vendors
                      ?.name ||
                    "Vendor";
                  if (!vendorGroups.has(vId)) {
                    vendorGroups.set(vId, {
                      vendor_id: vId,
                      vendor_name: vName,
                      total: 0,
                      delivery_days: q.delivery_days || 7,
                      warranty_months: q.warranty_months || 12,
                      meets_spec: q.meets_technical_spec !== false,
                      remarks: q.technical_remarks || "",
                      quotation_ref: q.quotation_ref || null,
                      submitted_at: q.submitted_at || null,
                      lines: [],
                    });
                  }
                  const vg = vendorGroups.get(vId);
                  vg.total += Number(q.total_price || 0);
                  if (q.meets_technical_spec === false) vg.meets_spec = false;
                  if (q.delivery_days)
                    vg.delivery_days = Math.max(vg.delivery_days, Number(q.delivery_days));
                  if (q.technical_remarks && !vg.remarks) vg.remarks = q.technical_remarks;
                  vg.lines.push(q);
                }

                const sortedVendors = Array.from(vendorGroups.values()).sort(
                  (a, b) => a.total - b.total,
                );
                const lowestTotal = sortedVendors[0]?.total;

                return (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500 flex items-center justify-between">
                      <span>
                        Total Quotes Received: <strong>{sortedVendors.length}</strong>
                      </span>
                      <span>
                        Min Required: <strong>{viewQuotesRfq?.required_min_quotations || 3}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {sortedVendors.map((vg) => {
                        const isLowest = vg.total === lowestTotal;
                        return (
                          <div
                            key={vg.vendor_id}
                            className={`p-4 rounded-lg border transition-all ${
                              isLowest
                                ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20"
                                : "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40"
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/60 dark:border-slate-800">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                                  {vg.vendor_name}
                                </span>
                                {isLowest && (
                                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] gap-1">
                                    <CheckCircle className="w-3 h-3" /> Lowest Bidder (L1)
                                  </Badge>
                                )}
                                <Badge
                                  variant="outline"
                                  className={
                                    vg.meets_spec
                                      ? "text-emerald-700 border-emerald-300 dark:text-emerald-400 text-[10px]"
                                      : "text-rose-700 border-rose-300 dark:text-rose-400 text-[10px]"
                                  }
                                >
                                  {vg.meets_spec ? "Tech Compliant" : "Non-Compliant"}
                                </Badge>
                              </div>
                              <div className="text-right">
                                <span className="text-xs text-slate-500 block">Total Quoted</span>
                                <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                                  ₹{vg.total.toLocaleString("en-IN")}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2.5 text-xs">
                              <div>
                                <span className="text-slate-500 block text-[11px]">
                                  Delivery Time
                                </span>
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {vg.delivery_days} days
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[11px]">Warranty</span>
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {vg.warranty_months} months
                                </span>
                              </div>
                              {vg.quotation_ref && (
                                <div>
                                  <span className="text-slate-500 block text-[11px]">
                                    Vendor Ref #
                                  </span>
                                  <span className="font-medium font-mono text-slate-800 dark:text-slate-200">
                                    {vg.quotation_ref}
                                  </span>
                                </div>
                              )}
                            </div>

                            {vg.remarks && (
                              <div className="mt-2.5 pt-2 border-t border-slate-200/50 dark:border-slate-800 text-xs">
                                <span className="text-slate-500 font-medium block mb-1">
                                  Commercial & Technical Remarks:
                                </span>
                                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-white dark:bg-slate-950 p-2 rounded border text-[11px] font-mono">
                                  {vg.remarks}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Invited Vendors & Timeline Tracking (Solution 1: Quorum & Debarment) */}
              {viewQuotesRfq && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        Invited Empanelled Vendors & Response Status
                      </h4>
                      <p className="text-xs text-slate-500">
                        SOP §8.4: Minimum 3 vendor quotes required. Vendors failing to respond
                        within 7 working days / deadline are subject to debarment.
                      </p>
                    </div>
                    {(auth.hasRole("admin") ||
                      auth.hasRole("procurement_officer") ||
                      auth.hasRole("procurement_executive")) && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setInviteRfq(viewQuotesRfq);
                          setLastQuoteUrl(null);
                          setInviteOpen(true);
                        }}
                        className="bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-semibold shadow-xs gap-1.5 text-xs shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> + Invite Replacement Vendor
                      </Button>
                    )}
                  </div>

                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="p-2.5">Vendor Name</th>
                          <th className="p-2.5">Quotation Status</th>
                          <th className="p-2.5">Timeline Status</th>
                          <th className="p-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {((viewQuotesRfq.rfq_vendors || []) as any[]).map((rv: any) => {
                          const quotes = viewQuotesRfq.quotation_lines || [];
                          const hasQuoted = quotes.some((q: any) => q.vendor_id === rv.vendor_id);
                          const isDebarred = rv.vendors?.status === "debarred";
                          const isOverdue = viewQuotesRfq.response_deadline
                            ? new Date() > new Date(viewQuotesRfq.response_deadline)
                            : workingDaysSince(rv.sent_at || viewQuotesRfq.created_at) > 7;

                          return (
                            <tr
                              key={rv.id || rv.vendor_id}
                              className="hover:bg-slate-50 dark:hover:bg-slate-900/50"
                            >
                              <td className="p-2.5">
                                <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                  {rv.vendors?.name || "Empanelled Vendor"}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  GST: {rv.vendors?.gst_number || "N/A"}
                                </span>
                              </td>
                              <td className="p-2.5">
                                {hasQuoted ? (
                                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] gap-1">
                                    <CheckCircle className="w-3 h-3" /> Quote Submitted
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-slate-600 text-[10px]">
                                    Awaiting Quote
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2.5">
                                {isDebarred ? (
                                  <Badge className="bg-rose-700 text-white text-[10px]">
                                    Debarred
                                  </Badge>
                                ) : hasQuoted ? (
                                  <span className="text-slate-500 text-[11px]">Completed</span>
                                ) : isOverdue ? (
                                  <Badge
                                    variant="outline"
                                    className="text-rose-700 border-rose-300 bg-rose-50 dark:bg-rose-950/40 text-[10px] gap-1 font-semibold"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-rose-600" />{" "}
                                    Non-Responsive (Overdue)
                                  </Badge>
                                ) : (
                                  <span className="text-amber-600 dark:text-amber-400 text-[11px] flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Within 7-day timeline
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-right">
                                {!hasQuoted &&
                                  !isDebarred &&
                                  isOverdue &&
                                  (auth.hasRole("admin") ||
                                    auth.hasRole("procurement_officer") ||
                                    auth.hasRole("evp")) && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => {
                                        setDebarVendor({
                                          id: rv.vendor_id,
                                          name: rv.vendors?.name || "Vendor",
                                          rfqId: viewQuotesRfq.id,
                                        });
                                        setDebarReason(
                                          `Debarred under SOP §8.4 quotation timeline breach & §8.2 debarment register for failure to provide quotation for RFQ ${viewQuotesRfq.rfq_number}.`,
                                        );
                                        setDebarOpen(true);
                                      }}
                                      className="text-xs h-7 px-2 gap-1 font-semibold"
                                    >
                                      <UserX className="w-3 h-3" /> Debar Vendor
                                    </Button>
                                  )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              {(auth.hasRole("admin") ||
                auth.hasRole("procurement_officer") ||
                auth.hasRole("procurement_executive")) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInviteRfq(viewQuotesRfq);
                    setLastQuoteUrl(null);
                    setInviteOpen(true);
                  }}
                  className="gap-1.5 bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-semibold shadow-xs mr-auto text-xs"
                >
                  <UserPlus className="w-3.5 h-3.5 text-white" /> Invite Replacement
                </Button>
              )}
              <Button variant="outline" onClick={() => setViewQuotesRfq(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Invite Replacement Empanelled Vendor (SOP §8.4 Quorum) */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#0B1437] dark:text-white">
                <UserPlus className="w-5 h-5 text-[#0B1437] dark:text-white" />
                Invite Replacement Empanelled Vendor
              </DialogTitle>
              <DialogDescription>
                Invite an additional active empanelled vendor to RFQ {inviteRfq?.rfq_number} to
                maintain the mandatory 3-quote quorum (SOP §8.4).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs">Select Empanelled Vendor *</Label>
                <Select value={replacementVendorId} onValueChange={setReplacementVendorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an empanelled vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const eligibleVendors = empanelledVendors.filter(
                        (v) =>
                          v.status === "empanelled" &&
                          !(inviteRfq?.rfq_vendors || []).some((rv: any) => rv.vendor_id === v.id),
                      );

                      if (eligibleVendors.length === 0) {
                        return (
                          <SelectItem
                            value="_no_vendor"
                            disabled
                            className="text-muted-foreground text-xs italic py-2"
                          >
                            No eligible empanelled vendors found
                          </SelectItem>
                        );
                      }

                      return eligibleVendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} {v.gst_number ? `(${v.gst_number})` : ""}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500">
                  Only active, empanelled vendors not already participating in this RFQ are listed.
                </p>
              </div>

              {lastQuoteUrl && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-800 dark:text-emerald-200">
                      Quotation Submission Link:
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(lastQuoteUrl);
                        toast({
                          title: "Link Copied",
                          description: "Quotation URL copied to clipboard.",
                        });
                      }}
                      className="h-6 px-2 text-[10px] gap-1"
                    >
                      <Copy className="w-3 h-3" /> Copy Link
                    </Button>
                  </div>
                  <WhatsAppButtons
                    compact
                    phone={lastQuoteVendor?.phone}
                    getMessage={async () =>
                      quoteMessage(lastQuoteUrl, lastQuoteVendor?.name, lastQuoteVendor?.rfqNumber)
                    }
                  />
                  <p className="font-mono text-[11px] break-all text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded border">
                    {lastQuoteUrl}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>
                {lastQuoteUrl ? "Done" : "Cancel"}
              </Button>
              <Button
                onClick={handleInviteReplacement}
                disabled={inviting || !replacementVendorId}
                className="bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-semibold shadow-xs gap-1"
              >
                {inviting ? "Inviting..." : "Send RFQ Invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Debar Vendor for Non-Response (SOP §8.4 & §8.2) */}
        <Dialog open={debarOpen} onOpenChange={setDebarOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600">
                <UserX className="w-5 h-5 text-rose-600" />
                Debar Vendor for Non-Response
              </DialogTitle>
              <DialogDescription>
                Debar <strong>{debarVendor?.name}</strong> from institutional procurement for
                failing to submit quotations within the mandatory 7 working days timeline.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 rounded-lg text-rose-800 dark:text-rose-200">
                <p className="font-semibold text-xs flex items-center gap-1.5 text-rose-900 dark:text-rose-100">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" /> SOP §8.4 Timeline
                  Breach
                </p>
                <p className="text-[11px] mt-1 text-rose-700 dark:text-rose-300">
                  Debarment updates the vendor status to <code>debarred</code> and registers an
                  entry in the institutional blacklist register. Debarred vendors cannot participate
                  in future solicitations.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Reason for Debarment *</Label>
                <Textarea
                  value={debarReason}
                  onChange={(e) => setDebarReason(e.target.value)}
                  rows={3}
                  placeholder="State the non-response duration and breach details..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDebarOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDebarVendor}
                disabled={debarring || !debarReason.trim()}
                className="gap-1 font-semibold"
              >
                {debarring ? "Debarring..." : "Confirm Debarment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
