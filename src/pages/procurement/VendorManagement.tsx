import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  Building2,
  CheckCircle,
  XCircle,
  AlertOctagon,
  FileCheck,
  Award,
  ArrowRight,
  UserCheck,
  Calendar,
} from "lucide-react";
import {
  applyEmpanelment,
  evaluateVendor,
  approveEmpanelment,
  rejectEmpanelment,
  listVendorsForReview,
} from "@/lib/procurement/vendors.functions";
import { useAuth } from "@/lib/auth";

export default function VendorManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const auth = useAuth();

  const [activeTab, setActiveTab] = useState("apply");
  const [vendors, setVendors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  // Apply Form State
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");

  // Evaluation Form State
  const [evaluatingVendorId, setEvaluatingVendorId] = useState<string>("");
  const [techScore, setTechScore] = useState<number>(85);
  const [expScore, setExpScore] = useState<number>(80);
  const [supportScore, setSupportScore] = useState<number>(90);
  const [financialScore, setFinancialScore] = useState<number>(85);
  const [decision, setDecision] = useState<"recommend" | "not_recommend">("recommend");
  const [evalNotes, setEvalNotes] = useState("");

  // EVP Approval State
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const loadVendors = async () => {
    try {
      setIsLoading(true);
      const res = await listVendorsForReview({});
      setVendors(res.vendors || []);
      setUserRoles(res.roles || []);
    } catch (err) {
      console.error("Failed to load vendors", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVendors();
  }, []);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Vendor name is required", variant: "destructive" });
      return;
    }

    try {
      setIsLoading(true);
      const res = await applyEmpanelment({
        data: {
          name: name.trim(),
          registered_address: address.trim() || null,
          gst_number: gstNumber.trim().toUpperCase() || null,
          pan_number: panNumber.trim().toUpperCase() || null,
          bank_details: {
            account_number: accountNo.trim(),
            ifsc_code: ifsc.trim().toUpperCase(),
            bank_name: bankName.trim(),
          },
        },
      });

      if (!res.ok) {
        toast({
          title: "Application Failed",
          description: (res as any).error || "Server rejected application",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Vendor Application Submitted!",
        description: `Vendor "${res.vendor.name}" registered in 'applied' status. Proceed to Evaluation.`,
      });

      setName("");
      setAddress("");
      setGstNumber("");
      setPanNumber("");
      setAccountNo("");
      setIfsc("");
      setBankName("");

      await loadVendors();
      setActiveTab("evaluate");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evaluatingVendorId) {
      toast({ title: "Please select a vendor to evaluate", variant: "destructive" });
      return;
    }

    try {
      setIsLoading(true);
      const res = await evaluateVendor({
        data: {
          vendor_id: evaluatingVendorId,
          technical_capability: Number(techScore),
          experience_past_performance: Number(expScore),
          service_support: Number(supportScore),
          financial_reasonableness: Number(financialScore),
          decision,
          notes: evalNotes.trim() || null,
        },
      });

      if (!res.ok) {
        toast({
          title: "Evaluation Failed",
          description: (res as any).error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Evaluation Recorded!",
        description: 'Vendor status changed to "under_review". Ready for EVP Approval.',
      });

      setEvaluatingVendorId("");
      setEvalNotes("");
      await loadVendors();
      setActiveTab("evp_approval");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvpApprove = async (vendorId: string) => {
    try {
      setIsLoading(true);
      const res = await approveEmpanelment({
        data: {
          vendor_id: vendorId,
          notes: approvalNotes.trim() || null,
        },
      });

      if (!res.ok) {
        toast({
          title: "EVP Approval Rejected",
          description: (res as any).error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Vendor Empanelled Successfully!",
        description: `Vendor is now empanelled for 1 year (Empanelled on: ${res.empanelled_on}).`,
      });

      await loadVendors();
    } catch (err: any) {
      toast({ title: "Approval Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvpReject = async (vendorId: string) => {
    if (!rejectReason.trim()) {
      toast({ title: "Rejection reason is required", variant: "destructive" });
      return;
    }

    try {
      setIsLoading(true);
      const res = await rejectEmpanelment({
        data: {
          vendor_id: vendorId,
          reason: rejectReason.trim(),
        },
      });

      if (!res.ok) {
        toast({
          title: "Rejection Failed",
          description: (res as any).error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Vendor Application Rejected",
        description: "Recorded in vendor evaluation history.",
      });

      setRejectReason("");
      await loadVendors();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const appliedVendors = vendors.filter((v) => v.status === "applied");
  const reviewVendors = vendors.filter((v) => v.status === "under_review");
  const empanelledVendors = vendors.filter((v) => v.status === "empanelled");

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> Vendor Empanelment & Compliance
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Vendor Empanelment & EVP Approval
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1">
              Multi-stage vendor qualification lifecycle: Application → Technical Evaluation → EVP
              Approval Gate.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full sm:w-auto shrink-0"
            onClick={() => navigate({ to: "/procurement/raise-pr" })}
          >
            Raise Requisition <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>

        {/* User Role Indicator Banner */}
        <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-2 flex-wrap">
            <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-medium">Active Session Roles:</span>
            <span className="font-bold text-slate-900 dark:text-white uppercase bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
              {userRoles.join(", ") || "user"}
            </span>
          </div>
          <div className="text-slate-500 italic text-[11px] sm:text-xs">
            * Note: Only users with the <strong>EVP</strong> (or Admin) role can approve vendor
            empanelment. Non-EVP users will be rejected server-side.
          </div>
        </div>

        {/* Tabs Container */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="w-full overflow-x-auto pb-1 scrollbar-none">
            <TabsList className="inline-flex w-full sm:w-auto h-auto p-1.5 gap-1.5 bg-slate-200/70 dark:bg-slate-800/80 rounded-xl">
              <TabsTrigger
                value="apply"
                className="font-semibold text-xs sm:text-sm py-2 px-3.5 whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                1. Apply for Empanelment
              </TabsTrigger>
              <TabsTrigger
                value="evaluate"
                className="font-semibold text-xs sm:text-sm py-2 px-3.5 whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                2. Technical Evaluation ({appliedVendors.length})
              </TabsTrigger>
              <TabsTrigger
                value="evp_approval"
                className="font-semibold text-xs sm:text-sm py-2 px-3.5 whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                3. EVP Approval Gate ({reviewVendors.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: APPLICATION */}
          <TabsContent value="apply">
            <Card className="shadow-sm border-slate-200 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" /> Vendor Registration & Registration
                  Details
                </CardTitle>
                <CardDescription>
                  Capture vendor statutory identifiers, GST/PAN compliance, and verified bank
                  details.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleApply} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vname">Vendor Legal Name *</Label>
                      <Input
                        id="vname"
                        placeholder="e.g. Apex Scientific Instruments Ltd."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vaddress">Registered Address</Label>
                      <Input
                        id="vaddress"
                        placeholder="Street, City, State, PIN"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vgst">GSTIN Number</Label>
                      <Input
                        id="vgst"
                        placeholder="29AAAAA0000A1Z5"
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vpan">PAN Number</Label>
                      <Input
                        id="vpan"
                        placeholder="AAAAA0000A"
                        value={panNumber}
                        onChange={(e) => setPanNumber(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">
                      Bank Remittance Details (SOP §8.2)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="vbank">Bank Name</Label>
                        <Input
                          id="vbank"
                          placeholder="e.g. State Bank of India"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vacc">Account Number</Label>
                        <Input
                          id="vacc"
                          placeholder="e.g. 987654321012"
                          value={accountNo}
                          onChange={(e) => setAccountNo(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vifsc">IFSC Code</Label>
                        <Input
                          id="vifsc"
                          placeholder="SBIN0001234"
                          value={ifsc}
                          onChange={(e) => setIfsc(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <Button
                      type="submit"
                      size="lg"
                      disabled={isLoading}
                      className="font-semibold shadow-md"
                    >
                      {isLoading ? "Submitting Application..." : "Submit Vendor Application"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: TECHNICAL EVALUATION */}
          <TabsContent value="evaluate">
            <Card className="shadow-sm border-slate-200 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-indigo-600" /> Evaluation by Procurement
                  Committee (SOP §8.2)
                </CardTitle>
                <CardDescription>
                  Evaluate applied vendors across 4 SOP criteria: Technical capability, Past
                  performance, Service support, and Financial reasonableness.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {appliedVendors.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    No new vendors currently in 'applied' status. Submit an application in Tab 1
                    first.
                  </div>
                ) : (
                  <form onSubmit={handleEvaluate} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="selectVendor">Select Vendor to Evaluate *</Label>
                      <select
                        id="selectVendor"
                        value={evaluatingVendorId}
                        onChange={(e) => setEvaluatingVendorId(e.target.value)}
                        className="w-full p-2.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium"
                        required
                      >
                        <option value="">-- Choose Vendor --</option>
                        {appliedVendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} (GST: {v.gst_number || "N/A"}, Applied:{" "}
                            {v.created_at?.slice(0, 10)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold">
                          <span>1. Technical Capability (0-100)</span>
                          <span className="text-blue-600">{techScore}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={techScore}
                          onChange={(e) => setTechScore(Number(e.target.value))}
                          className="w-full accent-blue-600"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold">
                          <span>2. Experience & Past Performance (0-100)</span>
                          <span className="text-blue-600">{expScore}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={expScore}
                          onChange={(e) => setExpScore(Number(e.target.value))}
                          className="w-full accent-blue-600"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold">
                          <span>3. Service & After-Sales Support (0-100)</span>
                          <span className="text-blue-600">{supportScore}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={supportScore}
                          onChange={(e) => setSupportScore(Number(e.target.value))}
                          className="w-full accent-blue-600"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold">
                          <span>4. Financial Reasonableness (0-100)</span>
                          <span className="text-blue-600">{financialScore}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={financialScore}
                          onChange={(e) => setFinancialScore(Number(e.target.value))}
                          className="w-full accent-blue-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Committee Recommendation *</Label>
                        <div className="flex gap-4 pt-1">
                          <label className="flex items-center gap-2 cursor-pointer font-medium text-sm text-emerald-700 dark:text-emerald-300">
                            <input
                              type="radio"
                              name="decision"
                              value="recommend"
                              checked={decision === "recommend"}
                              onChange={() => setDecision("recommend")}
                              className="accent-emerald-600"
                            />
                            Recommend for Empanelment
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer font-medium text-sm text-rose-700 dark:text-rose-300">
                            <input
                              type="radio"
                              name="decision"
                              value="not_recommend"
                              checked={decision === "not_recommend"}
                              onChange={() => setDecision("not_recommend")}
                              className="accent-rose-600"
                            />
                            Do Not Recommend
                          </label>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="evalNotes">Evaluation Remarks / Notes</Label>
                        <Input
                          id="evalNotes"
                          placeholder="Summary of committee assessment..."
                          value={evalNotes}
                          onChange={(e) => setEvalNotes(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={isLoading} className="font-semibold">
                        {isLoading
                          ? "Recording Evaluation..."
                          : "Submit Evaluation (Move to Under Review)"}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: EVP APPROVAL GATE */}
          <TabsContent value="evp_approval">
            <Card className="shadow-sm border-2 border-purple-500/40 dark:border-purple-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-purple-600" />
                    <CardTitle className="text-lg">
                      Executive Vice President (EVP) Approval Portal
                    </CardTitle>
                  </div>
                  <span className="text-xs font-bold uppercase px-2.5 py-1 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                    SOP §8.2 Mandatory Gate
                  </span>
                </div>
                <CardDescription>
                  Vendors can only enter the Approved Vendor List after EVP-role approval.
                  Server-enforced security rejects non-EVP calls.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {reviewVendors.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    No vendors currently awaiting EVP review. Evaluate an applied vendor in Tab 2
                    first.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviewVendors.map((v) => (
                      <div
                        key={v.id}
                        className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-4"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                          <div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                              {v.name}
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 font-semibold uppercase">
                                {v.status}
                              </span>
                            </h3>
                            <p className="text-xs text-slate-500">
                              GST: {v.gst_number || "N/A"} | PAN: {v.pan_number || "N/A"} | Applied
                              on: {v.created_at?.slice(0, 10)}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                          <div className="space-y-2">
                            <Label className="text-xs">
                              Approval Observation / Conditions (Optional)
                            </Label>
                            <Input
                              placeholder="e.g. Approved subject to rate contract finalisation..."
                              value={approvalNotes}
                              onChange={(e) => setApprovalNotes(e.target.value)}
                              className="text-xs h-9"
                            />
                            <Button
                              onClick={() => handleEvpApprove(v.id)}
                              disabled={isLoading}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-semibold text-xs"
                            >
                              <CheckCircle className="w-4 h-4" /> Approve Empanelment (1 Year
                              Validity)
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs">Rejection Justification</Label>
                            <Input
                              placeholder="Reason for declining empanelment..."
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="text-xs h-9"
                            />
                            <Button
                              variant="destructive"
                              onClick={() => handleEvpReject(v.id)}
                              disabled={isLoading}
                              className="w-full gap-1.5 font-semibold text-xs"
                            >
                              <XCircle className="w-4 h-4" /> Reject Vendor Application
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Approved Vendors List */}
            {empanelledVendors.length > 0 && (
              <Card className="mt-8 border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle className="w-4 h-4" /> Approved Vendor List (
                    {empanelledVendors.length})
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Qualified vendors with valid 1-year empanelment certificates.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {empanelledVendors.map((v) => (
                      <div key={v.id} className="py-3 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            {v.name}
                          </span>
                          <span className="text-slate-500 ml-2">
                            (GST: {v.gst_number || "N/A"})
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" /> Empanelled: {v.empanelled_on}
                          </span>
                          <span className="text-emerald-600 font-semibold">
                            Expires: {v.empanelment_expiry}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
