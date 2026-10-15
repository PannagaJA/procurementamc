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
  Eye,
  Ban,
  ShieldAlert,
  Pencil,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyEmpanelment,
  evaluateVendor,
  approveEmpanelment,
  rejectEmpanelment,
  listVendorsForReview,
  blacklistVendor,
  updateVendorContact,
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

  // Vendor Master State
  const [viewDetailsVendor, setViewDetailsVendor] = useState<any | null>(null);
  const [debarVendorId, setDebarVendorId] = useState<string | null>(null);
  const [debarReason, setDebarReason] = useState("");

  // Edit Contact State (Admin / EVP)
  const [editingVendor, setEditingVendor] = useState<any | null>(null);
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [isUpdatingContact, setIsUpdatingContact] = useState(false);

  // Apply Form State
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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

    // Comprehensive mandatory field validation
    if (!name.trim()) {
      toast({ title: "Validation Error", description: "Vendor Legal Name is required.", variant: "destructive" });
      return;
    }
    if (!contactPerson.trim()) {
      toast({ title: "Validation Error", description: "Contact Person name is required.", variant: "destructive" });
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailPattern.test(email.trim())) {
      toast({ title: "Validation Error", description: "A valid Email Address is required (e.g. contact@vendor.com).", variant: "destructive" });
      return;
    }
    const cleanPhone = phone.trim().replace(/[\s-]/g, "");
    if (!cleanPhone || !/^\+?[0-9]{10,15}$/.test(cleanPhone)) {
      toast({ title: "Validation Error", description: "A valid 10-digit Phone/Mobile number is required.", variant: "destructive" });
      return;
    }
    if (!address.trim()) {
      toast({ title: "Validation Error", description: "Registered Address is required.", variant: "destructive" });
      return;
    }
    if (!gstNumber.trim() || gstNumber.trim().length < 15) {
      toast({ title: "Validation Error", description: "A valid 15-character GSTIN is required.", variant: "destructive" });
      return;
    }
    if (!panNumber.trim() || panNumber.trim().length < 10) {
      toast({ title: "Validation Error", description: "A valid 10-character PAN number is required.", variant: "destructive" });
      return;
    }
    if (!bankName.trim()) {
      toast({ title: "Validation Error", description: "Bank Name is required.", variant: "destructive" });
      return;
    }
    if (!accountNo.trim()) {
      toast({ title: "Validation Error", description: "Bank Account Number is required.", variant: "destructive" });
      return;
    }
    if (!ifsc.trim() || ifsc.trim().length < 11) {
      toast({ title: "Validation Error", description: "A valid 11-character Bank IFSC code is required.", variant: "destructive" });
      return;
    }

    try {
      setIsLoading(true);
      const res = await applyEmpanelment({
        data: {
          name: name.trim(),
          contact_person: contactPerson.trim(),
          email: email.trim().toLowerCase(),
          phone: cleanPhone,
          registered_address: address.trim(),
          gst_number: gstNumber.trim().toUpperCase(),
          pan_number: panNumber.trim().toUpperCase(),
          bank_details: {
            account_number: accountNo.trim(),
            ifsc_code: ifsc.trim().toUpperCase(),
            bank_name: bankName.trim(),
            contact_person: contactPerson.trim(),
            email: email.trim().toLowerCase(),
            phone: cleanPhone,
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
      setContactPerson("");
      setEmail("");
      setPhone("");
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

  const handleDebarVendor = async () => {
    if (!debarVendorId) return;
    if (!debarReason.trim()) {
      toast({ title: "Debarment reason is mandatory", variant: "destructive" });
      return;
    }

    try {
      setIsLoading(true);
      const res = await blacklistVendor({
        data: { vendor_id: debarVendorId, reason: debarReason.trim() }
      });

      if (!res.ok) {
        toast({ title: "Action Failed", description: (res as any).error, variant: "destructive" });
        return;
      }

      toast({ title: "Vendor Debarred", description: "Vendor has been successfully blacklisted." });
      setDebarVendorId(null);
      setDebarReason("");
      await loadVendors();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenEditContact = (vendor: any) => {
    setEditingVendor(vendor);
    setEditContactPerson(vendor.bank_details_json?.contact_person || "");
    setEditEmail(vendor.bank_details_json?.email || "");
    setEditPhone(vendor.bank_details_json?.phone || "");
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor) return;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!editEmail.trim() || !emailPattern.test(editEmail.trim())) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    const cleanPhone = editPhone.trim().replace(/[\s-]/g, "");
    if (!cleanPhone || !/^\+?[0-9]{10,15}$/.test(cleanPhone)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid phone number (10-15 digits).",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUpdatingContact(true);
      const res = await updateVendorContact({
        data: {
          vendor_id: editingVendor.id,
          email: editEmail.trim(),
          phone: editPhone.trim(),
          contact_person: editContactPerson.trim() || null,
        },
      });

      if (!res?.ok) {
        toast({
          title: "Update Failed",
          description: (res as any)?.error || "Failed to update vendor contact.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Contact Updated",
        description: `Successfully updated contact details for ${editingVendor.name}.`,
      });

      // Update local state
      setVendors((prev) =>
        prev.map((v) =>
          v.id === editingVendor.id
            ? { ...v, bank_details_json: res.updatedDetails }
            : v,
        ),
      );

      if (viewDetailsVendor && viewDetailsVendor.id === editingVendor.id) {
        setViewDetailsVendor({
          ...viewDetailsVendor,
          bank_details_json: res.updatedDetails,
        });
      }

      setEditingVendor(null);
    } catch (err: any) {
      console.error("Error updating vendor contact:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to update contact info.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingContact(false);
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
          <div className="w-full">
            <TabsList className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto h-auto p-1.5 gap-1.5 bg-slate-200/70 dark:bg-slate-800/80 rounded-xl">
              <TabsTrigger
                value="apply"
                className="font-semibold text-xs sm:text-sm py-2 px-2.5 sm:px-3.5 whitespace-normal sm:whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                1. Apply for Empanelment
              </TabsTrigger>
              <TabsTrigger
                value="evaluate"
                className="font-semibold text-xs sm:text-sm py-2 px-2.5 sm:px-3.5 whitespace-normal sm:whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                2. Technical Evaluation ({appliedVendors.length})
              </TabsTrigger>
              <TabsTrigger
                value="evp_approval"
                className="font-semibold text-xs sm:text-sm py-2 px-2.5 sm:px-3.5 whitespace-normal sm:whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                3. EVP Approval Gate ({reviewVendors.length})
              </TabsTrigger>
              <TabsTrigger
                value="master_directory"
                className="font-semibold text-xs sm:text-sm py-2 px-2.5 sm:px-3.5 whitespace-normal sm:whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                4. Vendor Master ({vendors.length})
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
                      <Label htmlFor="vname">
                        Vendor Legal Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="vname"
                        placeholder="e.g. Apex Scientific Instruments Ltd."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vcontact">
                        Contact Person Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="vcontact"
                        placeholder="e.g. Rajesh Kumar (Key Account Manager)"
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vemail">
                        Official Email Address <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="vemail"
                        type="email"
                        placeholder="e.g. sales@apexinstruments.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vphone">
                        Phone / Mobile Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="vphone"
                        type="tel"
                        placeholder="e.g. +91 9876543210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="vaddress">
                        Registered Office Address <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="vaddress"
                        placeholder="Plot No, Industrial Area, Street, City, State, PIN"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vgst">
                        GSTIN Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="vgst"
                        placeholder="29AAAAA0000A1Z5 (15 characters)"
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                        maxLength={15}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vpan">
                        PAN Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="vpan"
                        placeholder="AAAAA0000A (10 characters)"
                        value={panNumber}
                        onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                        maxLength={10}
                        required
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">
                      Bank Remittance Details
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="vbank">
                          Bank Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="vbank"
                          placeholder="e.g. State Bank of India"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vacc">
                          Account Number <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="vacc"
                          placeholder="e.g. 987654321012"
                          value={accountNo}
                          onChange={(e) => setAccountNo(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vifsc">
                          IFSC Code <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="vifsc"
                          placeholder="SBIN0001234 (11 characters)"
                          value={ifsc}
                          onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                          maxLength={11}
                          required
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
                  Committee
                </CardTitle>
                <CardDescription>
                  Evaluate applied vendors across 4 criteria: Technical capability, Past
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
                    EVP Approval Required
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

          </TabsContent>

          {/* TAB 4: VENDOR MASTER DIRECTORY */}
          <TabsContent value="master_directory">
            <Card className="shadow-sm border-slate-200 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-slate-600 dark:text-slate-300" /> Vendor Master Directory
                </CardTitle>
                <CardDescription>
                  Comprehensive registry of all vendors and their current statuses.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {vendors.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-lg">
                      No vendors found in the system.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800 pt-2">
                      {vendors.map((v) => {
                        const isEmpanelled = v.status === "empanelled";
                        const isDebarred = v.status === "debarred" || v.status === "blacklisted" || v.status === "suspended";
                        
                        return (
                          <div key={v.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm">
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 dark:text-slate-100 text-base">
                                  {v.name}
                                </span>
                                {isEmpanelled && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 uppercase tracking-wider">
                                    <CheckCircle className="w-3 h-3" /> Empanelled
                                  </span>
                                )}
                                {isDebarred && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800 uppercase tracking-wider">
                                    <Ban className="w-3 h-3" /> {v.status}
                                  </span>
                                )}
                                {!isEmpanelled && !isDebarred && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 uppercase tracking-wider">
                                    {v.status.replace("_", " ")}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 text-xs">
                                <span>GST: <span className="font-medium text-slate-700 dark:text-slate-300">{v.gst_number || "N/A"}</span></span>
                                <span>PAN: <span className="font-medium text-slate-700 dark:text-slate-300">{v.pan_number || "N/A"}</span></span>
                                {isEmpanelled && v.empanelment_expiry && (
                                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                    <Calendar className="w-3.5 h-3.5" /> Valid till: {v.empanelment_expiry}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex-shrink-0 flex items-center gap-2">
                              {(userRoles.includes("evp") || userRoles.includes("admin")) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50/50 hover:bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900 shadow-sm"
                                  onClick={() => handleOpenEditContact(v)}
                                >
                                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Contact
                                </Button>
                              )}
                              {(userRoles.includes("evp") || userRoles.includes("admin")) && !isDebarred && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-8 text-xs font-medium shadow-sm"
                                  onClick={() => setDebarVendorId(v.id)}
                                >
                                  <Ban className="w-3.5 h-3.5 mr-1.5" /> Debar
                                </Button>
                              )}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-xs font-medium bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-950 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white shadow-sm"
                                onClick={() => setViewDetailsVendor(v)}
                              >
                                <Eye className="w-3.5 h-3.5 mr-1.5" /> View Details
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* View Details Dialog */}
      <Dialog open={!!viewDetailsVendor} onOpenChange={(open) => !open && setViewDetailsVendor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Building2 className="w-5 h-5 text-blue-600" /> 
              {viewDetailsVendor?.name}
            </DialogTitle>
            <DialogDescription>
              Vendor Profile & Compliance Details
            </DialogDescription>
          </DialogHeader>

          {viewDetailsVendor && (
            <div className="space-y-6 pt-4">
              {/* Status Banner */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 w-24">Status:</span>
                {viewDetailsVendor.status === "empanelled" ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 uppercase tracking-wider">
                      <CheckCircle className="w-3.5 h-3.5" /> Empanelled
                    </span>
                    <span className="text-xs text-slate-500">
                      (Valid till: <strong className="text-emerald-700 dark:text-emerald-400">{viewDetailsVendor.empanelment_expiry}</strong>)
                    </span>
                  </div>
                ) : (viewDetailsVendor.status === "debarred" || viewDetailsVendor.status === "blacklisted" || viewDetailsVendor.status === "suspended") ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 uppercase tracking-wider">
                    <Ban className="w-3.5 h-3.5" /> {viewDetailsVendor.status}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 uppercase tracking-wider">
                    {viewDetailsVendor.status.replace("_", " ")}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Registration Info */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Registration Information
                    </h4>
                    {(userRoles.includes("evp") || userRoles.includes("admin")) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950 font-medium"
                        onClick={() => handleOpenEditContact(viewDetailsVendor)}
                      >
                        <Pencil className="w-3 h-3 mr-1" /> Edit
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Contact Person</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {viewDetailsVendor.bank_details_json?.contact_person || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Email</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {viewDetailsVendor.bank_details_json?.email || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Phone</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {viewDetailsVendor.bank_details_json?.phone || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">GSTIN</span>
                      <span className="font-medium text-slate-900 dark:text-white">{viewDetailsVendor.gst_number || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">PAN</span>
                      <span className="font-medium text-slate-900 dark:text-white">{viewDetailsVendor.pan_number || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Address</span>
                      <span className="font-medium text-slate-900 dark:text-white text-right max-w-[200px] truncate" title={viewDetailsVendor.registered_address}>
                        {viewDetailsVendor.registered_address || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Applied On</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {viewDetailsVendor.created_at ? new Date(viewDetailsVendor.created_at).toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bank Details */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 pb-1">
                    Bank Remittance Details
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Bank Name</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {viewDetailsVendor.bank_details_json?.bank_name || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Account No.</span>
                      <span className="font-medium text-slate-900 dark:text-white font-mono">
                        {viewDetailsVendor.bank_details_json?.account_number || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">IFSC Code</span>
                      <span className="font-medium text-slate-900 dark:text-white font-mono uppercase">
                        {viewDetailsVendor.bank_details_json?.ifsc_code || "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Optional: Debarred Warning Note */}
              {(viewDetailsVendor.status === "debarred" || viewDetailsVendor.status === "blacklisted") && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg flex items-start gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-rose-800 dark:text-rose-300">
                    This vendor has been debarred/blacklisted and is strictly prohibited from participating in any procurement requests (RFQs) until further notice.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Debar Vendor Dialog */}
      <Dialog open={!!debarVendorId} onOpenChange={(open) => !open && setDebarVendorId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <ShieldAlert className="w-5 h-5" /> Debar Vendor
            </DialogTitle>
            <DialogDescription>
              This is a severe disciplinary action. The vendor will be permanently blacklisted and restricted from all future RFQs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Reason for Debarment *</Label>
              <Textarea 
                placeholder="e.g. Fraud, persistent poor performance, breach of contract..." 
                value={debarReason}
                onChange={(e) => setDebarReason(e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setDebarVendorId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDebarVendor} disabled={isLoading || !debarReason.trim()}>
                {isLoading ? "Processing..." : "Confirm Debarment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Vendor Contact Dialog */}
      <Dialog open={!!editingVendor} onOpenChange={(open) => !open && setEditingVendor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Building2 className="w-5 h-5 text-blue-600" />
              Edit Vendor Contact Information
            </DialogTitle>
            <DialogDescription>
              Update contact person, email address, and phone number for {editingVendor?.name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveContact} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="editContactPerson">Contact Person Name</Label>
              <Input
                id="editContactPerson"
                placeholder="e.g. Rajesh Kumar (Key Account Manager)"
                value={editContactPerson}
                onChange={(e) => setEditContactPerson(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editEmail">
                Official Email Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="editEmail"
                type="email"
                placeholder="e.g. sales@vendor.com"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editPhone">
                Phone / Mobile Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="editPhone"
                placeholder="e.g. +91 9876543210"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingVendor(null)}
                disabled={isUpdatingContact}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isUpdatingContact}
              >
                {isUpdatingContact ? "Saving..." : "Save Contact Info"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
