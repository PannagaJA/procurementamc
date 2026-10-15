import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
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
  computeWeightedScore,
  deriveOutcome,
  submitVendorRating,
  countersignDebarment,
  listVendorRatings,
} from "@/lib/procurement/vendorRating.functions";
import {
  Award,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Star,
  Building2,
  BarChart3,
  ChevronDown,
  ChevronUp,
  History,
  Send,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function VendorRatings() {
  const { toast } = useToast();
  const auth = useAuth();
  const isEvpOrAdmin = auth.hasRole("evp") || auth.hasRole("admin");
  const [ratings, setRatings] = useState<any[]>([]);
  const { pagination, setPage, setPageSize, setTotal } = usePagination(10, 1);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  // Evaluation Form Modal
  const [rateOpen, setRateOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [reviewPeriod, setReviewPeriod] = useState("FY2026-Q2");
  const [secA, setSecA] = useState(85); // Quality (25%)
  const [secB, setSecB] = useState(80); // Delivery (20%)
  const [secC, setSecC] = useState(80); // Price (15%)
  const [secD, setSecD] = useState(85); // Service (20%)
  const [includeSecE, setIncludeSecE] = useState(true);
  const [secE, setSecE] = useState(80); // Safety (10%)
  const [secF, setSecF] = useState(85); // Relations (10%)
  const [notes, setNotes] = useState("");
  const [evpAuthRef, setEvpAuthRef] = useState(""); // Required when score < 40 (debarment)
  const [submitting, setSubmitting] = useState(false);

  // Countersign Modal for EVP
  const [countersignOpen, setCountersignOpen] = useState(false);
  const [countersignRating, setCountersignRating] = useState<any>(null);
  const [countersignRef, setCountersignRef] = useState("");
  const [countersigning, setCountersigning] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rRes, vRes] = await Promise.all([
        (listVendorRatings as any)(),
        supabase.from("vendors").select("id, name, gst_number, status"),
      ]);

      if (rRes?.ok) {
        const list = rRes.vendorRatings || [];
        setRatings(list);

        // Group ratings by vendor_id to know unique count for pagination
        const vendorMap = new Map<string, any[]>();
        list.forEach((r: any) => {
          const vId = r.vendor_id || r.vendors?.id;
          if (!vendorMap.has(vId)) {
            vendorMap.set(vId, []);
          }
          vendorMap.get(vId)!.push(r);
        });
        setTotal(vendorMap.size);
      }
      setVendors(vRes.data || []);
    } catch (e: any) {
      toast({ title: "Error loading data", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute live weighted score & outcome
  const liveScore = computeWeightedScore({
    section_a_score: secA,
    section_b_score: secB,
    section_c_score: secC,
    section_d_score: secD,
    section_e_score: includeSecE ? secE : null,
    section_f_score: secF,
  });

  const liveOutcome = deriveOutcome(liveScore);

  const getOutcomeBadge = (outcome: string, evpApprovedBy?: string | null) => {
    switch (outcome) {
      case "preferred":
        return <Badge className="bg-emerald-600 text-white">Preferred (Fast-Track)</Badge>;
      case "active":
        return <Badge className="bg-blue-600 text-white">Active (Standard)</Badge>;
      case "active_notice":
        return <Badge className="bg-amber-500 text-white">Active (Improvement Notice)</Badge>;
      case "suspended":
        return <Badge className="bg-orange-600 text-white">Suspended (6-12 Months)</Badge>;
      case "debarred":
        if (evpApprovedBy === null) {
          return (
            <Badge className="bg-amber-600 text-white border-amber-500">
              Debarment Pending EVP Sign-Off
            </Badge>
          );
        }
        return <Badge className="bg-red-600 text-white">Debarred / Blacklisted</Badge>;
      default:
        return <Badge variant="outline">{outcome}</Badge>;
    }
  };

  const handleSubmitRating = async (submitForCountersignature = false) => {
    if (!selectedVendorId) {
      toast({
        title: "Select Vendor",
        description: "Please select a vendor to evaluate.",
        variant: "destructive",
      });
      return;
    }

    if (liveScore < 40 && !isEvpOrAdmin && !submitForCountersignature) {
      toast({
        title: "EVP Countersignature Required",
        description:
          "A score below 40 debars this vendor, which only the Executive Vice President (EVP) can authorize. Send this rating to the EVP for countersignature.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await (submitVendorRating as any)({
        data: {
          vendor_id: selectedVendorId,
          review_period: reviewPeriod,
          section_a_score: secA,
          section_b_score: secB,
          section_c_score: secC,
          section_d_score: secD,
          section_e_score: includeSecE ? secE : null,
          section_f_score: secF,
          notes: notes || null,
          evp_approved_by: liveScore < 40 ? evpAuthRef.trim() || null : null,
          submit_for_countersignature: submitForCountersignature,
        },
      });

      if (!res.ok) {
        toast({
          title: "Rating Submission Blocked",
          description: res.error,
          variant: "destructive",
        });
        return;
      }

      if (res.pendingCountersignature) {
        toast({
          title: "Debarment Recommendation Submitted",
          description: `Score ${res.weightedScore}/100 recorded. Evaluation successfully routed to Executive Vice President (evp@institution.edu) for countersignature.`,
        });
      } else {
        toast({
          title: "Vendor Performance Rating Recorded",
          description: `Weighted Score: ${res.weightedScore} → Outcome: ${res.outcome.toUpperCase()}`,
        });
      }

      setRateOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCountersign = async () => {
    if (!countersignRating || !countersignRef.trim()) return;
    setCountersigning(true);
    try {
      const res = await (countersignDebarment as any)({
        data: {
          rating_id: countersignRating.id,
          evp_reference: countersignRef.trim(),
        },
      });

      if (!res.ok) {
        toast({
          title: "Countersignature Failed",
          description: res.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Debarment Order Authorized",
        description: `Vendor ${countersignRating.vendors?.name || ""} is now officially debarred and blacklisted.`,
      });
      setCountersignOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCountersigning(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200 mb-2">
              <Award className="w-3.5 h-3.5 text-purple-600" /> Vendor Performance Evaluation
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Vendor Ratings & Performance Governance
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              6-Pillar weighted scoring, automated outcome banding, and automatic vendor suspension
              / debarment gates.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setRateOpen(true)}
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> Evaluate Vendor
            </Button>
          </div>
        </div>

        {/* Ratings List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading vendor evaluations...</div>
          ) : ratings.length === 0 ? (
            <Card className="text-center p-8">
              <p className="text-slate-500">
                No vendor evaluations recorded yet. Evaluate a vendor using the 6-pillar form.
              </p>
            </Card>
          ) : (
            (() => {
              // Group ratings by vendor ID preserving chronological sorting
              const vendorGroupsMap = new Map<string, { vendor: any; latest: any; history: any[] }>();

              ratings.forEach((r) => {
                const vId = r.vendor_id || r.vendors?.id;
                if (!vId) return;
                const liveVendor = vendors.find((v) => v.id === vId) || r.vendors;
                if (!vendorGroupsMap.has(vId)) {
                  vendorGroupsMap.set(vId, {
                    vendor: liveVendor,
                    latest: r,
                    history: [],
                  });
                } else {
                  vendorGroupsMap.get(vId)!.history.push(r);
                }
              });

              const groupedVendors = Array.from(vendorGroupsMap.values());
              const startIndex = (pagination.page - 1) * pagination.pageSize;
              const paginatedGroups = groupedVendors.slice(
                startIndex,
                startIndex + pagination.pageSize,
              );

              const getStatusBadge = (status: string) => {
                switch (status) {
                  case "empanelled":
                    return <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600">Empanelled</Badge>;
                  case "debarred":
                  case "blacklisted":
                    return <Badge className="bg-red-600 text-white hover:bg-red-600">Debarred / Blacklisted</Badge>;
                  case "suspended":
                    return <Badge className="bg-orange-600 text-white hover:bg-orange-600">Suspended</Badge>;
                  case "applied":
                    return <Badge className="bg-blue-600 text-white hover:bg-blue-600">Applied</Badge>;
                  case "rejected":
                    return <Badge variant="destructive">Rejected</Badge>;
                  default:
                    return <Badge variant="outline">{status}</Badge>;
                }
              };

              return (
                <>
                  {paginatedGroups.map(({ vendor, latest: r, history }) => {
                    const isExpanded = expandedHistory[vendor?.id];
                    const hasHistory = history.length > 0;

                    return (
                      <Card
                        key={vendor?.id || r.id}
                        className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300"
                      >
                        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-base text-slate-900 dark:text-slate-100">
                                  {vendor?.name}
                                </span>
                                {getOutcomeBadge(r.outcome, r.evp_approved_by)}
                                <Badge variant="outline" className="text-xs">
                                  Period: {r.review_period}
                                </Badge>
                                {hasHistory && (
                                  <Badge variant="secondary" className="text-[11px] font-normal gap-1">
                                    <History className="w-3 h-3" />
                                    {history.length} earlier {history.length === 1 ? "evaluation" : "evaluations"}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                                <span>GST: {vendor?.gst_number || "N/A"}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1.5">
                                  Current Status in Master:
                                  {getStatusBadge(vendor?.status)}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="text-[10px] text-slate-500 block uppercase font-bold">
                                  Weighted Score
                                </span>
                                <span className="font-mono font-extrabold text-xl text-purple-700 dark:text-purple-400">
                                  {r.weighted_score} / 100
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-4 text-sm space-y-3">
                          {r.outcome === "debarred" && !r.evp_approved_by && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                              <div className="flex items-start gap-2.5">
                                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                <div className="space-y-0.5 text-xs">
                                  <p className="font-bold text-amber-950 dark:text-amber-100">
                                    Debarment Recommendation Awaiting EVP Countersignature
                                  </p>
                                  <p className="text-amber-800 dark:text-amber-300">
                                    The recorded score is below 40. The vendor will not be debarred until the Executive Vice President (EVP) countersigns.
                                  </p>
                                </div>
                              </div>
                              {isEvpOrAdmin ? (
                                <Button
                                  size="sm"
                                  className="bg-amber-700 hover:bg-amber-800 text-white font-semibold shrink-0 gap-1.5 shadow-sm"
                                  onClick={() => {
                                    setCountersignRating(r);
                                    setCountersignRef("");
                                    setCountersignOpen(true);
                                  }}
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                  Authorize &amp; Countersign Debarment
                                </Button>
                              ) : (
                                <Badge variant="outline" className="border-amber-400 bg-amber-100/50 text-amber-900 dark:text-amber-200 shrink-0 self-start sm:self-center">
                                  Pending EVP Review
                                </Badge>
                              )}
                            </div>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg text-xs text-center">
                            <div className="p-1 border rounded bg-white dark:bg-slate-900">
                              <span className="text-[10px] text-slate-400 block font-medium">
                                Quality (25%)
                              </span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {r.section_a_score}
                              </span>
                            </div>
                            <div className="p-1 border rounded bg-white dark:bg-slate-900">
                              <span className="text-[10px] text-slate-400 block font-medium">
                                Delivery (20%)
                              </span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {r.section_b_score}
                              </span>
                            </div>
                            <div className="p-1 border rounded bg-white dark:bg-slate-900">
                              <span className="text-[10px] text-slate-400 block font-medium">
                                Pricing (15%)
                              </span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {r.section_c_score}
                              </span>
                            </div>
                            <div className="p-1 border rounded bg-white dark:bg-slate-900">
                              <span className="text-[10px] text-slate-400 block font-medium">
                                Support (20%)
                              </span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {r.section_d_score}
                              </span>
                            </div>
                            <div className="p-1 border rounded bg-white dark:bg-slate-900">
                              <span className="text-[10px] text-slate-400 block font-medium">
                                Safety (10%)
                              </span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {r.section_e_score ?? "N/A"}
                              </span>
                            </div>
                            <div className="p-1 border rounded bg-white dark:bg-slate-900">
                              <span className="text-[10px] text-slate-400 block font-medium">
                                Relations (10%)
                              </span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {r.section_f_score}
                              </span>
                            </div>
                          </div>

                          {r.notes && (
                            <div className="text-xs text-slate-600 dark:text-slate-400">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                Committee Remarks:{" "}
                              </span>
                              {r.notes}
                            </div>
                          )}

                          {hasHistory && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setExpandedHistory((prev) => ({
                                    ...prev,
                                    [vendor?.id]: !prev[vendor?.id],
                                  }))
                                }
                                className="text-xs h-7 px-2 text-purple-700 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 gap-1.5"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="w-3.5 h-3.5" />
                                    Hide Past Evaluations ({history.length})
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                    View Past Evaluations ({history.length})
                                  </>
                                )}
                              </Button>

                              {isExpanded && (
                                <div className="mt-3 space-y-2.5 pl-3 border-l-2 border-purple-200 dark:border-purple-900">
                                  {history.map((h: any) => (
                                    <div
                                      key={h.id}
                                      className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-md text-xs space-y-2 border border-slate-200/80 dark:border-slate-800"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          {getOutcomeBadge(h.outcome, h.evp_approved_by)}
                                          <Badge variant="outline" className="text-[10px]">
                                            Period: {h.review_period}
                                          </Badge>
                                          <span className="text-[11px] text-slate-500">
                                            {new Date(h.created_at).toLocaleDateString()}
                                          </span>
                                        </div>
                                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                          Score: {h.weighted_score} / 100
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-6 gap-1.5 text-[11px] text-center text-slate-600 dark:text-slate-400">
                                        <div className="bg-white dark:bg-slate-950 p-1 rounded">
                                          Q: {h.section_a_score}
                                        </div>
                                        <div className="bg-white dark:bg-slate-950 p-1 rounded">
                                          D: {h.section_b_score}
                                        </div>
                                        <div className="bg-white dark:bg-slate-950 p-1 rounded">
                                          P: {h.section_c_score}
                                        </div>
                                        <div className="bg-white dark:bg-slate-950 p-1 rounded">
                                          S: {h.section_d_score}
                                        </div>
                                        <div className="bg-white dark:bg-slate-950 p-1 rounded">
                                          Saf: {h.section_e_score ?? "N/A"}
                                        </div>
                                        <div className="bg-white dark:bg-slate-950 p-1 rounded">
                                          R: {h.section_f_score}
                                        </div>
                                      </div>

                                      {h.notes && (
                                        <p className="text-[11px] text-slate-500 italic">
                                          Remarks: {h.notes}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
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
                    currentItemsCount={paginatedGroups.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </>
              );
            })()
          )}
        </div>

        {/* Modal: Evaluate Vendor */}
        <Dialog open={rateOpen} onOpenChange={setRateOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Vendor Performance Evaluation</DialogTitle>
              <DialogDescription>
                6-Section weighted scoring formula. Score updates vendor status in master upon
                recording.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Vendor</Label>
                  <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} ({v.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Review Period</Label>
                  <Input value={reviewPeriod} onChange={(e) => setReviewPeriod(e.target.value)} />
                </div>
              </div>

              {/* Live Score Preview Header */}
              <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-900 flex items-center justify-between">
                <div>
                  <span className="text-xs text-purple-800 dark:text-purple-300 block font-medium">
                    Computed Weighted Score:
                  </span>
                  <span className="font-mono font-extrabold text-2xl text-purple-900 dark:text-purple-100">
                    {liveScore} / 100
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block text-right font-medium">
                    Outcome Band:
                  </span>
                  {getOutcomeBadge(liveOutcome)}
                </div>
              </div>

              {/* Section Sliders */}
              <div className="space-y-3 text-xs">
                {/* A */}
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>Section A: Quality & Technical Spec Compliance (Weight 25%)</span>
                    <span className="font-mono text-purple-600">{secA} / 100</span>
                  </div>
                  <Slider
                    value={[secA]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => setSecA(v)}
                  />
                </div>

                {/* B */}
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>Section B: Delivery Timeline & Schedule Adherence (Weight 20%)</span>
                    <span className="font-mono text-purple-600">{secB} / 100</span>
                  </div>
                  <Slider
                    value={[secB]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => setSecB(v)}
                  />
                </div>

                {/* C */}
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>Section C: Commercial Terms & Price Stability (Weight 15%)</span>
                    <span className="font-mono text-purple-600">{secC} / 100</span>
                  </div>
                  <Slider
                    value={[secC]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => setSecC(v)}
                  />
                </div>

                {/* D */}
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>Section D: Warranty & Technical Support (Weight 20%)</span>
                    <span className="font-mono text-purple-600">{secD} / 100</span>
                  </div>
                  <Slider
                    value={[secD]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => setSecD(v)}
                  />
                </div>

                {/* E */}
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="inc-e"
                        checked={includeSecE}
                        onCheckedChange={(c) => setIncludeSecE(!!c)}
                      />
                      <Label htmlFor="inc-e" className="font-semibold cursor-pointer">
                        Section E: Safety & Statutory Compliance (Weight 10%)
                      </Label>
                    </div>
                    {includeSecE ? (
                      <span className="font-mono text-purple-600">{secE} / 100</span>
                    ) : (
                      <span className="text-slate-400">N/A (Weight Redistributed)</span>
                    )}
                  </div>
                  {includeSecE && (
                    <Slider
                      value={[secE]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([v]) => setSecE(v)}
                    />
                  )}
                </div>

                {/* F */}
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>Section F: Responsiveness & Relationship (Weight 10%)</span>
                    <span className="font-mono text-purple-600">{secF} / 100</span>
                  </div>
                  <Slider
                    value={[secF]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => setSecF(v)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Evaluation Notes & Summary</Label>
                <Textarea
                  placeholder="Record justification or specific incident references..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Debarment Warning + EVP Auth — shown only when score < 40 */}
              {liveScore < 40 && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl space-y-2.5">
                  <div className="flex items-start gap-2 text-xs text-red-900 dark:text-red-200">
                    <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-bold block text-sm text-red-950 dark:text-red-100">
                        Debarment Requires EVP Countersignature
                      </span>
                      <p className="text-red-800 dark:text-red-300">
                        Score <strong>{liveScore} &lt; 40</strong> will debar this vendor. Debarment must be authorized and countersigned by the Executive Vice President (EVP).
                      </p>
                      {!isEvpOrAdmin ? (
                        <div className="p-2 bg-red-100/70 dark:bg-red-900/40 rounded border border-red-300 dark:border-red-800 text-[11px] font-medium text-red-900 dark:text-red-200">
                          🔒 <strong>Access Locked:</strong> You are currently signed in as <u>{auth.user?.email || "Procurement Officer"}</u>. A procurement officer cannot finalize debarment unilaterally. Please sign in as <strong>evp@institution.edu</strong> to countersign and enforce this debarment order.
                        </div>
                      ) : (
                        <div className="p-2 bg-emerald-100/70 dark:bg-emerald-950/40 rounded border border-emerald-300 dark:border-emerald-800 text-[11px] font-medium text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            <strong>Executive Authority Verified:</strong> Signed in as {auth.user?.email}. Enter the formal authorization memo or order reference below to countersign.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {isEvpOrAdmin && (
                    <div className="space-y-1 pt-1">
                      <Label className="text-red-900 dark:text-red-200 text-xs font-semibold">
                        EVP Authorization Reference / Order No. *
                      </Label>
                      <Input
                        placeholder="e.g. EVP/AUTH/2026-10"
                        value={evpAuthRef}
                        onChange={(e) => setEvpAuthRef(e.target.value)}
                        className="border-red-400 focus:ring-red-500 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setRateOpen(false)}>
                Cancel
              </Button>

              {liveScore < 40 && !isEvpOrAdmin ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleSubmitRating(false)}
                    disabled={submitting || !selectedVendorId}
                    className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950 text-xs"
                  >
                    Attempt Direct Finalize
                  </Button>
                  <Button
                    onClick={() => handleSubmitRating(true)}
                    disabled={submitting || !selectedVendorId}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5 shadow-sm text-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {submitting ? "Submitting..." : "Send to EVP for Countersignature"}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => handleSubmitRating(false)}
                  disabled={
                    submitting ||
                    !selectedVendorId ||
                    (liveScore < 40 && isEvpOrAdmin && !evpAuthRef.trim())
                  }
                  className={
                    liveScore < 40
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-purple-600 hover:bg-purple-700 text-white"
                  }
                >
                  {submitting
                    ? "Processing..."
                    : liveScore < 40
                      ? "Authorize Debarment & Apply Blacklist"
                      : "Record Rating & Apply Status"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* EVP Countersignature Dialog */}
        <Dialog open={countersignOpen} onOpenChange={setCountersignOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <ShieldAlert className="w-5 h-5 text-red-600" />
                Authorize &amp; Countersign Debarment
              </DialogTitle>
              <DialogDescription>
                Countersign to confirm this vendor's debarment.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Vendor:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {countersignRating?.vendors?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Weighted Performance Score:</span>
                  <span className="font-bold font-mono text-red-700 dark:text-red-400">
                    {countersignRating?.weighted_score} / 100
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Review Period:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {countersignRating?.review_period}
                  </span>
                </div>
                {countersignRating?.notes && (
                  <div className="pt-1 border-t border-red-100 dark:border-red-900/60">
                    <span className="text-slate-500 block">Committee Notes:</span>
                    <span className="text-slate-700 dark:text-slate-300 italic">
                      {countersignRating.notes}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="evp-ref" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  EVP Authorization Reference / Order Memo *
                </Label>
                <Input
                  id="evp-ref"
                  placeholder="e.g. EVP/AUTH/2026-10"
                  value={countersignRef}
                  onChange={(e) => setCountersignRef(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-slate-500">
                  Entering an executive reference will permanently transition the vendor to <strong className="text-red-600">Debarred</strong> status in Vendor Master and add them to the institutional procurement blacklist.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCountersignOpen(false)} disabled={countersigning}>
                Cancel
              </Button>
              <Button
                onClick={handleCountersign}
                disabled={countersigning || !countersignRef.trim()}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                {countersigning ? "Countersigning..." : "Confirm Debarment & Blacklist"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
