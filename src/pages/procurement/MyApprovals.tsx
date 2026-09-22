import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getMyPendingApprovals } from '@/lib/procurement/approvals.functions';
import { approvePr, rejectPr, escalateToEvp } from '@/lib/procurement/pr.functions';
import { approveCs, rejectCs } from '@/lib/procurement/cs.functions';
import { approvePo } from '@/lib/procurement/po.functions';
import { approveInvoice } from '@/lib/procurement/invoice.functions';
import { approveEmergency } from '@/lib/procurement/emergency.functions';
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  RefreshCw,
  FileSpreadsheet,
  Scale,
  ShoppingBag,
  FileEdit,
  Receipt,
  Zap,
  UserCheck,
} from 'lucide-react';

export default function MyApprovals() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Decision Modal
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<
    | 'pr_approve'
    | 'pr_reject'
    | 'pr_escalate'
    | 'cs_approve'
    | 'cs_reject'
    | 'po_approve'
    | 'am_approve'
    | 'inv_approve'
    | 'ep_approve'
    | 'ep_reject'
  >('pr_approve');
  const [activeItem, setActiveItem] = useState<any>(null);
  const [remarks, setRemarks] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await (getMyPendingApprovals as any)();
      if (res?.ok) {
        setData(res);
      }
    } catch (e: any) {
      toast({ title: 'Error loading approvals', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAction = (item: any, type: any) => {
    setActiveItem(item);
    setDialogType(type);
    setRemarks('');
    setDialogOpen(true);
  };

  const handleExecuteAction = async () => {
    if (!activeItem) return;
    setActing(true);
    try {
      if (dialogType === 'pr_approve') {
        const res = await (approvePr as any)({ data: { pr_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({ title: 'Requisition Approved', description: `PR ${activeItem.pr_number} approved.` });
      } else if (dialogType === 'pr_reject') {
        const res = await (rejectPr as any)({ data: { pr_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({ title: 'Requisition Rejected', description: `PR ${activeItem.pr_number} rejected.` });
      } else if (dialogType === 'pr_escalate') {
        const res = await (escalateToEvp as any)({ data: { pr_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({ title: 'Requisition Escalated', description: `PR ${activeItem.pr_number} escalated to EVP.` });
      } else if (dialogType === 'cs_approve') {
        const res = await (approveCs as any)({ data: { cs_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({ title: 'Comparative Statement Approved', description: `CS ${activeItem.cs_number} approved.` });
      } else if (dialogType === 'cs_reject') {
        const res = await (rejectCs as any)({ data: { cs_id: activeItem.id, rejection_remarks: remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({ title: 'Comparative Statement Rejected', description: `CS ${activeItem.cs_number} rejected.` });
      } else if (dialogType === 'po_approve') {
        const res = await (approvePo as any)({ data: { po_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({ title: 'Purchase Order Approved', description: `PO ${activeItem.po_number} approved.` });
      } else if (dialogType === 'inv_approve') {
        const res = await (approveInvoice as any)({ data: { invoice_id: activeItem.id, remarks } });
        if (!res.ok) throw new Error(res.error);
        toast({ title: 'Invoice Approved', description: `Invoice ${activeItem.invoice_number} approved for payment.` });
      } else if (dialogType === 'ep_approve') {
        const res = await (approveEmergency as any)({ data: { emergency_id: activeItem.id, decision: 'approved' } });
        if (!res.ok) throw new Error(res.error);
        toast({ title: 'Emergency Procurement Authorized', description: 'EVP approval registered.' });
      } else if (dialogType === 'ep_reject') {
        const res = await (approveEmergency as any)({
          data: { emergency_id: activeItem.id, decision: 'rejected', rejection_remarks: remarks },
        });
        if (!res.ok) throw new Error(res.error);
        toast({ title: 'Emergency Procurement Rejected', description: 'Recorded in register.' });
      }

      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: 'Action Failed', description: e.message, variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const counts = data?.counts || { prs: 0, css: 0, pos: 0, amendments: 0, invoices: 0, emergency: 0, total: 0 };
  const userRoles = data?.roles || [];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200 mb-2">
              <UserCheck className="w-3.5 h-3.5" /> SOP Unified Authority Inbox
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              My Procurement Approvals
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Requisitions, Comparative Statements, Purchase Orders, Invoices, and Emergency authorisations awaiting your role.
            </p>
          </div>
        </div>

        {/* User Roles Banner */}
        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-slate-500 font-medium block">Your Active Procurement Roles:</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {userRoles.length > 0 ? (
                userRoles.map((r: string) => (
                  <Badge key={r} variant="secondary" className="font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                    {r.toUpperCase()}
                  </Badge>
                ))
              ) : (
                <span className="text-slate-400">No procurement roles assigned.</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
            <span>Total Pending: </span>
            <Badge variant="default" className="text-sm px-2.5 py-0.5">
              {counts.total}
            </Badge>
          </div>
        </div>

        {/* Tabs for PR, CS, PO, Amendments, Invoices, Emergency */}
        <Tabs defaultValue="prs" className="space-y-4">
          <div className="w-full overflow-x-auto pb-1 scrollbar-none">
            <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 sm:grid sm:grid-cols-6 h-auto p-1.5 gap-1.5 bg-slate-200/70 dark:bg-slate-800/80 rounded-xl">
              <TabsTrigger value="prs" className="gap-1.5 py-2 px-3 text-xs sm:text-sm font-medium whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
                <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" /> PR ({counts.prs})
              </TabsTrigger>
              <TabsTrigger value="css" className="gap-1.5 py-2 px-3 text-xs sm:text-sm font-medium whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
                <Scale className="w-3.5 h-3.5 text-emerald-600" /> CS ({counts.css})
              </TabsTrigger>
              <TabsTrigger value="pos" className="gap-1.5 py-2 px-3 text-xs sm:text-sm font-medium whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
                <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" /> PO ({counts.pos})
              </TabsTrigger>
              <TabsTrigger value="amendments" className="gap-1.5 py-2 px-3 text-xs sm:text-sm font-medium whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
                <FileEdit className="w-3.5 h-3.5 text-purple-600" /> Amend ({counts.amendments})
              </TabsTrigger>
              <TabsTrigger value="invoices" className="gap-1.5 py-2 px-3 text-xs sm:text-sm font-medium whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
                <Receipt className="w-3.5 h-3.5 text-teal-600" /> Invoices ({counts.invoices})
              </TabsTrigger>
              <TabsTrigger value="emergency" className="gap-1.5 py-2 px-3 text-xs sm:text-sm font-medium whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
                <Zap className="w-3.5 h-3.5 text-amber-600" /> Emergency ({counts.emergency})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Requisitions Tab */}
          <TabsContent value="prs" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading pending requisitions...</div>
            ) : (data?.prs || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">No purchase requisitions awaiting your approval.</Card>
            ) : (
              data?.prs?.map((pr: any) => (
                <Card key={pr.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{pr.pr_number}</span>
                        <Badge variant="outline">{pr.category}</Badge>
                        <Badge variant="secondary">{pr.status.toUpperCase()}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Dept: {pr.departments?.name || 'Academic'} • Est. Value: ₹{Number(pr.estimated_value).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleOpenAction(pr, 'pr_approve')} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleOpenAction(pr, 'pr_reject')} className="gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleOpenAction(pr, 'pr_escalate')} className="gap-1">
                        <ArrowUpRight className="w-3.5 h-3.5" /> Escalate
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs space-y-2">
                    <p className="text-slate-600 dark:text-slate-300"><span className="font-medium">Justification: </span>{pr.justification}</p>
                    <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded text-slate-500">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Routing: </span>{pr.routing_reason}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Comparative Statements Tab */}
          <TabsContent value="css" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading comparative statements...</div>
            ) : (data?.comparativeStatements || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">No comparative statements awaiting your review.</Card>
            ) : (
              data?.comparativeStatements?.map((cs: any) => (
                <Card key={cs.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{cs.cs_number}</span>
                        <Badge variant="outline">{cs.is_lowest_price ? 'L1 Lowest' : 'Non-Lowest Quote'}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Recommended Vendor: <span className="font-semibold text-slate-700 dark:text-slate-300">{cs.vendors?.name}</span> • Total: ₹{Number(cs.recommended_total).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleOpenAction(cs, 'cs_approve')} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Approve CS
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleOpenAction(cs, 'cs_reject')} className="gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs space-y-2">
                    {!cs.is_lowest_price && (
                      <div className="p-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 rounded text-amber-900 dark:text-amber-200">
                        <span className="font-semibold">Non-Lowest Rationale: </span>{cs.non_lowest_rationale}
                      </div>
                    )}
                    <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded text-slate-500">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Routing Rule: </span>{cs.routing_reason}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Purchase Orders Tab */}
          <TabsContent value="pos" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading purchase orders...</div>
            ) : (data?.purchaseOrders || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">No purchase orders awaiting your approval.</Card>
            ) : (
              data?.purchaseOrders?.map((po: any) => (
                <Card key={po.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{po.po_number}</span>
                        <Badge variant="outline">{po.type.toUpperCase()}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Vendor: <span className="font-semibold text-slate-700 dark:text-slate-300">{po.vendors?.name}</span> • Total Value: ₹{(Number(po.price || 0) + Number(po.taxes || 0)).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleOpenAction(po, 'po_approve')} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Approve PO
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs space-y-1">
                    <p className="text-slate-600 dark:text-slate-300"><span className="font-medium">Scope: </span>{po.scope_of_supply}</p>
                    <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded text-slate-500">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Routing Rule: </span>{po.routing_reason}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Amendments Tab */}
          <TabsContent value="amendments" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading amendments...</div>
            ) : (data?.amendments || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">No order amendments requiring re-approval.</Card>
            ) : (
              data?.amendments?.map((am: any) => (
                <Card key={am.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{am.purchase_orders?.po_number} Amendment</span>
                        <Badge variant="outline" className="text-purple-700 border-purple-400">Escalated Tier</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Vendor: {am.purchase_orders?.vendors?.name} • ₹{Number(am.old_value_total).toLocaleString('en-IN')} → ₹{Number(am.new_value_total).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleOpenAction(am, 'am_approve')} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Approve Amendment
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs space-y-1">
                    <p className="text-slate-600 dark:text-slate-300"><span className="font-medium">Reason: </span>{am.reason}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading matched invoices...</div>
            ) : (data?.invoices || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">No invoices awaiting Finance approval.</Card>
            ) : (
              data?.invoices?.map((inv: any) => (
                <Card key={inv.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">Invoice: {inv.invoice_number}</span>
                        <Badge variant="outline" className="text-emerald-700 border-emerald-400">3-Way Matched</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Vendor: {inv.vendors?.name} • PO: {inv.purchase_orders?.po_number} • Amount: ₹{Number(inv.invoice_amount).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleOpenAction(inv, 'inv_approve')} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Approve for Payment
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Emergency Tab */}
          <TabsContent value="emergency" className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading emergency requests...</div>
            ) : (data?.emergencyProcurements || []).length === 0 ? (
              <Card className="p-8 text-center text-slate-500">No emergency procurements awaiting EVP authorization.</Card>
            ) : (
              data?.emergencyProcurements?.map((ep: any) => (
                <Card key={ep.id} className="border border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{ep.emergency_number}</span>
                        <Badge variant="outline" className="text-amber-700 border-amber-400">
                          {ep.is_post_facto ? 'Post-Facto Ratification' : 'Emergency Request'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Dept: {ep.departments?.name || 'Central'} • Estimated Cost: ₹{Number(ep.estimated_cost).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleOpenAction(ep, 'ep_approve')} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Authorize
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleOpenAction(ep, 'ep_reject')} className="gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs space-y-1">
                    <p className="text-slate-600 dark:text-slate-300"><span className="font-medium">Description: </span>{ep.description}</p>
                    <p className="text-amber-800 dark:text-amber-300"><span className="font-medium">Reason Standard Process Failed: </span>{ep.reason_standard_process_failed}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Action Remarks Modal */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {dialogType.includes('approve') ? 'Approve Item' : dialogType.includes('reject') ? 'Reject Item' : 'Escalate Item'}
              </DialogTitle>
              <DialogDescription>
                Record your authorization decision and remarks in the audit trail.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Label>Remarks / Observations</Label>
              <Textarea
                placeholder="Enter audit remarks..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleExecuteAction}
                disabled={acting}
                className={dialogType.includes('reject') ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
              >
                {acting ? 'Processing...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
