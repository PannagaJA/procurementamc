import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  requestEmergencyProcurement,
  approveEmergency,
  listEmergencyProcurements,
  EMERGENCY_CAP_LIMIT,
} from '@/lib/procurement/emergency.functions';
import {
  Zap,
  PlusCircle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Clock,
  Building2,
  Lock,
} from 'lucide-react';

export default function EmergencyProcurement() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Request Modal
  const [requestOpen, setRequestOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  const [reasonFailed, setReasonFailed] = useState('');
  const [isPostFacto, setIsPostFacto] = useState(false);
  const [quotesCount, setQuotesCount] = useState(1);
  const [priceReasonableness, setPriceReasonableness] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Rejection Modal
  const [rejectOpen, setRejectOpen] = useState(false);
  const [activeEp, setActiveEp] = useState<any>(null);
  const [rejectionRemarks, setRejectionRemarks] = useState('');
  const [acting, setActing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [epRes, deptRes, vendorRes] = await Promise.all([
        (listEmergencyProcurements as any)(),
        supabase.from('departments').select('id, name'),
        supabase.from('vendors').select('id, name').eq('status', 'empanelled'),
      ]);

      if (epRes?.ok) setData(epRes);
      setDepartments(deptRes.data || []);
      setVendors(vendorRes.data || []);
    } catch (e: any) {
      toast({ title: 'Error loading data', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const ledger = data?.ledger || { financial_year: '2026-27', running_total: 0, cap_limit: EMERGENCY_CAP_LIMIT };
  const runningTotal = Number(ledger.running_total || 0);
  const capLimit = Number(ledger.cap_limit || EMERGENCY_CAP_LIMIT);
  const remaining = Math.max(0, capLimit - runningTotal);
  const usagePercent = Math.min(100, Math.round((runningTotal / capLimit) * 100));

  const handleRequest = async () => {
    if (!description.trim() || !reasonFailed.trim() || estimatedCost <= 0) {
      toast({ title: 'Validation Error', description: 'Please complete all required fields.', variant: 'destructive' });
      return;
    }

    if (estimatedCost > remaining) {
      toast({
        title: 'Statutory Cap Exceeded',
        description: `Cost ₹${estimatedCost.toLocaleString('en-IN')} exceeds remaining annual headroom ₹${remaining.toLocaleString('en-IN')}.`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await (requestEmergencyProcurement as any)({
        data: {
          department_id: departmentId || null,
          vendor_id: vendorId || null,
          description,
          estimated_cost: estimatedCost,
          reason_standard_process_failed: reasonFailed,
          is_post_facto: isPostFacto,
          quotations_obtained_count: quotesCount,
          price_reasonableness_note: priceReasonableness || null,
        },
      });

      if (!res.ok) {
        toast({ title: 'Request Blocked', description: res.error, variant: 'destructive' });
        return;
      }

      toast({
        title: 'Emergency Request Submitted',
        description: `Logged in register (${res.emergencyProcurement.emergency_number}). Awaiting EVP authorization.`,
      });
      setRequestOpen(false);
      setDescription('');
      setReasonFailed('');
      setEstimatedCost(0);
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (ep: any) => {
    setActing(true);
    try {
      const res = await (approveEmergency as any)({
        data: {
          emergency_id: ep.id,
          decision: 'approved',
        },
      });

      if (!res.ok) {
        toast({ title: 'Approval Blocked', description: res.error, variant: 'destructive' });
        return;
      }

      toast({
        title: 'Emergency Procurement Authorized',
        description: `EVP approval recorded. Annual ledger updated to ₹${Number(res.runningTotal).toLocaleString('en-IN')}.`,
      });
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!activeEp || !rejectionRemarks.trim()) return;
    setActing(true);
    try {
      const res = await (approveEmergency as any)({
        data: {
          emergency_id: activeEp.id,
          decision: 'rejected',
          rejection_remarks: rejectionRemarks,
        },
      });

      if (!res.ok) {
        toast({ title: 'Rejection Failed', description: res.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'Emergency Request Rejected', description: 'Recorded in register.' });
      setRejectOpen(false);
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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 mb-2">
              <Zap className="w-3.5 h-3.5 text-amber-600" /> SOP §9 Emergency Procurement Governance
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Emergency Procurement Register
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Hard statutory annual cap of ₹10,00,000, post-facto 48-hour ratification rule, and exclusive EVP authorization.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button onClick={() => setRequestOpen(true)} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
              <PlusCircle className="w-4 h-4" /> Request Emergency Procurement
            </Button>
          </div>
        </div>

        {/* Annual Hard Cap Gauge Banner */}
        <Card className="bg-gradient-to-r from-amber-50/80 via-orange-50/60 to-red-50/40 dark:from-amber-950/40 dark:via-orange-950/40 dark:to-red-950/40 border-amber-300 dark:border-amber-900">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
                <CardTitle className="text-lg">Statutory Annual Emergency Ledger — FY {ledger.financial_year}</CardTitle>
              </div>
              <Badge variant="outline" className="font-mono text-xs border-amber-500 text-amber-900 dark:text-amber-200">
                Hard Cap: ₹{capLimit.toLocaleString('en-IN')}
              </Badge>
            </div>
            <CardDescription className="text-xs text-amber-800 dark:text-amber-300">
              Institution-wide aggregate spend ceiling across all departments under SOP §9.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-700 dark:text-slate-300">Used: ₹{runningTotal.toLocaleString('en-IN')} ({usagePercent}%)</span>
                <span className="text-emerald-700 dark:text-emerald-400">Remaining Balance: ₹{remaining.toLocaleString('en-IN')}</span>
              </div>
              <Progress
                value={usagePercent}
                className="h-3 bg-amber-200 dark:bg-amber-950"
              />
            </div>
          </CardContent>
        </Card>

        {/* Emergency Procurements List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading emergency register...</div>
          ) : (data?.emergencyProcurements || []).length === 0 ? (
            <Card className="text-center p-8">
              <p className="text-slate-500">No emergency procurements registered for this financial year.</p>
            </Card>
          ) : (
            data?.emergencyProcurements?.map((ep: any) => {
              const isPending = ep.evp_approval_status === 'pending';
              const isApproved = ep.evp_approval_status === 'approved';

              return (
                <Card key={ep.id} className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300">
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                            {ep.emergency_number}
                          </span>
                          <Badge variant={isApproved ? 'default' : isPending ? 'secondary' : 'destructive'}>
                            {ep.evp_approval_status.toUpperCase()}
                          </Badge>
                          {ep.is_post_facto ? (
                            <Badge variant="outline" className="text-xs text-purple-700 border-purple-400">
                              Post-Facto Ratification (§9.3)
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-amber-700 border-amber-400">
                              Prior Approval
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Dept: {ep.departments?.name || 'Central'} • Vendor: {ep.vendors?.name || 'Direct Procurement'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isPending && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApprove(ep)}
                              disabled={acting}
                              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> EVP Authorize
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setActiveEp(ep);
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
                        <span className="text-slate-500 block">Estimated Cost</span>
                        <span className="font-mono font-bold text-base text-slate-900 dark:text-white">
                          ₹{Number(ep.estimated_cost).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Quotes Obtained</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {ep.quotations_obtained_count || 1} Quote(s)
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Register Entry Time</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {new Date(ep.register_entry_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs space-y-1.5">
                      <div><span className="font-semibold text-slate-700 dark:text-slate-300">Description: </span>{ep.description}</div>
                      <div className="p-2 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded text-amber-900 dark:text-amber-200">
                        <span className="font-semibold">Failure of Standard Process Justification: </span>
                        {ep.reason_standard_process_failed}
                      </div>
                      {ep.price_reasonableness_note && (
                        <div><span className="font-semibold text-slate-700 dark:text-slate-300">Price Reasonableness: </span>{ep.price_reasonableness_note}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Modal: Request Emergency Procurement */}
        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Request Emergency Procurement (§9)</DialogTitle>
              <DialogDescription>
                Initiate urgent purchase subject to the ₹10,00,000 annual statutory cap and EVP authorization.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Department</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger><SelectValue placeholder="Select Department..." /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Vendor (If selected)</Label>
                  <Select value={vendorId} onValueChange={setVendorId}>
                    <SelectTrigger><SelectValue placeholder="Select Vendor..." /></SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Procurement Description & Urgency</Label>
                <Textarea
                  placeholder="Detail items, equipment breakdown, safety hazard..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Estimated Cost (₹)</Label>
                  <Input
                    type="number"
                    value={estimatedCost}
                    onChange={(e) => setEstimatedCost(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Quotes Obtained Count</Label>
                  <Input
                    type="number"
                    value={quotesCount}
                    onChange={(e) => setQuotesCount(Number(e.target.value) || 1)}
                  />
                </div>
              </div>

              {/* Cap Warning */}
              {estimatedCost > remaining && (
                <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-300 rounded text-xs text-red-900 dark:text-red-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>
                    HARD BLOCK: Cost ₹{estimatedCost.toLocaleString('en-IN')} exceeds remaining annual cap ₹{remaining.toLocaleString('en-IN')}.
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <Label>Reason Standard Procurement Process Failed (Mandatory)</Label>
                <Textarea
                  placeholder="Explain operational crisis, imminent downtime, or student impact preventing 3-quote RFQ..."
                  value={reasonFailed}
                  onChange={(e) => setReasonFailed(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-1">
                <Label>Price Reasonableness Note</Label>
                <Input
                  placeholder="OEM catalogue price comparison, benchmark rate..."
                  value={priceReasonableness}
                  onChange={(e) => setPriceReasonableness(e.target.value)}
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="post-facto"
                  checked={isPostFacto}
                  onCheckedChange={(c) => setIsPostFacto(!!c)}
                />
                <Label htmlFor="post-facto" className="text-xs cursor-pointer">
                  Post-Facto Ratification (Work already initiated due to critical life/safety/crisis)
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
              <Button
                onClick={handleRequest}
                disabled={submitting || estimatedCost <= 0 || estimatedCost > remaining || !reasonFailed.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {submitting ? 'Registering...' : 'Register Emergency Request'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Reject Emergency */}
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reject Emergency Request</DialogTitle>
              <DialogDescription>
                Record EVP observations and mandate standard RFQ procurement.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Label>Rejection Observations</Label>
              <Textarea
                placeholder="State why emergency criteria was not met..."
                value={rejectionRemarks}
                onChange={(e) => setRejectionRemarks(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={acting || !rejectionRemarks.trim()}
              >
                {acting ? 'Rejecting...' : 'Reject Emergency Request'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
