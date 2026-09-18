import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  recordDelivery,
  createGrn,
  securityVerify,
  technicalVerify,
  listGrns,
} from '@/lib/procurement/grn.functions';
import { listPurchaseOrders } from '@/lib/procurement/po.functions';
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
} from 'lucide-react';

export default function GrnManagement() {
  const { toast } = useToast();
  const [grns, setGrns] = useState<any[]>([]);
  const [issuedPos, setIssuedPos] = useState<any[]>([]);
  const [challans, setChallans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Record Delivery Modal
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [packagesCount, setPackagesCount] = useState(1);
  const [carrierDetails, setCarrierDetails] = useState('');
  const [deliveryRemarks, setDeliveryRemarks] = useState('');
  const [recordingDelivery, setRecordingDelivery] = useState(false);

  // Create GRN Modal
  const [grnOpen, setGrnOpen] = useState(false);
  const [grnPoId, setGrnPoId] = useState('');
  const [selectedChallanId, setSelectedChallanId] = useState('');
  const [requiresTechInspection, setRequiresTechInspection] = useState(true);
  const [grnLines, setGrnLines] = useState<any[]>([]);
  const [creatingGrn, setCreatingGrn] = useState(false);

  // Technical Verification Modal
  const [techOpen, setTechOpen] = useState(false);
  const [activeGrn, setActiveGrn] = useState<any>(null);
  const [techAccepted, setTechAccepted] = useState(true);
  const [techRemarks, setTechRemarks] = useState('');
  const [verifying, setVerifying] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [grnRes, poRes, challanRes] = await Promise.all([
        (listGrns as any)(),
        (listPurchaseOrders as any)({ status: 'issued' }),
        supabase.from('delivery_challans').select('*, purchase_orders(po_number, vendors(name))'),
      ]);

      if (grnRes?.ok) setGrns(grnRes.grns || []);
      if (poRes?.ok) setIssuedPos(poRes.purchaseOrders || []);
      setChallans(challanRes.data || []);
    } catch (e: any) {
      toast({ title: 'Error loading data', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When PO selection changes in GRN Modal, prepare lines
  useEffect(() => {
    if (!grnPoId) {
      setGrnLines([]);
      return;
    }
    const po = issuedPos.find((p) => p.id === grnPoId);
    if (po) {
      // Find delivery challans for this PO
      const relevantChallans = challans.filter((c) => c.po_id === grnPoId);
      if (relevantChallans.length > 0 && !selectedChallanId) {
        setSelectedChallanId(relevantChallans[0].id);
      }

      setGrnLines([
        {
          description: po.scope_of_supply || 'Material Supply',
          unit: 'lot',
          qty_delivered: 1,
          qty_accepted: 1,
          unit_price: Number(po.price || 0),
          inspection_remarks: 'Visual verification complete',
        },
      ]);
    }
  }, [grnPoId, issuedPos, challans]);

  const handleRecordDelivery = async () => {
    if (!selectedPoId) {
      toast({ title: 'Select PO', description: 'Please select an issued purchase order.', variant: 'destructive' });
      return;
    }

    setRecordingDelivery(true);
    try {
      const res = await (recordDelivery as any)({
        data: {
          po_id: selectedPoId,
          packages_count: packagesCount,
          carrier_details: carrierDetails,
          remarks: deliveryRemarks,
          items_json: [],
        },
      });

      if (!res.ok) {
        toast({ title: 'Delivery Recording Failed', description: res.error, variant: 'destructive' });
        return;
      }

      toast({
        title: 'Delivery Challan Recorded',
        description: `Challan ${res.challan.challan_number} recorded. Stores security verification complete.`,
      });
      setDeliveryOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setRecordingDelivery(false);
    }
  };

  const handleCreateGrn = async () => {
    if (!grnPoId || !selectedChallanId) {
      toast({
        title: 'Validation Error',
        description: 'Cannot create GRN without a linked Delivery Challan (§8.6).',
        variant: 'destructive',
      });
      return;
    }

    setCreatingGrn(true);
    try {
      const res = await (createGrn as any)({
        data: {
          po_id: grnPoId,
          delivery_challan_id: selectedChallanId,
          requires_technical_inspection: requiresTechInspection,
          lines: grnLines,
        },
      });

      if (!res.ok) {
        toast({ title: 'GRN Creation Blocked', description: res.error, variant: 'destructive' });
        return;
      }

      toast({
        title: 'GRN Created',
        description: `Goods Receipt Note ${res.grn.grn_number} created with accepted value ₹${Number(res.acceptedValue).toLocaleString('en-IN')}.`,
      });
      setGrnOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setCreatingGrn(false);
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
        toast({ title: 'Verification Failed', description: res.error, variant: 'destructive' });
        return;
      }

      toast({
        title: techAccepted ? 'Technical Acceptance Recorded' : 'Material Rejected',
        description: `GRN status updated to "${res.status}".`,
      });
      setTechOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 mb-2">
              <Truck className="w-3.5 h-3.5" /> SOP §8.6 Stores Fulfilment & Goods Receipt
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Delivery Challans & Goods Receipt Notes (GRN)
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Enforce physical delivery receipt, security check, technical inspection sign-off, and accepted value ledger.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button onClick={() => setDeliveryOpen(true)} variant="outline" className="gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50">
              <Truck className="w-4 h-4" /> Record Challan
            </Button>
            <Button onClick={() => setGrnOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <PlusCircle className="w-4 h-4" /> Create GRN
            </Button>
          </div>
        </div>

        {/* GRN List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading Goods Receipt Notes...</div>
          ) : grns.length === 0 ? (
            <Card className="text-center p-8">
              <p className="text-slate-500">No Goods Receipt Notes created yet. Record delivery and create a GRN against an issued PO.</p>
            </Card>
          ) : (
            grns.map((grn) => {
              const po = grn.purchase_orders;
              const challan = grn.delivery_challans;
              const isPending = grn.status === 'pending';
              const isAccepted = grn.status === 'accepted';
              const lines = grn.grn_lines || [];

              return (
                <Card key={grn.id} className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300">
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                            {grn.grn_number || 'GRN-PENDING'}
                          </span>
                          <Badge variant={isAccepted ? 'default' : isPending ? 'secondary' : 'destructive'}>
                            {grn.status.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Challan: {challan?.challan_number || 'Linked'}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500">
                          PO: <span className="font-semibold text-slate-700 dark:text-slate-300">{po?.po_number}</span> • Vendor: {po?.vendors?.name} • PR Ref: {po?.purchase_requisitions?.pr_number}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isPending && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setActiveGrn(grn);
                              setTechAccepted(true);
                              setTechRemarks('');
                              setTechOpen(true);
                            }}
                            className="gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                          >
                            <FileCheck className="w-3.5 h-3.5" /> Technical Sign-off
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 text-sm space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg text-xs">
                      <div>
                        <span className="text-slate-500 block">Accepted Value</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          ₹{Number(grn.accepted_value || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Security Verification</span>
                        <span className="font-semibold text-emerald-600 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> Verified at Gate
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Technical Inspection</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {grn.technical_verified_at ? (
                            <span className="text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                            </span>
                          ) : (
                            <span className="text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" /> Pending User Sign-off
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Lines list */}
                    {lines.length > 0 && (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
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
                            {lines.map((l: any) => (
                              <tr key={l.id}>
                                <td className="p-2 font-medium">{l.description}</td>
                                <td className="p-2 text-right">{l.qty_delivered}</td>
                                <td className="p-2 text-right font-semibold text-emerald-600">{l.qty_accepted}</td>
                                <td className="p-2 text-right text-red-500">{l.qty_rejected}</td>
                                <td className="p-2 text-right font-mono">₹{Number(l.unit_price).toLocaleString('en-IN')}</td>
                                <td className="p-2 text-right font-mono font-bold">₹{Number(l.accepted_total).toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Modal: Record Delivery Challan */}
        <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record Delivery Challan</DialogTitle>
              <DialogDescription>
                Log physical delivery package arrival at Stores gate per SOP §8.6.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Issued Purchase Order</Label>
                <Select value={selectedPoId} onValueChange={setSelectedPoId}>
                  <SelectTrigger><SelectValue placeholder="Select PO..." /></SelectTrigger>
                  <SelectContent>
                    {issuedPos.map((po) => (
                      <SelectItem key={po.id} value={po.id}>
                        {po.po_number} — {po.vendors?.name} (₹{Number(po.total_value).toLocaleString('en-IN')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Packages / Boxes Count</Label>
                  <Input
                    type="number"
                    value={packagesCount}
                    onChange={(e) => setPackagesCount(Number(e.target.value) || 1)}
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
              <Button variant="outline" onClick={() => setDeliveryOpen(false)}>Cancel</Button>
              <Button
                onClick={handleRecordDelivery}
                disabled={recordingDelivery || !selectedPoId}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {recordingDelivery ? 'Logging...' : 'Log Delivery Challan'}
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
                Verify delivered materials against Purchase Order and Delivery Challan (§8.6).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Purchase Order</Label>
                  <Select value={grnPoId} onValueChange={setGrnPoId}>
                    <SelectTrigger><SelectValue placeholder="Select PO..." /></SelectTrigger>
                    <SelectContent>
                      {issuedPos.map((po) => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.po_number} — {po.vendors?.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Delivery Challan</Label>
                  <Select value={selectedChallanId} onValueChange={setSelectedChallanId}>
                    <SelectTrigger><SelectValue placeholder="Select Challan..." /></SelectTrigger>
                    <SelectContent>
                      {challans.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.challan_number} (PO: {c.purchase_orders?.po_number || 'Ref'})
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
                <div key={idx} className="p-3 border rounded-lg bg-slate-50 dark:bg-slate-900 space-y-2 text-xs">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    Item #{idx + 1}: {line.description}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-[10px]">Delivered Qty</Label>
                      <Input
                        type="number"
                        value={line.qty_delivered}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setGrnLines((prev) => prev.map((l, i) => (i === idx ? { ...l, qty_delivered: val } : l)));
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Accepted Qty</Label>
                      <Input
                        type="number"
                        value={line.qty_accepted}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setGrnLines((prev) => prev.map((l, i) => (i === idx ? { ...l, qty_accepted: val } : l)));
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Unit Price (₹)</Label>
                      <Input
                        type="number"
                        value={line.unit_price}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setGrnLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unit_price: val } : l)));
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right font-mono font-bold text-slate-900 dark:text-white pt-1">
                    Accepted Total: ₹{(line.qty_accepted * line.unit_price).toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setGrnOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreateGrn}
                disabled={creatingGrn || !grnPoId || !selectedChallanId}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {creatingGrn ? 'Creating...' : 'Issue Goods Receipt Note'}
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
              <Button variant="outline" onClick={() => setTechOpen(false)}>Cancel</Button>
              <Button
                onClick={handleTechnicalVerify}
                disabled={verifying}
                className={techAccepted ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
              >
                {verifying ? 'Submitting...' : techAccepted ? 'Sign-off Technical Acceptance' : 'Reject Goods'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
