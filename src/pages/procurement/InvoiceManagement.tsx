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
  submitInvoice,
  runThreeWayMatch,
  approveInvoice,
  recordPayment,
  listInvoices,
} from '@/lib/procurement/invoice.functions';
import { listPurchaseOrders } from '@/lib/procurement/po.functions';
import { listGrns } from '@/lib/procurement/grn.functions';
import {
  Receipt,
  PlusCircle,
  CheckCircle2,
  AlertOctagon,
  CreditCard,
  RefreshCw,
  FileCheck,
  ShieldCheck,
  Scale,
  DollarSign,
  ArrowRight,
} from 'lucide-react';

export default function InvoiceManagement() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Submit Invoice Modal
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [selectedGrnId, setSelectedGrnId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState<number>(0);
  const [isServicePo, setIsServicePo] = useState(false);
  const [serviceCertUrl, setServiceCertUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Payment Modal
  const [payOpen, setPayOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<any>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'bank_transfer' | 'neft' | 'rtgs' | 'cheque' | 'upi'>('bank_transfer');
  const [externalRef, setExternalRef] = useState('');
  const [paymentTermsRef, setPaymentTermsRef] = useState('Immediate RTGS');
  const [paying, setPaying] = useState(false);

  // Action state
  const [acting, setActing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invRes, poRes, grnRes] = await Promise.all([
        (listInvoices as any)(),
        (listPurchaseOrders as any)(),
        (listGrns as any)(),
      ]);

      if (invRes?.ok) setInvoices(invRes.invoices || []);
      if (poRes?.ok) setPos(poRes.purchaseOrders || []);
      if (grnRes?.ok) setGrns(grnRes.grns || []);
    } catch (e: any) {
      toast({ title: 'Error loading data', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When PO selection changes in Submit Invoice Modal
  useEffect(() => {
    if (!selectedPoId) return;
    const po = pos.find((p) => p.id === selectedPoId);
    if (po) {
      const matchedGrn = grns.find((g) => g.po_id === selectedPoId && g.status === 'accepted');
      if (matchedGrn) {
        setSelectedGrnId(matchedGrn.id);
        setInvoiceAmount(Number(matchedGrn.accepted_value || po.total_value || 0));
      } else {
        setInvoiceAmount(Number(po.total_value || 0));
      }
    }
  }, [selectedPoId, pos, grns]);

  const handleSubmitInvoice = async () => {
    if (!selectedPoId || !invoiceNumber.trim() || invoiceAmount <= 0) {
      toast({ title: 'Validation Error', description: 'Please complete all required fields.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await (submitInvoice as any)({
        data: {
          po_id: selectedPoId,
          grn_id: isServicePo ? null : (selectedGrnId || null),
          invoice_number: invoiceNumber,
          invoice_amount: invoiceAmount,
          is_service_po: isServicePo,
          service_completion_cert_url: serviceCertUrl || null,
        },
      });

      if (!res.ok) {
        toast({ title: 'Invoice Submission Blocked', description: res.error, variant: 'destructive' });
        return;
      }

      if (res.matchStatus === 'matched') {
        toast({
          title: 'Three-Way Match Passed',
          description: `Invoice ${res.invoice.invoice_number} matched PO and GRN values. Ready for approval.`,
        });
      } else {
        toast({
          title: 'Invoice Placed On Hold',
          description: `Discrepancy detected: ${res.holdReason}`,
          variant: 'destructive',
        });
      }

      setSubmitOpen(false);
      setInvoiceNumber('');
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (inv: any) => {
    setActing(true);
    try {
      const res = await (approveInvoice as any)({
        data: { invoice_id: inv.id },
      });

      if (!res.ok) {
        toast({ title: 'Approval Blocked', description: res.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'Invoice Approved', description: `Invoice ${inv.invoice_number} approved for payment.` });
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const handleOpenPay = (inv: any) => {
    setActiveInvoice(inv);
    setPayAmount(Number(inv.invoice_amount || 0));
    setExternalRef(`UTR-${Date.now().toString().slice(-8)}`);
    setPayOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!activeInvoice || payAmount <= 0) return;
    setPaying(true);
    try {
      const res = await (recordPayment as any)({
        data: {
          invoice_id: activeInvoice.id,
          amount: payAmount,
          payment_mode: paymentMode,
          payment_terms_ref: paymentTermsRef,
          external_ref: externalRef,
        },
      });

      if (!res.ok) {
        toast({ title: 'Payment Recording Failed', description: res.error, variant: 'destructive' });
        return;
      }

      toast({
        title: 'Payment Recorded & Settled',
        description: `Payment of ₹${Number(payAmount).toLocaleString('en-IN')} logged. PO settlement status updated.`,
      });
      setPayOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setPaying(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 mb-2">
              <Receipt className="w-3.5 h-3.5" /> Finance Three-Way Match & Payment Gate
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Invoices & Three-Way Match Verification
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Verify Purchase Order (PO) ↔ Goods Receipt Note (GRN) ↔ Invoice agreement before payment release.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => setSubmitOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
              <PlusCircle className="w-4 h-4" /> Submit Invoice
            </Button>
          </div>
        </div>

        {/* Invoices List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <Card className="text-center p-8">
              <p className="text-slate-500">No invoices submitted yet. Submit an invoice against an issued Purchase Order.</p>
            </Card>
          ) : (
            invoices.map((inv) => {
              const po = inv.purchase_orders;
              const grn = inv.grns;
              const isMatched = inv.match_status === 'matched';
              const isOnHold = inv.match_status === 'on_hold';
              const isApproved = inv.match_status === 'approved';
              const isPaid = inv.match_status === 'paid';
              const poVal = Number(po?.total_value || 0);
              const grnVal = Number(grn?.accepted_value || 0);
              const invVal = Number(inv.invoice_amount || 0);

              return (
                <Card key={inv.id} className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300">
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                            Invoice: {inv.invoice_number}
                          </span>
                          <Badge
                            variant={
                              isPaid
                                ? 'default'
                                : isApproved
                                ? 'secondary'
                                : isMatched
                                ? 'outline'
                                : 'destructive'
                            }
                          >
                            {inv.match_status.toUpperCase()}
                          </Badge>
                          {inv.is_service_po && (
                            <Badge variant="outline" className="text-xs text-blue-600 border-blue-400">
                              Service PO (Completion Certificate)
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Vendor: <span className="font-semibold text-slate-700 dark:text-slate-300">{inv.vendors?.name}</span> • PO: {po?.po_number} • PR: {po?.purchase_requisitions?.pr_number}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isMatched && (
                          <Button
                            size="sm"
                            onClick={() => handleApprove(inv)}
                            disabled={acting}
                            className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve Invoice
                          </Button>
                        )}
                        {isApproved && (
                          <Button
                            size="sm"
                            onClick={() => handleOpenPay(inv)}
                            disabled={acting}
                            className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                          >
                            <CreditCard className="w-3.5 h-3.5" /> Record Payment
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 text-sm space-y-3">
                    {/* Visual Three-Way Match Comparator */}
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-1.5"><Scale className="w-4 h-4 text-indigo-500" /> Three-Way Verification Matrix</span>
                        <span>{isMatched ? '✅ Fully Reconciled' : isOnHold ? '⚠️ Verification Hold' : '⚡ Approved for Payment'}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        {/* 1. PO */}
                        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border">
                          <span className="text-slate-400 block text-[11px]">1. Purchase Order Value</span>
                          <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">
                            ₹{poVal.toLocaleString('en-IN')}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-0.5">PO: {po?.po_number}</span>
                        </div>

                        {/* 2. GRN */}
                        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border">
                          <span className="text-slate-400 block text-[11px]">2. GRN Accepted Value</span>
                          <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">
                            {inv.is_service_po ? 'N/A (Service)' : `₹${grnVal.toLocaleString('en-IN')}`}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-0.5">GRN: {grn?.grn_number || 'None'} ({grn?.status || 'unlinked'})</span>
                        </div>

                        {/* 3. Invoice */}
                        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border">
                          <span className="text-slate-400 block text-[11px]">3. Claimed Invoice Amount</span>
                          <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">
                            ₹{invVal.toLocaleString('en-IN')}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-0.5">Invoice: {inv.invoice_number}</span>
                        </div>
                      </div>

                      {/* Hold reason message */}
                      {isOnHold && inv.hold_reason && (
                        <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 rounded-lg text-xs text-red-900 dark:text-red-200 flex items-start gap-2">
                          <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold">Match Discrepancy / Hold: </span>
                            {inv.hold_reason}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Modal: Submit Invoice */}
        <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Submit Vendor Invoice</DialogTitle>
              <DialogDescription>
                Finance entry for vendor invoice with automatic 3-way match validation (§8.7).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Issued Purchase Order</Label>
                <Select value={selectedPoId} onValueChange={setSelectedPoId}>
                  <SelectTrigger><SelectValue placeholder="Select PO..." /></SelectTrigger>
                  <SelectContent>
                    {pos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.po_number} — {p.vendors?.name} (₹{Number(p.total_value).toLocaleString('en-IN')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Vendor Invoice Number</Label>
                <Input
                  placeholder="e.g. INV-2026-0042"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Claimed Invoice Amount (₹)</Label>
                <Input
                  type="number"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(Number(e.target.value) || 0)}
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="srv-po"
                  checked={isServicePo}
                  onCheckedChange={(c) => setIsServicePo(!!c)}
                />
                <Label htmlFor="srv-po" className="text-xs cursor-pointer">
                  Service / AMC PO (Completion certificate in lieu of GRN)
                </Label>
              </div>

              {isServicePo && (
                <div className="space-y-1">
                  <Label>Service Completion Certificate Reference / URL</Label>
                  <Input
                    placeholder="e.g. CERT-AMC-2026-01"
                    value={serviceCertUrl}
                    onChange={(e) => setServiceCertUrl(e.target.value)}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSubmitInvoice}
                disabled={submitting || !selectedPoId || !invoiceNumber.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submitting ? 'Verifying...' : 'Submit & Run 3-Way Match'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Record Payment */}
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record Payment Release</DialogTitle>
              <DialogDescription>
                Release payment for approved invoice {activeInvoice?.invoice_number}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded text-xs flex justify-between items-center">
                <span className="text-slate-500">Approved Invoice Amount:</span>
                <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">
                  ₹{Number(activeInvoice?.invoice_amount || 0).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Payment Mode</Label>
                  <Select value={paymentMode} onValueChange={(v: any) => setPaymentMode(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer / NEFT</SelectItem>
                      <SelectItem value="rtgs">RTGS</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI / Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Payment Amount (₹)</Label>
                  <Input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Bank UTR / Transaction Reference</Label>
                <Input
                  placeholder="e.g. UTR-9876543210"
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button
                onClick={handleRecordPayment}
                disabled={paying || payAmount <= 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {paying ? 'Releasing...' : 'Confirm Payment Release'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
