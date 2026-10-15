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
  recordDelivery,
  deleteDeliveryChallan,
  createGrn,
  securityVerify,
  technicalVerify,
  listGrns,
} from "@/lib/procurement/grn.functions";
import { listPurchaseOrders } from "@/lib/procurement/po.functions";
import { poUnitRate } from "@/lib/procurement/poRates";
import {
  Truck,
  PlusCircle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  FileCheck,
  RefreshCw,
  PackageCheck,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function GrnManagement() {
  const { toast } = useToast();
  const auth = useAuth();
  const [grns, setGrns] = useState<any[]>([]);
  const { pagination, setPage, setPageSize, setTotal } = usePagination(10, 1);
  const [issuedPos, setIssuedPos] = useState<any[]>([]);
  const [challans, setChallans] = useState<any[]>([]);
  const [unlinkedChallans, setUnlinkedChallans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [grnFilter, setGrnFilter] = useState("active");

  // Record Delivery Modal
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [packagesCount, setPackagesCount] = useState<number | "">(1);
  const [carrierDetails, setCarrierDetails] = useState("");
  const [deliveryRemarks, setDeliveryRemarks] = useState("");
  const [recordingDelivery, setRecordingDelivery] = useState(false);

  // Create GRN Modal
  const [grnOpen, setGrnOpen] = useState(false);
  const [grnPoId, setGrnPoId] = useState("");
  const [selectedChallanId, setSelectedChallanId] = useState("");
  const [requiresTechInspection, setRequiresTechInspection] = useState(true);
  const [grnLines, setGrnLines] = useState<any[]>([]);
  const [creatingGrn, setCreatingGrn] = useState(false);

  // Technical Verification Modal
  const [techOpen, setTechOpen] = useState(false);
  const [activeGrn, setActiveGrn] = useState<any>(null);
  const [techAccepted, setTechAccepted] = useState(true);
  const [techRemarks, setTechRemarks] = useState("");
  const [verifying, setVerifying] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [grnRes, poRes, challanRes] = await Promise.all([
        (listGrns as any)(),
        (listPurchaseOrders as any)({ status: "issued" }),
        supabase
          .from("delivery_challans")
          .select("*, purchase_orders(po_number, vendors(name))")
          .order("received_at", { ascending: false }),
      ]);

      if (grnRes?.ok) {
        // Deduplicate GRNs by id — prevents duplicate cards when the JOIN produces multiple rows
        const rawList: any[] = grnRes.grns || [];
        const seen = new Set<string>();
        const dedupedList = rawList.filter((g) => {
          if (seen.has(g.id)) return false;
          seen.add(g.id);
          return true;
        });
        setGrns(dedupedList);
        setTotal(dedupedList.length);

        // Compute which challans already have a GRN so we can show orphaned ones
        const linkedChallanIds = new Set(
          dedupedList.map((g: any) => g.delivery_challan_id).filter(Boolean),
        );
        const allChallans: any[] = challanRes.data || [];
        setChallans(allChallans);
        setUnlinkedChallans(allChallans.filter((c) => !linkedChallanIds.has(c.id)));
      } else {
        const allChallans: any[] = challanRes.data || [];
        setChallans(allChallans);
        setUnlinkedChallans(allChallans);
      }
      if (poRes?.ok) setIssuedPos(poRes.purchaseOrders || []);
    } catch (e: any) {
      toast({ title: "Error loading data", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When PO or Delivery Challan selection changes in GRN Modal, prepare lines
  useEffect(() => {
    let isCancelled = false;

    async function setupGrnLines() {
      if (!grnPoId) {
        setGrnLines([]);
        return;
      }
      const po = issuedPos.find((p) => p.id === grnPoId);
      if (!po) return;

      // Find delivery challans for this PO that haven't been linked yet
      const relevantUnlinked = unlinkedChallans.filter((c) => c.po_id === grnPoId);
      const allRelevant = challans.filter((c) => c.po_id === grnPoId);
      const candidateList = relevantUnlinked.length > 0 ? relevantUnlinked : allRelevant;

      let challanIdToUse = selectedChallanId;
      if (
        candidateList.length > 0 &&
        (!selectedChallanId || !candidateList.some((c) => c.id === selectedChallanId))
      ) {
        challanIdToUse = candidateList[0].id;
        setSelectedChallanId(challanIdToUse);
      }

      const activeChallan = challans.find((c) => c.id === challanIdToUse);
      const pkgCount = Math.max(1, Number(activeChallan?.packages_count || 1));

      // 1. Check if PR line items are present on the PO object
      const pr = Array.isArray(po.purchase_requisitions)
        ? po.purchase_requisitions[0]
        : po.purchase_requisitions;
      let prLineItems: any[] = pr?.pr_line_items ?? [];

      // 2. If line items are empty, query pr_line_items directly using po.pr_id
      if ((!prLineItems || prLineItems.length === 0) && po.pr_id) {
        try {
          const { data: dbLines, error } = await supabase
            .from("pr_line_items")
            .select("id, description, net_qty_to_procure, qty_required, est_unit_price, est_total, unit")
            .eq("pr_id", po.pr_id);
          if (!error && dbLines && dbLines.length > 0) {
            prLineItems = dbLines;
          }
        } catch (err) {
          console.warn("[GRN] Could not fetch pr_line_items directly:", err);
        }
      }

      if (isCancelled) return;

      // If we have line items from PR
      if (prLineItems.length > 0) {
        setGrnLines(
          prLineItems.map((item: any) => {
            const qty = Number(item.net_qty_to_procure || item.qty_required) || 1;
            // PO rate (vendor's quoted price) — the server values the GRN at this same rate.
            const unitPrice =
              Math.round(
                poUnitRate(
                  { ...po, purchase_requisitions: { pr_line_items: prLineItems } },
                  item.description,
                ) * 100,
              ) / 100;
            return {
              description: item.description || po.scope_of_supply || "Material Supply",
              unit: item.unit || "units",
              qty_delivered: qty,
              qty_accepted: qty,
              unit_price: unitPrice,
              inspection_remarks: "Visual verification complete",
            };
          }),
        );
        return;
      }

      // 3. Fallback: Parse scope_of_supply (e.g. "Direct procurement: a4 sheets (Qty: 5)")
      const totalPrice = Number(po.price || po.total_value || 0);
      if (po.scope_of_supply && typeof po.scope_of_supply === "string") {
        const cleanScope = po.scope_of_supply.replace(/^Direct procurement:\s*/i, "").trim();
        const regex = /([^,]+?)\s*\(Qty:\s*(\d+(?:\.\d+)?)\)/gi;
        const parsedItems: { description: string; qty: number }[] = [];
        let match;
        while ((match = regex.exec(cleanScope)) !== null) {
          parsedItems.push({
            description: match[1].trim(),
            qty: parseFloat(match[2]),
          });
        }

        if (parsedItems.length > 0) {
          if (parsedItems.length === 1) {
            const item = parsedItems[0];
            const itemQty = item.qty || 1;
            const unitPrice = Math.round((totalPrice / itemQty) * 100) / 100;
            setGrnLines([
              {
                description: item.description,
                unit: "units",
                qty_delivered: itemQty,
                qty_accepted: itemQty,
                unit_price: unitPrice,
                inspection_remarks: "Visual verification complete",
              },
            ]);
            return;
          } else {
            const totalQty = parsedItems.reduce((acc, it) => acc + (it.qty || 1), 0);
            setGrnLines(
              parsedItems.map((it) => {
                const itemQty = it.qty || 1;
                const unitPrice =
                  totalQty > 0
                    ? Math.round((totalPrice / totalQty) * 100) / 100
                    : Math.round((totalPrice / parsedItems.length / itemQty) * 100) / 100;
                return {
                  description: it.description,
                  unit: "units",
                  qty_delivered: itemQty,
                  qty_accepted: itemQty,
                  unit_price: unitPrice,
                  inspection_remarks: "Visual verification complete",
                };
              }),
            );
            return;
          }
        }
      }

      // 4. Fallback if no item info at all:
      const unitPrice =
        pkgCount > 0 ? Math.round((totalPrice / pkgCount) * 100) / 100 : totalPrice;
      setGrnLines([
        {
          description: po.scope_of_supply?.replace(/^Direct procurement:\s*/i, "") || "Material Supply",
          unit: pkgCount > 1 ? "units" : "lot",
          qty_delivered: pkgCount,
          qty_accepted: pkgCount,
          unit_price: unitPrice,
          inspection_remarks: "Visual verification complete",
        },
      ]);
    }

    setupGrnLines();

    return () => {
      isCancelled = true;
    };
  }, [grnPoId, selectedChallanId, issuedPos, challans, unlinkedChallans]);

  const handleRecordDelivery = async () => {
    if (!selectedPoId) {
      toast({
        title: "Select PO",
        description: "Please select an issued purchase order.",
        variant: "destructive",
      });
      return;
    }

    setRecordingDelivery(true);
    try {
      const res = await (recordDelivery as any)({
        data: {
          po_id: selectedPoId,
          packages_count: packagesCount === "" ? 1 : Math.max(1, Number(packagesCount)),
          carrier_details: carrierDetails,
          remarks: deliveryRemarks,
          items_json: [],
        },
      });

      if (!res.ok) {
        toast({
          title: "Delivery Recording Failed",
          description: res.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Delivery Challan Recorded",
        description: `Challan ${res.challan.challan_number} recorded. Stores security verification complete.`,
      });
      setDeliveryOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRecordingDelivery(false);
    }
  };

  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const handleDismissChallan = async (challanId: string, challanNumber: string) => {
    if (
      !confirm(
        `Are you sure you want to dismiss Delivery Challan ${challanNumber}? (e.g. over-delivered, cancelled, or returned to vendor)`,
      )
    ) {
      return;
    }
    setDismissingId(challanId);
    try {
      const res = await (deleteDeliveryChallan as any)({
        data: { challan_id: challanId },
      });
      if (!res.ok) {
        toast({
          title: "Failed to dismiss challan",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Challan Dismissed",
        description: `Delivery Challan ${challanNumber} has been removed from Awaiting GRN.`,
      });
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDismissingId(null);
    }
  };

  const handleCreateGrn = async () => {
    if (!grnPoId || !selectedChallanId) {
      toast({
        title: "Validation Error",
        description: "Select the delivery challan this GRN is for.",
        variant: "destructive",
      });
      return;
    }

    for (const l of grnLines) {
      const delivered = Number(l.qty_delivered || 0);
      const accepted = Number(l.qty_accepted || 0);
      if (delivered <= 0) {
        toast({
          title: "Invalid Delivered Quantity",
          description: `Delivered quantity for "${l.description}" must be greater than zero.`,
          variant: "destructive",
        });
        return;
      }
      if (accepted > delivered) {
        toast({
          title: "Accepted Quantity Exceeded",
          description: `Accepted quantity (${accepted}) cannot exceed delivered quantity (${delivered}) for "${l.description}".`,
          variant: "destructive",
        });
        return;
      }
      if (accepted < 0) {
        toast({
          title: "Invalid Accepted Quantity",
          description: `Accepted quantity cannot be negative for "${l.description}".`,
          variant: "destructive",
        });
        return;
      }
    }

    setCreatingGrn(true);
    try {
      const sanitizedLines = grnLines.map((l) => {
        const del = Number(l.qty_delivered || 0);
        const acc = Math.min(del, Math.max(0, Number(l.qty_accepted || 0)));
        return {
          ...l,
          qty_delivered: del,
          qty_accepted: acc,
          unit_price: Number(l.unit_price || 0),
        };
      });

      const res = await (createGrn as any)({
        data: {
          po_id: grnPoId,
          delivery_challan_id: selectedChallanId,
          requires_technical_inspection: requiresTechInspection,
          lines: sanitizedLines,
        },
      });

      if (!res.ok) {
        const isOverDelivery =
          res.code === "over_delivery_not_permitted" ||
          res.error?.toLowerCase().includes("over-delivery") ||
          res.error?.toLowerCase().includes("cumulative delivered");
        toast({
          title: isOverDelivery ? "Over-Delivery Blocked" : "GRN Creation Blocked",
          description: res.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "GRN Created",
        description: `Goods Receipt Note ${res.grn.grn_number} created with accepted value ₹${Number(res.acceptedValue).toLocaleString("en-IN")}.`,
      });
      setGrnOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreatingGrn(false);
    }
  };

  const handleSecurityVerify = async (grnId: string) => {
    try {
      const res = await (securityVerify as any)({ data: { grn_id: grnId } });
      if (!res.ok) {
        toast({
          title: "Security Verification Failed",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Security Verified", description: "Package inward verified at stores gate." });
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleTechnicalVerify = async () => {
    if (!activeGrn) return;
    setVerifying(true);
    try {
      const res = await (technicalVerify as any)({
        data: {
          grn_id: activeGrn.id,
          is_accepted: techAccepted,
          remarks: techRemarks,
        },
      });

      if (!res.ok) {
        toast({ title: "Verification Failed", description: res.error, variant: "destructive" });
        return;
      }

      toast({
        title: techAccepted ? "Technical Acceptance Recorded" : "Material Rejected",
        description: `GRN status updated to "${res.status}".`,
      });
      setTechOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const grnFilterOptions = statusFilterOptions(grns, (g: any) => g.status, ["accepted", "rejected"]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 mb-2">
              <Truck className="w-3.5 h-3.5" /> Stores Fulfilment & Goods Receipt
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Delivery Challans & Goods Receipt Notes (GRN)
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Enforce physical delivery receipt, security check, technical inspection sign-off, and
              accepted value ledger.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {(auth.hasRole("admin") || auth.hasRole("stores")) && (
              <>
                <Button
                  onClick={() => setDeliveryOpen(true)}
                  variant="outline"
                  className="gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 dark:hover:text-emerald-100 shadow-sm"
                >
                  <Truck className="w-4 h-4" /> Record Challan
                </Button>
                <Button
                  onClick={() => setGrnOpen(true)}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" /> Create GRN
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Pending Delivery Challans (not yet linked to a GRN) */}
        {!loading && unlinkedChallans.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Delivery Challans Awaiting GRN ({unlinkedChallans.length})
            </h2>
            {unlinkedChallans.map((c) => (
              <Card
                key={c.id}
                className="border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                      {c.challan_number || "DC-PENDING"}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-500 text-amber-700 dark:text-amber-400"
                    >
                      Awaiting GRN
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    PO:{" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {c.purchase_orders?.po_number || "—"}
                    </span>{" "}
                    • Vendor:{" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {c.purchase_orders?.vendors?.name || "—"}
                    </span>{" "}
                    • Packages: {c.packages_count ?? 1}
                    {c.carrier_details && ` • ${c.carrier_details}`}
                  </p>
                  <p className="text-xs text-slate-400">
                    Received:{" "}
                    {c.received_at ? new Date(c.received_at).toLocaleString() : "Just now"}
                  </p>
                </div>
                {(auth.hasRole("admin") || auth.hasRole("stores")) && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 dark:border-rose-900/50 dark:hover:bg-rose-950/40 gap-1"
                      disabled={dismissingId === c.id}
                      onClick={() => handleDismissChallan(c.id, c.challan_number || "DC-PENDING")}
                      title="Dismiss or remove invalid/excess delivery challan"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Dismiss
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                      onClick={() => {
                        setGrnPoId(c.po_id || "");
                        setSelectedChallanId(c.id);
                        setGrnOpen(true);
                      }}
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Create GRN
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* GRN List */}
        <div className="space-y-4">
          {/* Status filter */}
          <FilterSelect
            value={grnFilter}
            onChange={(v) => {
              setGrnFilter(v);
              setPage(1);
            }}
            options={grnFilterOptions}
            title="Filter goods receipts"
          />

          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading Goods Receipt Notes...</div>
          ) : (
            (() => {
              // Filter by closed toggle
              const visibleGrns = applyFilter(grns, grnFilterOptions, grnFilter);
              if (visibleGrns.length === 0)
                return (
                  <Card className="text-center p-8">
                    <p className="text-slate-500">
                      {grns.length === 0
                        ? "No Goods Receipt Notes created yet. Record a Delivery Challan first, then create a GRN."
                        : "No goods receipts match this filter. Choose History or All to see accepted and rejected GRNs."}
                    </p>
                  </Card>
                );
              const startIndex = (pagination.page - 1) * pagination.pageSize;
              const paginatedGrns = visibleGrns.slice(startIndex, startIndex + pagination.pageSize);
              return (
                <>
                  {paginatedGrns.map((grn) => {
                    const po = grn.purchase_orders;
                    const challan = grn.delivery_challans;
                    const isPending = grn.status === "pending";
                    const isAccepted = grn.status === "accepted";
                    const lines = grn.grn_lines || [];
                    const isSecurityDone = Boolean(
                      grn.security_verified_at || (grn as any).security_inward_done,
                    );
                    const isTechDone = Boolean(
                      grn.technical_verified_at ||
                      (grn as any).technical_inspection_done ||
                      isAccepted,
                    );
                    const acceptedTotal = Number(
                      grn.accepted_value ?? grn.total_accepted_value ?? 0,
                    );
                    const rejectedTotal = Math.max(
                      0,
                      lines.reduce((sum: number, l: any) => {
                        const del = Number(l.qty_delivered || 0);
                        const acc = Number(l.qty_accepted || 0);
                        const rej = Math.max(0, Number(l.qty_rejected ?? del - acc));
                        return sum + rej * Number(l.unit_price || 0);
                      }, 0) || Number(grn.total_rejected_value ?? 0),
                    );

                    return (
                      <Card
                        key={grn.id}
                        className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300"
                      >
                        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                                  {grn.grn_number || "GRN-PENDING"}
                                </span>
                                <Badge
                                  variant={
                                    isAccepted ? "default" : isPending ? "secondary" : "destructive"
                                  }
                                >
                                  {grn.status.toUpperCase()}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Challan: {challan?.challan_number || "Linked"}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500">
                                PO:{" "}
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {po?.po_number}
                                </span>{" "}
                                • Vendor:{" "}
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {po?.vendors?.name || "Direct"}
                                </span>
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Security Check button if not done */}
                              {!isSecurityDone &&
                                (auth.hasRole("admin") || auth.hasRole("stores")) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs border-amber-600 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-950 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60 dark:hover:text-amber-100 transition-colors gap-1.5"
                                    onClick={() => handleSecurityVerify(grn.id)}
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" /> Security Verify
                                  </Button>
                                )}

                              {/* Technical Inspection button if required and pending */}
                              {grn.requires_technical_inspection &&
                                !isTechDone &&
                                (auth.hasRole("admin") ||
                                  auth.hasRole("hod") ||
                                  auth.hasRole("faculty")) && (
                                  <Button
                                    size="sm"
                                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                                    onClick={() => {
                                      setActiveGrn(grn);
                                      setTechOpen(true);
                                    }}
                                  >
                                    <FileCheck className="w-3.5 h-3.5" /> Technical Inspect
                                  </Button>
                                )}
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-4 space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                              <span className="text-slate-500 block">Accepted Total</span>
                              <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                                ₹{acceptedTotal.toLocaleString("en-IN")}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                              <span className="text-slate-500 block">Rejected Total</span>
                              <span className="font-mono font-bold text-sm text-red-600 dark:text-red-400">
                                ₹{rejectedTotal.toLocaleString("en-IN")}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                              <span className="text-slate-500 block">Security Inward</span>
                              <span className="font-semibold flex items-center gap-1 mt-0.5">
                                {isSecurityDone ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />{" "}
                                    Done
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />{" "}
                                    Pending
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                              <span className="text-slate-500 block">Technical Sign-off</span>
                              <span className="font-semibold flex items-center gap-1 mt-0.5">
                                {!grn.requires_technical_inspection ? (
                                  "Not Applicable"
                                ) : isTechDone ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />{" "}
                                    Done
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />{" "}
                                    Awaiting
                                  </>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Line Items Table */}
                          {lines.length > 0 && (
                            <div className="rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden mt-3">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                                  <tr>
                                    <th className="p-2">Description</th>
                                    <th className="p-2 text-right">Delivered</th>
                                    <th className="p-2 text-right">Accepted</th>
                                    <th className="p-2 text-right">Rejected</th>
                                    <th className="p-2 text-right">Unit Price</th>
                                    <th className="p-2 text-right">Accepted Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {lines.map((l: any) => {
                                    const qtyDel = Number(l.qty_delivered || 0);
                                    const qtyAcc = Number(l.qty_accepted || 0);
                                    const qtyRej = Math.max(
                                      0,
                                      Number(l.qty_rejected ?? qtyDel - qtyAcc),
                                    );
                                    const unitP = Number(l.unit_price || 0);
                                    const lineTotal = Number(l.accepted_total ?? qtyAcc * unitP);
                                    return (
                                      <tr key={l.id}>
                                        <td className="p-2 font-medium">{l.description}</td>
                                        <td className="p-2 text-right">{qtyDel}</td>
                                        <td className="p-2 text-right font-semibold text-emerald-600">
                                          {qtyAcc}
                                        </td>
                                        <td className="p-2 text-right text-red-500">{qtyRej}</td>
                                        <td className="p-2 text-right font-mono">
                                          ₹{unitP.toLocaleString("en-IN")}
                                        </td>
                                        <td className="p-2 text-right font-mono font-bold">
                                          ₹{lineTotal.toLocaleString("en-IN")}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}

                  <PaginationControls
                    currentPage={pagination.page}
                    totalPages={Math.ceil(visibleGrns.length / pagination.pageSize)}
                    pageSize={pagination.pageSize}
                    totalItems={visibleGrns.length}
                    currentItemsCount={paginatedGrns.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </>
              );
            })()
          )}
        </div>

        {/* Modal: Record Delivery Challan */}
        <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record Delivery Challan</DialogTitle>
              <DialogDescription>
                Log physical delivery package arrival and inward inspection at Central Stores gate.
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
                    {issuedPos
                      .filter((po) => {
                        if (po.status === "closed" || po.status === "cancelled" || po.status === "rejected") return false;
                        // Exclude POs that already have an accepted GRN (goods already accepted)
                        const hasAcceptedGrn = grns.some((g: any) => g.po_id === po.id && g.status === "accepted");
                        if (hasAcceptedGrn) return false;
                        // Exclude POs that already have an unlinked delivery challan awaiting GRN
                        const hasPendingChallan = unlinkedChallans.some((c: any) => c.po_id === po.id);
                        if (hasPendingChallan) return false;
                        // If line items exist, check if ordered quantity was already delivered
                        const pr = Array.isArray(po.purchase_requisitions) ? po.purchase_requisitions[0] : po.purchase_requisitions;
                        const orderedQty = (pr?.pr_line_items ?? []).reduce(
                          (sum: number, item: any) =>
                            sum + (Number(item.net_qty_to_procure || item.qty_required) || 0),
                          0,
                        );
                        const priorDelivered = (grns ?? [])
                          .filter((g: any) => g.po_id === po.id && g.status !== "rejected")
                          .reduce((sum: number, g: any) => {
                            return (
                              sum +
                              (g.grn_lines ?? []).reduce(
                                (lSum: number, l: any) => lSum + (Number(l.qty_delivered) || 0),
                                0,
                              )
                            );
                          }, 0);
                        if (orderedQty > 0 && priorDelivered >= orderedQty) return false;
                        return true;
                      })
                      .map((po) => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.po_number} — {po.vendors?.name} (₹
                          {Number(po.total_value).toLocaleString("en-IN")})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {(() => {
                const po = issuedPos.find((p) => p.id === selectedPoId);
                if (!po) return null;
                const orderedQty = (po.purchase_requisitions?.pr_line_items ?? []).reduce(
                  (sum: number, item: any) =>
                    sum + (Number(item.net_qty_to_procure || item.qty_required) || 0),
                  0,
                );
                const priorDelivered = (grns ?? [])
                  .filter((g: any) => g.po_id === po.id && g.status !== "rejected")
                  .reduce((sum: number, g: any) => {
                    return (
                      sum +
                      (g.grn_lines ?? []).reduce(
                        (lSum: number, l: any) => lSum + (Number(l.qty_delivered) || 0),
                        0,
                      )
                    );
                  }, 0);
                if (orderedQty > 0 && priorDelivered >= orderedQty) {
                  return (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-semibold">Already fully delivered:</span> This Purchase
                        Order has already been fully delivered ({priorDelivered} of {orderedQty}{" "}
                        units received). Gate recording is logged for physical audit, but creating
                        another GRN for excess quantities will be blocked by the Over-Delivery
                        Guard.
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Packages / Boxes Count</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={packagesCount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setPackagesCount("");
                      } else {
                        const n = parseInt(val, 10);
                        setPackagesCount(isNaN(n) ? "" : n);
                      }
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Carrier / Vehicle Details</Label>
                  <Input
                    placeholder="e.g. Bluedart / KA-01-AB-1234"
                    value={carrierDetails}
                    onChange={(e) => setCarrierDetails(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Stores Security Remarks</Label>
                <Textarea
                  placeholder="Intact seals, physical package condition..."
                  value={deliveryRemarks}
                  onChange={(e) => setDeliveryRemarks(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDeliveryOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRecordDelivery}
                disabled={recordingDelivery || !selectedPoId}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {recordingDelivery ? "Logging..." : "Log Delivery Challan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Create GRN */}
        <Dialog open={grnOpen} onOpenChange={setGrnOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Goods Receipt Note (GRN)</DialogTitle>
              <DialogDescription>
                Verify delivered materials against the Purchase Order and Delivery Challan.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Purchase Order</Label>
                  <Select value={grnPoId} onValueChange={setGrnPoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select PO..." />
                    </SelectTrigger>
                    <SelectContent>
                      {issuedPos
                        .filter((po) => {
                          if (po.status === "closed" || po.status === "cancelled" || po.status === "rejected") return false;
                          const hasAcceptedGrn = grns.some((g: any) => g.po_id === po.id && g.status === "accepted");
                          if (hasAcceptedGrn) return false;
                          const hasUnlinkedChallan = unlinkedChallans.some((c: any) => c.po_id === po.id);
                          return hasUnlinkedChallan;
                        })
                        .map((po) => (
                          <SelectItem key={po.id} value={po.id}>
                            {po.po_number} — {po.vendors?.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Delivery Challan</Label>
                  <Select
                    value={selectedChallanId}
                    onValueChange={(val) => {
                      setSelectedChallanId(val);
                      const ch = unlinkedChallans.find((c) => c.id === val);
                      if (ch?.po_id && !grnPoId) {
                        setGrnPoId(ch.po_id);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Challan..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unlinkedChallans
                        .filter((c) => !grnPoId || c.po_id === grnPoId)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.challan_number} (PO: {c.purchase_orders?.po_number || "Ref"}) —{" "}
                            {c.packages_count ?? 1} pkgs
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="tech-insp"
                  checked={requiresTechInspection}
                  onCheckedChange={(c) => setRequiresTechInspection(!!c)}
                />
                <Label htmlFor="tech-insp" className="text-xs cursor-pointer">
                  Requires Technical Inspection Sign-off by User Department
                </Label>
              </div>

              {/* Line Items */}
              {grnLines.map((line, idx) => (
                <div
                  key={idx}
                  className="p-3 border rounded-lg bg-slate-50 dark:bg-slate-900 space-y-2 text-xs"
                >
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    Item #{idx + 1}: {line.description}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-[10px]">Delivered Qty</Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={line.qty_delivered}
                        onChange={(e) => {
                          const val = e.target.value;
                          const numVal = val === "" ? "" : Number(val);
                          setGrnLines((prev) =>
                            prev.map((l, i) => {
                              if (i !== idx) return l;
                              const newAccepted =
                                numVal !== "" &&
                                typeof l.qty_accepted === "number" &&
                                l.qty_accepted > numVal
                                  ? numVal
                                  : l.qty_accepted;
                              return { ...l, qty_delivered: numVal, qty_accepted: newAccepted };
                            }),
                          );
                        }}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px]">Accepted Qty</Label>
                        <span className="text-[9px] text-slate-400 font-mono">
                          Max: {Number(line.qty_delivered) || 0}
                        </span>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max={
                          typeof line.qty_delivered === "number" ? line.qty_delivered : undefined
                        }
                        placeholder="0"
                        value={line.qty_accepted}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") {
                            setGrnLines((prev) =>
                              prev.map((l, i) => (i === idx ? { ...l, qty_accepted: "" } : l)),
                            );
                          } else {
                            let numVal = Number(val);
                            if (isNaN(numVal) || numVal < 0) numVal = 0;
                            const maxDelivered = Number(line.qty_delivered || 0);
                            if (maxDelivered > 0 && numVal > maxDelivered) {
                              numVal = maxDelivered;
                            }
                            setGrnLines((prev) =>
                              prev.map((l, i) => (i === idx ? { ...l, qty_accepted: numVal } : l)),
                            );
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">PO Rate (₹)</Label>
                      <Input
                        type="number"
                        value={line.unit_price}
                        readOnly
                        title="Set from the purchase order; goods are valued at the PO rate."
                        className="bg-muted/50 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500 font-mono text-[11px]">
                      Rejected Qty:{" "}
                      <strong className="text-amber-600 dark:text-amber-400 font-bold">
                        {Math.max(
                          0,
                          (Number(line.qty_delivered) || 0) - (Number(line.qty_accepted) || 0),
                        )}
                      </strong>
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      Accepted Total: ₹
                      {(
                        (Number(line.qty_accepted) || 0) * (Number(line.unit_price) || 0)
                      ).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setGrnOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateGrn}
                disabled={creatingGrn || !grnPoId || !selectedChallanId}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {creatingGrn ? "Creating..." : "Issue Goods Receipt Note"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Technical Sign-off */}
        <Dialog open={techOpen} onOpenChange={setTechOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Technical Inspection Sign-off</DialogTitle>
              <DialogDescription>
                Departmental technical verification for {activeGrn?.grn_number}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="tech-accept"
                  checked={techAccepted}
                  onCheckedChange={(c) => setTechAccepted(!!c)}
                />
                <Label htmlFor="tech-accept" className="text-sm font-semibold cursor-pointer">
                  Material matches technical specification & works satisfactorily
                </Label>
              </div>

              <div className="space-y-1">
                <Label>Inspection Remarks / Discrepancies</Label>
                <Textarea
                  placeholder="Record operational tests, calibration report number, or rejection reason..."
                  value={techRemarks}
                  onChange={(e) => setTechRemarks(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setTechOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleTechnicalVerify}
                disabled={verifying}
                className={
                  techAccepted
                    ? "bg-purple-600 hover:bg-purple-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                }
              >
                {verifying
                  ? "Submitting..."
                  : techAccepted
                    ? "Sign-off Technical Acceptance"
                    : "Reject Goods"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
