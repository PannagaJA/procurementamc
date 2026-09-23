import { useState, useEffect } from "react";
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
  prepareComparativeStatement,
  approveCs,
  rejectCs,
  listComparativeStatements,
} from "@/lib/procurement/cs.functions";
import { listRfqs } from "@/lib/procurement/rfq.functions";
import {
  Scale,
  PlusCircle,
  CheckCircle,
  XCircle,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Trophy,
  ArrowRight,
} from "lucide-react";

export default function ComparativeStatements() {
  const { toast } = useToast();
  const [csList, setCsList] = useState<any[]>([]);
  const { pagination, setPage, setPageSize, setTotal } = usePagination(10, 1);
  const [rfqList, setRfqList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Prepare CS Modal
  const [prepOpen, setPrepOpen] = useState(false);
  const [selectedRfqId, setSelectedRfqId] = useState("");
  const [selectedRfq, setSelectedRfq] = useState<any>(null);
  const [vendorQuotes, setVendorQuotes] = useState<any[]>([]);
  const [recommendedVendorId, setRecommendedVendorId] = useState("");
  const [isLowestPrice, setIsLowestPrice] = useState(true);
  const [nonLowestRationale, setNonLowestRationale] = useState("");
  const [negotiationNotes, setNegotiationNotes] = useState("");
  const [priceReasonableness, setPriceReasonableness] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Approval/Rejection Modals
  const [activeCs, setActiveCs] = useState<any>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionRemarks, setRejectionRemarks] = useState("");
  const [acting, setActing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [csRes, rfqRes] = await Promise.all([
        (listComparativeStatements as any)(),
        (listRfqs as any)(),
      ]);

      if (csRes?.ok) {
        const list = csRes.comparativeStatements || [];
        setCsList(list);
        setTotal(list.length);
      }
      if (rfqRes?.ok) setRfqList(rfqRes.rfqs || []);
    } catch (e: any) {
      toast({ title: "Error loading data", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When RFQ selection changes in Prepare modal
  useEffect(() => {
    if (!selectedRfqId) {
      setSelectedRfq(null);
      setVendorQuotes([]);
      return;
    }
    const found = rfqList.find((r) => r.id === selectedRfqId);
    setSelectedRfq(found || null);

    if (found && found.quotation_lines) {
      // Group quote lines by vendor
      const map = new Map<string, any>();
      for (const line of found.quotation_lines) {
        if (!map.has(line.vendor_id)) {
          const vObj = found.rfq_vendors?.find(
            (rv: any) => rv.vendor_id === line.vendor_id,
          )?.vendors;
          map.set(line.vendor_id, {
            vendor_id: line.vendor_id,
            vendor_name: vObj?.name || "Vendor",
            total_quoted: 0,
            delivery_days: line.delivery_days || 7,
            warranty_months: line.warranty_months || 12,
            meets_tech_spec: true,
            lines: [],
          });
        }
        const vEntry = map.get(line.vendor_id);
        vEntry.total_quoted += Number(line.total_price || 0);
        if (line.meets_technical_spec === false) {
          vEntry.meets_tech_spec = false;
        }
        vEntry.lines.push(line);
      }

      const list = Array.from(map.values()).sort((a, b) => a.total_quoted - b.total_quoted);
      setVendorQuotes(list);

      if (list.length > 0) {
        const lowestCompliant = list.find((v) => v.meets_tech_spec);
        if (lowestCompliant) {
          setRecommendedVendorId(lowestCompliant.vendor_id);
          setIsLowestPrice(true);
        }
      }
    }
  }, [selectedRfqId, rfqList]);

  // Check if recommended vendor is lowest
  useEffect(() => {
    if (vendorQuotes.length > 0 && recommendedVendorId) {
      const lowestCompliant = vendorQuotes.find((v) => v.meets_tech_spec);
      const isLow = lowestCompliant?.vendor_id === recommendedVendorId;
      setIsLowestPrice(isLow);
    }
  }, [recommendedVendorId, vendorQuotes]);

  const handlePrepareCs = async () => {
    if (!selectedRfqId || !recommendedVendorId) {
      toast({
        title: "Validation Error",
        description: "Please select an RFQ and recommended vendor.",
        variant: "destructive",
      });
      return;
    }

    if (!isLowestPrice && (!nonLowestRationale || !nonLowestRationale.trim())) {
      toast({
        title: "Non-Lowest Price Rationale Required",
        description:
          "You must provide a justification when recommending a vendor other than the lowest quote (§7.2).",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const lineScores = vendorQuotes.map((vq, idx) => ({
        vendor_id: vq.vendor_id,
        quoted_total: vq.total_quoted,
        price_score: Math.max(0, 100 - idx * 10),
        technical_score: vq.meets_tech_spec ? 100 : 40,
        delivery_score: 90,
        warranty_score: 90,
        total_score: vq.meets_tech_spec ? 95 : 50,
        rank: idx + 1,
        notes: vq.meets_tech_spec ? "Technically compliant" : "Failed technical spec",
      }));

      const res = await (prepareComparativeStatement as any)({
        data: {
          rfq_id: selectedRfqId,
          recommended_vendor_id: recommendedVendorId,
          is_lowest_price: isLowestPrice,
          non_lowest_rationale: nonLowestRationale || null,
          negotiation_notes: negotiationNotes || null,
          price_reasonableness_notes: priceReasonableness || null,
          line_scores: lineScores,
        },
      });

      if (!res.ok) {
        toast({ title: "Failed to submit CS", description: res.error, variant: "destructive" });
        return;
      }

      toast({
        title: "Comparative Statement Prepared",
        description: `Routed to ${res.routing?.role?.toUpperCase()} for authority review.`,
      });
      setPrepOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveCs = async (cs: any) => {
    setActing(true);
    try {
      const res = await (approveCs as any)({
        data: { cs_id: cs.id },
      });
      if (!res.ok) {
        toast({ title: "Approval Failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({
        title: "CS Approved",
        description: `Comparative Statement ${cs.cs_number} approved.`,
      });
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleRejectCs = async () => {
    if (!activeCs || !rejectionRemarks.trim()) {
      toast({
        title: "Remarks Required",
        description: "Please enter rejection remarks.",
        variant: "destructive",
      });
      return;
    }
    setActing(true);
    try {
      const res = await (rejectCs as any)({
        data: {
          cs_id: activeCs.id,
          rejection_remarks: rejectionRemarks,
        },
      });
      if (!res.ok) {
        toast({ title: "Rejection Failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "CS Rejected", description: "Sent back to procurement." });
      setRejectOpen(false);
      setRejectionRemarks("");
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 mb-2">
              <Scale className="w-3.5 h-3.5" /> Comparative Statement (CS) Evaluation
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Comparative Statements & Evaluation
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Multi-vendor technical/commercial comparison, mandatory non-lowest rationale gate, and
              authority matrix approval routing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setPrepOpen(true)}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> Prepare CS
            </Button>
          </div>
        </div>

        {/* CS List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading Comparative Statements...</div>
          ) : csList.length === 0 ? (
            <Card className="text-center p-8">
              <p className="text-slate-500">
                No Comparative Statements evaluated yet. Prepare one from an RFQ with quotation
                responses.
              </p>
            </Card>
          ) : (
            (() => {
              const startIndex = (pagination.page - 1) * pagination.pageSize;
              const paginatedCsList = csList.slice(
                startIndex,
                startIndex + pagination.pageSize,
              );
              return (
                <>
                  {paginatedCsList.map((cs) => {
                    const pr = cs.rfqs?.purchase_requisitions;
                    const isPending = cs.status === "submitted";

                    return (
                      <Card
                        key={cs.id}
                        className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300"
                      >
                        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                                  {cs.cs_number || "CS-PENDING"}
                                </span>
                                <Badge
                                  variant={
                                    cs.status === "approved"
                                      ? "default"
                                      : cs.status === "rejected"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {cs.status.toUpperCase()}
                                </Badge>
                                {cs.is_lowest_price ? (
                                  <Badge
                                    variant="outline"
                                    className="text-emerald-700 dark:text-emerald-400 border-emerald-500 gap-1 text-xs"
                                  >
                                    <CheckCircle className="w-3 h-3" /> L1 Lowest Price
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-amber-700 dark:text-amber-400 border-amber-500 gap-1 text-xs"
                                  >
                                    <AlertCircle className="w-3 h-3" /> Non-Lowest (Rationale Provided)
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">
                                RFQ:{" "}
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {cs.rfqs?.rfq_number}
                                </span>{" "}
                                • PR: {pr?.pr_number} • Category: {pr?.category}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {isPending && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => handleApproveCs(cs)}
                                    disabled={acting}
                                    className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" /> Approve CS
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => {
                                      setActiveCs(cs);
                                      setRejectOpen(true);
                                    }}
                                    disabled={acting}
                                    className="gap-1"
                                  >
                                    <XCircle className="w-3.5 h-3.5" /> Reject
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4 text-sm space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg text-xs">
                            <div>
                              <span className="text-slate-500 block">Recommended Vendor</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {cs.vendors?.name || "Selected Vendor"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Recommended Amount</span>
                              <span className="font-mono font-bold text-slate-900 dark:text-white">
                                ₹{Number(cs.recommended_total || 0).toLocaleString("en-IN")}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Authority Routing</span>
                              <Badge
                                variant="outline"
                                className="font-semibold bg-purple-50 text-purple-700 border-purple-300"
                              >
                                {cs.current_approver_role?.toUpperCase()}
                              </Badge>
                            </div>
                          </div>

                          {/* Non-lowest justification notice if applicable */}
                          {!cs.is_lowest_price && cs.non_lowest_rationale && (
                            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900 rounded-lg text-xs text-amber-900 dark:text-amber-200">
                              <span className="font-semibold">Non-Lowest Rationale: </span>
                              {cs.non_lowest_rationale}
                            </div>
                          )}

                          {/* Line items table */}
                          {cs.comparative_statement_lines &&
                            cs.comparative_statement_lines.length > 0 && (
                              <div className="overflow-x-auto border rounded-lg">
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    <tr>
                                      <th className="p-2">Vendor</th>
                                      <th className="p-2 text-right">Quoted Value</th>
                                      <th className="p-2 text-right">Negotiated Value</th>
                                      <th className="p-2 text-center">Tech Spec</th>
                                      <th className="p-2 text-center">Total Score</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {cs.comparative_statement_lines.map((ls: any) => (
                                      <tr
                                        key={ls.id}
                                        className={
                                          ls.vendor_id === cs.recommended_vendor_id
                                            ? "bg-emerald-50/50 dark:bg-emerald-950/20 font-medium"
                                            : ""
                                        }
                                      >
                                        <td className="p-2">
                                          {ls.vendors?.name || "Vendor"}
                                          {ls.vendor_id === cs.recommended_vendor_id && (
                                            <Badge className="ml-2 text-[10px] bg-emerald-600 text-white">
                                              Recommended
                                            </Badge>
                                          )}
                                        </td>
                                        <td className="p-2 text-right font-mono">
                                          ₹{Number(ls.quoted_total || 0).toLocaleString("en-IN")}
                                        </td>
                                        <td className="p-2 text-right font-mono font-semibold">
                                          ₹
                                          {Number(
                                            ls.final_negotiated_total || ls.quoted_total || 0,
                                          ).toLocaleString("en-IN")}
                                        </td>
                                        <td className="p-2 text-center">
                                          {ls.meets_technical_specs ? (
                                            <Badge
                                              variant="outline"
                                              className="text-emerald-600 border-emerald-500 text-[10px]"
                                            >
                                              YES
                                            </Badge>
                                          ) : (
                                            <Badge
                                              variant="outline"
                                              className="text-red-600 border-red-500 text-[10px]"
                                            >
                                              NO
                                            </Badge>
                                          )}
                                        </td>
                                        <td className="p-2 text-center font-semibold">
                                          {ls.total_score || "-"}
                                        </td>
                                      </tr>
                                    ))}
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
                    totalPages={pagination.totalPages}
                    pageSize={pagination.pageSize}
                    totalItems={pagination.total}
                    currentItemsCount={paginatedCsList.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </>
              );
            })()
          )}
        </div>

        {/* Modal: Prepare Comparative Statement */}
        <Dialog open={prepOpen} onOpenChange={setPrepOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Prepare Comparative Statement</DialogTitle>
              <DialogDescription>
                Compare vendor quotations, evaluate technical compliance, and formulate
                recommendation.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Select RFQ</Label>
                <Select value={selectedRfqId} onValueChange={setSelectedRfqId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select RFQ with responses..." />
                  </SelectTrigger>
                  <SelectContent>
                    {rfqList
                      .filter((r) => r.status === "sent")
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.rfq_number} — PR: {r.purchase_requisitions?.pr_number} (
                          {r.quotation_lines?.length || 0} quotes)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Vendor Quotes Overview */}
              {vendorQuotes.length > 0 && (
                <div className="space-y-3">
                  <Label>Quotation Responses Comparison</Label>
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 dark:bg-slate-800">
                        <tr>
                          <th className="p-2">Vendor</th>
                          <th className="p-2 text-right">Quoted Total</th>
                          <th className="p-2 text-center">Tech Spec</th>
                          <th className="p-2 text-center">Delivery</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {vendorQuotes.map((vq, i) => (
                          <tr key={vq.vendor_id}>
                            <td className="p-2 font-medium">
                              {vq.vendor_name} {i === 0 && "(Lowest)"}
                            </td>
                            <td className="p-2 text-right font-mono font-semibold">
                              ₹{vq.total_quoted.toLocaleString("en-IN")}
                            </td>
                            <td className="p-2 text-center">
                              {vq.meets_tech_spec ? (
                                <Badge variant="outline" className="text-emerald-600 text-[10px]">
                                  Compliant
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-red-600 text-[10px]">
                                  Non-Compliant
                                </Badge>
                              )}
                            </td>
                            <td className="p-2 text-center">{vq.delivery_days} days</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Recommendation Picker */}
                  <div className="space-y-2 pt-2">
                    <Label>Recommended Vendor</Label>
                    <Select value={recommendedVendorId} onValueChange={setRecommendedVendorId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select recommended vendor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorQuotes.map((vq) => (
                          <SelectItem key={vq.vendor_id} value={vq.vendor_id}>
                            {vq.vendor_name} — ₹{vq.total_quoted.toLocaleString("en-IN")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Non-lowest price rationale (CONDITIONAL & REQUIRED) */}
                  {!isLowestPrice && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-semibold text-xs">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        Non-Lowest Bidder Justification Mandatory
                      </div>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        You have selected a vendor that did not submit the lowest quotation. Please
                        record the comprehensive technical or warranty justification before
                        submission.
                      </p>
                      <Textarea
                        placeholder="Detail specific technical superiority, warranty terms, or vendor track record justifying higher cost..."
                        value={nonLowestRationale}
                        onChange={(e) => setNonLowestRationale(e.target.value)}
                        rows={3}
                        className="bg-white dark:bg-slate-900"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Negotiation Notes</Label>
                    <Input
                      placeholder="Discount achieved through post-quote negotiation..."
                      value={negotiationNotes}
                      onChange={(e) => setNegotiationNotes(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Price Reasonableness Remarks</Label>
                    <Input
                      placeholder="Comparison against past purchase orders or market benchmark..."
                      value={priceReasonableness}
                      onChange={(e) => setPriceReasonableness(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPrepOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handlePrepareCs}
                disabled={submitting || !selectedRfqId || !recommendedVendorId}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submitting ? "Submitting..." : "Submit CS for Approval"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Reject CS */}
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reject Comparative Statement</DialogTitle>
              <DialogDescription>
                Record observations/reasons for returning CS {activeCs?.cs_number} to procurement.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Label>Rejection Observations / Instructions</Label>
              <Textarea
                placeholder="State reasons e.g. insufficient vendor quotes, requirement for further negotiation..."
                value={rejectionRemarks}
                onChange={(e) => setRejectionRemarks(e.target.value)}
                rows={4}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectCs}
                disabled={acting || !rejectionRemarks.trim()}
              >
                {acting ? "Rejecting..." : "Reject CS"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
