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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  createPo,
  approvePo,
  issuePo,
  amendPo,
  closePo,
  listPurchaseOrders,
} from '@/lib/procurement/po.functions';
import { listComparativeStatements } from '@/lib/procurement/cs.functions';
import {
  ShoppingBag,
  PlusCircle,
  CheckCircle,
  FileEdit,
  Send,
  Lock,
  AlertTriangle,
  History,
  Building2,
  RefreshCw,
  CreditCard,
} from 'lucide-react';

export default function PurchaseOrders() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [approvedCss, setApprovedCss] = useState<any[]>([]);
  const [rateContracts, setRateContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create PO Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [poType, setPoType] = useState<'regular' | 'rate_contract'>('regular');
  const [selectedCsId, setSelectedCsId] = useState('');
  const [selectedRcId, setSelectedRcId] = useState('');
  const [selectedPrId, setSelectedPrId] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [scopeOfSupply, setScopeOfSupply] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [taxes, setTaxes] = useState<number>(0);
  const [deliveryTimeline, setDeliveryTimeline] = useState('30 days');
  const [paymentTerms, setPaymentTerms] = useState('100% on delivery and inspection');
  const [creating, setCreating] = useState(false);

  // Amend PO Modal
  const [amendOpen, setAmendOpen] = useState(false);
  const [activePo, setActivePo] = useState<any>(null);
  const [newPrice, setNewPrice] = useState<number>(0);
  const [newTaxes, setNewTaxes] = useState<number>(0);
  const [amendReason, setAmendReason] = useState('');
  const [amending, setAmending] = useState(false);

  // General action state
  const [acting, setActing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [poRes, csRes] = await Promise.all([
        (listPurchaseOrders as any)(),
        (listComparativeStatements as any)(),
      ]);

      if (poRes?.ok) setOrders(poRes.purchaseOrders || []);
      if (csRes?.ok) {
        setApprovedCss(
          (csRes.comparativeStatements || []).filter((cs: any) => cs.status === 'approved'),
        );
      }

      // Fetch active rate contracts
      const { data: rcData } = await supabase
        .from('rate_contracts')
        .select('*, vendors(id, name)');
      setRateContracts(rcData || []);
    } catch (e: any) {
      toast({ title: 'Error loading data', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When CS selection changes in Create PO Modal
  useEffect(() => {
    if (poType === 'regular' && selectedCsId) {
      const cs = approvedCss.find((c) => c.id === selectedCsId);
      if (cs) {
        setSelectedPrId(cs.pr_id || cs.rfqs?.purchase_requisitions?.id || '');
        setSelectedVendorId(cs.recommended_vendor_id || '');
        setPrice(Number(cs.recommended_total || 0));
        setTaxes(0);
        setScopeOfSupply(`Supply as per RFQ ${cs.rfqs?.rfq_number || ''}`);
      }
    }
  }, [selectedCsId, poType, approvedCss]);

  const handleCreatePo = async () => {
    if (!selectedPrId || !selectedVendorId || price <= 0) {
      toast({ title: 'Validation Error', description: 'Please complete all required fields.', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const res = await (createPo as any)({
        data: {
          pr_id: selectedPrId,
          cs_id: poType === 'regular' ? selectedCsId : null,
          rate_contract_id: poType === 'rate_contract' ? selectedRcId : null,
          type: poType,
          vendor_id: selectedVendorId,
          scope_of_supply: scopeOfSupply,
          price,
          taxes,
          delivery_timeline: deliveryTimeline,
          payment_terms: paymentTerms,
        },
      });

      if (!res.ok) {
        toast({ title: 'PO Creation Blocked', description: res.error, variant: 'destructive' });
        return;
      }

      toast({
        title: 'Purchase Order Created',
        description: `PO ${res.po.po_number} routed to ${res.routing?.role?.toUpperCase()} for approval.`,
      });
      setCreateOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleApprovePo = async (po: any) => {
    setActing(true);
    try {
      const res = await (approvePo as any)({
        data: { po_id: po.id },
      });
      if (!res.ok) {
        toast({ title: 'Approval Failed', description: res.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'PO Approved', description: `Purchase Order ${po.po_number} approved.` });
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const handleIssuePo = async (po: any) => {
    setActing(true);
    try {
      const res = await (issuePo as any)({
        data: { po_id: po.id },
      });
      if (!res.ok) {
        toast({ title: 'Failed to Issue PO', description: res.error, variant: 'destructive' });
        return;
      }
      toast({
        title: 'Purchase Order Issued',
        description: `Order ${po.po_number} issued. Notifications dispatched to User Dept, Stores, and Finance.`,
      });
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const handleOpenAmend = (po: any) => {
    setActivePo(po);
    setNewPrice(Number(po.price || 0));
    setNewTaxes(Number(po.taxes || 0));
    setAmendReason('');
    setAmendOpen(true);
  };

  const handleAmendPo = async () => {
    if (!activePo || !amendReason.trim() || newPrice <= 0) {
      toast({ title: 'Validation Error', description: 'Please provide valid amended values and reason.', variant: 'destructive' });
      return;
    }

    setAmending(true);
    try {
      const res = await (amendPo as any)({
        data: {
          po_id: activePo.id,
          new_price: newPrice,
          new_taxes: newTaxes,
          reason: amendReason,
        },
      });

      if (!res.ok) {
        toast({ title: 'Amendment Blocked', description: res.error, variant: 'destructive' });
        return;
      }

      if (res.requiresReapproval) {
        toast({
          title: 'Amendment Requires Re-approval',
          description: `Value increase exceeded authority limit. Re-routed to ${res.newApproverRole?.toUpperCase()} for approval.`,
          variant: 'default',
        });
      } else {
        toast({ title: 'PO Amended', description: 'Purchase order value updated successfully.' });
      }

      setAmendOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setAmending(false);
    }
  };

  const handleClosePo = async (po: any) => {
    if (!confirm(`Are you sure you want to close Purchase Order ${po.po_number}?`)) return;
    setActing(true);
    try {
      const res = await (closePo as any)({
        data: { po_id: po.id },
      });
      if (!res.ok) {
        toast({ title: 'Failed to close PO', description: res.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'PO Closed', description: `Order ${po.po_number} marked as closed.` });
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200 mb-2">
              <ShoppingBag className="w-3.5 h-3.5" /> Purchase Order Governance
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Purchase Orders & Amendments
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Issue binding POs backed by approved CS or Rate Contracts, with automated tier re-approval on value amendments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
              <PlusCircle className="w-4 h-4" /> Create PO
            </Button>
          </div>
        </div>

        {/* PO List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading Purchase Orders...</div>
          ) : orders.length === 0 ? (
            <Card className="text-center p-8">
              <p className="text-slate-500">No Purchase Orders created yet. Create one from an approved Comparative Statement.</p>
            </Card>
          ) : (
            orders.map((po) => {
              const pr = po.purchase_requisitions;
              const isPending = po.status === 'pending_approval';
              const isApproved = po.status === 'approved';
              const isIssued = po.status === 'issued';
              const amendments = po.po_amendments || [];

              return (
                <Card key={po.id} className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300">
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                            {po.po_number || 'PO-PENDING'}
                          </span>
                          <Badge
                            variant={
                              isIssued ? 'default' : isApproved ? 'secondary' : isPending ? 'outline' : 'destructive'
                            }
                          >
                            {po.status.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {po.type === 'rate_contract' ? 'Rate Contract Order' : 'Regular Order (CS-backed)'}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500">
                          Vendor: <span className="font-semibold text-slate-700 dark:text-slate-300">{po.vendors?.name}</span> • PR: {pr?.pr_number} • Dept: {pr?.departments?.name || 'Academic'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isPending && (
                          <Button
                            size="sm"
                            onClick={() => handleApprovePo(po)}
                            disabled={acting}
                            className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Approve PO
                          </Button>
                        )}
                        {isApproved && (
                          <Button
                            size="sm"
                            onClick={() => handleIssuePo(po)}
                            disabled={acting}
                            className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                          >
                            <Send className="w-3.5 h-3.5" /> Issue PO
                          </Button>
                        )}
                        {(isApproved || isIssued) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenAmend(po)}
                            disabled={acting}
                            className="gap-1 border-amber-500 text-amber-700 hover:bg-amber-50"
                          >
                            <FileEdit className="w-3.5 h-3.5" /> Amend Value
                          </Button>
                        )}
                        {isIssued && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleClosePo(po)}
                            disabled={acting}
                            className="gap-1 text-slate-500 hover:text-slate-900"
                          >
                            <Lock className="w-3.5 h-3.5" /> Close PO
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 text-sm space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg text-xs">
                      <div>
                        <span className="text-slate-500 block">Base Price</span>
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                          ₹{Number(po.price || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Taxes & Duties</span>
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                          ₹{Number(po.taxes || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Total Order Value</span>
                        <span className="font-mono font-bold text-base text-slate-900 dark:text-white">
                          ₹{(Number(po.price || 0) + Number(po.taxes || 0)).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Authority Tier</span>
                        <Badge variant="outline" className="font-semibold bg-purple-50 text-purple-700 border-purple-300">
                          {po.current_approver_role?.toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    {/* Scope & terms */}
                    <div className="text-xs space-y-1 bg-white dark:bg-slate-900 p-2.5 rounded border">
                      <div><span className="font-medium text-slate-500">Scope of Supply: </span>{po.scope_of_supply}</div>
                      <div><span className="font-medium text-slate-500">Delivery: </span>{po.delivery_timeline || 'Standard'} • <span className="font-medium text-slate-500">Payment: </span>{po.payment_terms || 'Standard terms'}</div>
                    </div>

                    {/* Amendment History */}
                    {amendments.length > 0 && (
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <History className="w-3.5 h-3.5 text-amber-500" /> Amendment History ({amendments.length})
                        </div>
                        <div className="space-y-1.5">
                          {amendments.map((am: any) => (
                            <div
                              key={am.id}
                              className="p-2 rounded bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                            >
                              <div>
                                <span className="font-mono font-semibold">
                                  ₹{Number(am.old_value_total).toLocaleString('en-IN')} → ₹{Number(am.new_value_total).toLocaleString('en-IN')}
                                </span>
                                <span className="text-slate-500 ml-2">Reason: {am.reason}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {am.requires_reapproval ? (
                                  <Badge variant="outline" className="text-purple-700 border-purple-400 text-[10px]">
                                    Re-approved by {am.new_approver_role?.toUpperCase()}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-slate-600 text-[10px]">
                                    Original Tier ({am.original_approver_role})
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Modal: Create PO */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
              <DialogDescription>
                Create a Purchase Order backed by an approved Comparative Statement or Rate Contract (§8.5).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Order Type</Label>
                  <Select value={poType} onValueChange={(val: any) => setPoType(val)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular Order (Approved CS)</SelectItem>
                      <SelectItem value="rate_contract">Rate Contract Order</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {poType === 'regular' ? (
                  <div className="space-y-1">
                    <Label>Approved Comparative Statement</Label>
                    <Select value={selectedCsId} onValueChange={setSelectedCsId}>
                      <SelectTrigger><SelectValue placeholder="Select CS..." /></SelectTrigger>
                      <SelectContent>
                        {approvedCss.map((cs) => (
                          <SelectItem key={cs.id} value={cs.id}>
                            {cs.cs_number} — {cs.vendors?.name} (₹{Number(cs.recommended_total).toLocaleString('en-IN')})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label>Active Rate Contract</Label>
                    <Select value={selectedRcId} onValueChange={setSelectedRcId}>
                      <SelectTrigger><SelectValue placeholder="Select Rate Contract..." /></SelectTrigger>
                      <SelectContent>
                        {rateContracts.map((rc) => (
                          <SelectItem key={rc.id} value={rc.id}>
                            {rc.contract_number} — {rc.vendors?.name} ({rc.category})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label>Scope of Supply / Order Description</Label>
                <Textarea
                  value={scopeOfSupply}
                  onChange={(e) => setScopeOfSupply(e.target.value)}
                  placeholder="Detailed specifications, model numbers, deliverables..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Base Price (₹)</Label>
                  <Input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Taxes & GST (₹)</Label>
                  <Input
                    type="number"
                    value={taxes}
                    onChange={(e) => setTaxes(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg flex items-center justify-between text-xs">
                <span className="font-medium text-slate-500">Calculated Total PO Value:</span>
                <span className="font-mono font-bold text-base text-slate-900 dark:text-white">
                  ₹{(Number(price) + Number(taxes)).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Delivery Timeline</Label>
                  <Input
                    value={deliveryTimeline}
                    onChange={(e) => setDeliveryTimeline(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Payment Terms</Label>
                  <Input
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreatePo}
                disabled={creating || !selectedPrId || price <= 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {creating ? 'Creating...' : 'Create & Route for Approval'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Amend PO */}
        <Dialog open={amendOpen} onOpenChange={setAmendOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Amend Purchase Order Value</DialogTitle>
              <DialogDescription>
                Order amendments that breach the original approver's matrix limit trigger automatic re-approval at the higher tier (§8.5).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded text-xs">
                <span className="text-slate-500 block">Current Total Value:</span>
                <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-200">
                  ₹{(Number(activePo?.price || 0) + Number(activePo?.taxes || 0)).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>New Price (₹)</Label>
                  <Input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>New Taxes (₹)</Label>
                  <Input
                    type="number"
                    value={newTaxes}
                    onChange={(e) => setNewTaxes(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Amendment Justification / Reason</Label>
                <Textarea
                  placeholder="Detailed justification for value change..."
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAmendOpen(false)}>Cancel</Button>
              <Button
                onClick={handleAmendPo}
                disabled={amending || !amendReason.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {amending ? 'Amending...' : 'Submit Amendment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
