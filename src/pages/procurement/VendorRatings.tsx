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
  listVendorRatings,
} from "@/lib/procurement/vendorRating.functions";
import {
  Award,
  PlusCircle,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Star,
  Building2,
  BarChart3,
} from "lucide-react";

export default function VendorRatings() {
  const { toast } = useToast();
  const [ratings, setRatings] = useState<any[]>([]);
  const { pagination, setPage, setPageSize, setTotal } = usePagination(10, 1);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [submitting, setSubmitting] = useState(false);

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
        setTotal(list.length);
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

  const getOutcomeBadge = (outcome: string) => {
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
        return <Badge className="bg-red-600 text-white">Debarred / Blacklisted</Badge>;
      default:
        return <Badge variant="outline">{outcome}</Badge>;
    }
  };

  const handleSubmitRating = async () => {
    if (!selectedVendorId) {
      toast({
        title: "Select Vendor",
        description: "Please select a vendor to evaluate.",
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

      toast({
        title: "Vendor Performance Rating Recorded",
        description: `Weighted Score: ${res.weightedScore} → Outcome: ${res.outcome.toUpperCase()}`,
      });
      setRateOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200 mb-2">
              <Award className="w-3.5 h-3.5 text-purple-600" /> SOP Annexure 4 Vendor Performance
              Evaluation
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
              const startIndex = (pagination.page - 1) * pagination.pageSize;
              const paginatedRatings = ratings.slice(
                startIndex,
                startIndex + pagination.pageSize,
              );
              return (
                <>
                  {paginatedRatings.map((r) => {
                    const vendor = r.vendors;

                    return (
                      <Card
                        key={r.id}
                        className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300"
                      >
                        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-base text-slate-900 dark:text-slate-100">
                                  {vendor?.name}
                                </span>
                                {getOutcomeBadge(r.outcome)}
                                <Badge variant="outline" className="text-xs">
                                  Period: {r.review_period}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500">
                                GST: {vendor?.gst_number || "N/A"} • Current Status in Master:{" "}
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {vendor?.status}
                                </span>
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
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
                        </CardContent>
                      </Card>
                    );
                  })}

                  <PaginationControls
                    currentPage={pagination.page}
                    totalPages={pagination.totalPages}
                    pageSize={pagination.pageSize}
                    totalItems={pagination.total}
                    currentItemsCount={paginatedRatings.length}
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
              <DialogTitle>Vendor Performance Evaluation (Annexure 4)</DialogTitle>
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
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitRating}
                disabled={submitting || !selectedVendorId}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {submitting ? "Recording..." : "Record Rating & Apply Status"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
