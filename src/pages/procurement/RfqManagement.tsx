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
  createRfq,
  sendRfq,
  recordQuotationResponse,
  listRfqs,
} from '@/lib/procurement/rfq.functions';
import {
  Send,
  PlusCircle,
  FileText,
  Building2,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Eye,
} from 'lucide-react';

export default function RfqManagement() {
  const { toast } = useToast();
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [approvedPrs, setApprovedPrs] = useState<any[]>([]);
  const [empanelledVendors, setEmpanelledVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create RFQ Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPrId, setSelectedPrId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Send RFQ Modal
  const [sendOpen, setSendOpen] = useState(false);
  const [activeRfq, setActiveRfq] = useState<any>(null);
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  // Record Quote Modal
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteRfq, setQuoteRfq] = useState<any>(null);
  const [quoteVendorId, setQuoteVendorId] = useState('');
  const [quotationRef, setQuotationRef] = useState('');
  const [quoteLines, setQuoteLines] = useState<any[]>([]);
  const [recording, setRecording] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await (listRfqs as any)();
      if (res?.ok) {
        setRfqs(res.rfqs || []);
      }

      // Fetch approved PRs
      const { data: prData } = await supabase
        .from('purchase_requisitions')
        .select('id, pr_number, category, scope, estimated_value, status, justification')
        .eq('status', 'approved');
      setApprovedPrs(prData || []);

      // Fetch empanelled vendors
      const { data: vData } = await supabase
        .from('vendors')
        .select('id, name, gst_number, status, empanelment_expiry')
        .eq('status', 'empanelled');
      setEmpanelledVendors(vData || []);
    } catch (e: any) {
      toast({ title: 'Error loading data', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateRfq = async () => {
    if (!selectedPrId) {
      toast({ title: 'Validation Error', description: 'Please select an approved requisition.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const res = await (createRfq as any)({
        data: {
          pr_id: selectedPrId,
          response_deadline: deadline || null,
          notes: notes || null,
        },
      });

      if (!res.ok) {
        toast({ title: 'Failed to create RFQ', description: res.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'RFQ Created', description: `RFQ created with status "${res.rfq.status}".` });
      setCreateOpen(false);
      setSelectedPrId('');
      setDeadline('');
      setNotes('');
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleOpenSend = (rfq: any) => {
    setActiveRfq(rfq);
    setSelectedVendorIds(rfq.rfq_vendors?.map((v: any) => v.vendor_id) || []);
    setSendOpen(true);
  };

  const handleSendRfq = async () => {
    if (!activeRfq) return;
    const minReq = activeRfq.required_min_quotations || 3;
    if (selectedVendorIds.length < minReq) {
      toast({
        title: 'Insufficient Vendors',
        description: `Institutional Procurement Rules require at least ${minReq} empanelled vendors (currently selected ${selectedVendorIds.length}).`,
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    try {
      const res = await (sendRfq as any)({
        data: {
          rfq_id: activeRfq.id,
          vendor_ids: selectedVendorIds,
        },
      });

      if (!res.ok) {
        toast({ title: 'Failed to send RFQ', description: res.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'RFQ Sent', description: `Sent to ${res.sentCount} empanelled vendors successfully.` });
      setSendOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleOpenRecordQuote = async (rfq: any) => {
    setQuoteRfq(rfq);
    setQuoteVendorId(rfq.rfq_vendors?.[0]?.vendor_id || '');
    setQuotationRef('');

    // Fetch line items for this PR
    const { data: items } = await supabase
      .from('pr_line_items')
      .select('*')
      .eq('pr_id', rfq.pr_id);

    if (items && items.length > 0) {
      setQuoteLines(
        items.map((i) => ({
          pr_line_item_id: i.id,
          description: i.description,
          quantity: Number(i.net_qty_to_procure) || 1,
          unit: i.unit || 'pcs',
          unit_price: Number(i.est_unit_price) || 0,
          tax_amount: 0,
          delivery_days: 7,
          warranty_months: 12,
          meets_technical_spec: true,
          technical_remarks: '',
        })),
      );
    } else {
      setQuoteLines([
        {
          description: rfq.purchase_requisitions?.justification || 'Required items',
          quantity: 1,
          unit: 'lot',
          unit_price: Number(rfq.purchase_requisitions?.estimated_value) || 0,
          tax_amount: 0,
          delivery_days: 7,
          warranty_months: 12,
          meets_technical_spec: true,
          technical_remarks: '',
        },
      ]);
    }

    setQuoteOpen(true);
  };

  const handleRecordQuote = async () => {
    if (!quoteRfq || !quoteVendorId) {
      toast({ title: 'Select Vendor', description: 'Please select an invited vendor.', variant: 'destructive' });
      return;
    }

    setRecording(true);
    try {
      const res = await (recordQuotationResponse as any)({
        data: {
          rfq_id: quoteRfq.id,
          vendor_id: quoteVendorId,
          quotation_ref: quotationRef,
          lines: quoteLines,
        },
      });

      if (!res.ok) {
        toast({ title: 'Failed to record quote', description: res.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'Quotation Recorded', description: `Saved ${res.linesCount} quotation line items.` });
      setQuoteOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setRecording(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 mb-2">
              <FileText className="w-3.5 h-3.5" /> Request For Quotations
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              RFQ & Vendor Solicitations
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Create RFQs against approved PRs, invite empanelled vendors, and capture line-item quotations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
              <PlusCircle className="w-4 h-4" /> Create RFQ
            </Button>
          </div>
        </div>

        {/* RFQ List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading RFQs...</div>
          ) : rfqs.length === 0 ? (
            <Card className="text-center p-8">
              <p className="text-slate-500">No RFQs created yet. Create one from an approved Purchase Requisition.</p>
            </Card>
          ) : (
            rfqs.map((rfq) => {
              const vendorsCount = rfq.rfq_vendors?.length || 0;
              const responsesCount = rfq.rfq_vendors?.filter((v: any) => v.response_received_at)?.length || 0;
              const minReq = rfq.required_min_quotations || 3;
              const pr = rfq.purchase_requisitions;

              return (
                <Card key={rfq.id} className="overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300">
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                            {rfq.rfq_number || 'RFQ-PENDING'}
                          </span>
                          <Badge variant={rfq.status === 'sent' ? 'default' : rfq.status === 'closed' ? 'secondary' : 'outline'}>
                            {rfq.status.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Min {minReq} Quotes Required
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500">
                          PR Ref: <span className="font-semibold text-slate-700 dark:text-slate-300">{pr?.pr_number || 'PR'}</span> • Category: {pr?.category} • Est. Value: ₹{Number(pr?.estimated_value || 0).toLocaleString('en-IN')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {rfq.status === 'draft' && (
                          <Button size="sm" onClick={() => handleOpenSend(rfq)} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                            <Send className="w-3.5 h-3.5" /> Invite Vendors
                          </Button>
                        )}
                        {rfq.status === 'sent' && (
                          <Button size="sm" variant="outline" onClick={() => handleOpenRecordQuote(rfq)} className="gap-1 border-blue-500 text-blue-600 hover:bg-blue-50">
                            <PlusCircle className="w-3.5 h-3.5" /> Record Quotation
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 text-sm space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg text-xs">
                      <div>
                        <span className="text-slate-500 block">Invited Empanelled Vendors</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {vendorsCount} / {minReq} required
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Quotation Responses</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {responsesCount} received ({rfq.quotation_lines?.length || 0} line items)
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Response Deadline</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {rfq.response_deadline ? new Date(rfq.response_deadline).toLocaleDateString() : 'Open / Unset'}
                        </span>
                      </div>
                    </div>

                    {/* Vendors list chips */}
                    {rfq.rfq_vendors && rfq.rfq_vendors.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-slate-500">Participating Vendors:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {rfq.rfq_vendors.map((rv: any) => (
                            <Badge key={rv.id} variant="secondary" className="gap-1 text-xs py-0.5">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {rv.vendors?.name || 'Vendor'}
                              {rv.response_received_at ? (
                                <CheckCircle className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Clock className="w-3 h-3 text-amber-500" />
                              )}
                            </Badge>
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

        {/* Modal: Create RFQ */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Request for Quotation</DialogTitle>
              <DialogDescription>
                Select an approved Purchase Requisition to initiate a multi-vendor RFQ.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Approved Purchase Requisition</Label>
                <Select value={selectedPrId} onValueChange={setSelectedPrId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select approved PR..." />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedPrs.map((pr) => (
                      <SelectItem key={pr.id} value={pr.id}>
                        {pr.pr_number || pr.id.slice(0, 8)} — {pr.category} (₹{Number(pr.estimated_value).toLocaleString('en-IN')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {approvedPrs.length === 0 && (
                  <p className="text-xs text-amber-600">No approved PRs available. Raise and approve a PR first.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Response Deadline</Label>
                <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Procurement Notes / Terms</Label>
                <Textarea
                  placeholder="Standard delivery terms, inspection requirements..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateRfq} disabled={creating || !selectedPrId}>
                {creating ? 'Creating...' : 'Create RFQ'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Send RFQ to Empanelled Vendors */}
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Invite Empanelled Vendors</DialogTitle>
              <DialogDescription>
                Select at least {activeRfq?.required_min_quotations || 3} empanelled vendors. Free-text email input is restricted to empanelled vendors.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between font-semibold text-blue-900 dark:text-blue-200">
                  <span>Required Vendors: ≥ {activeRfq?.required_min_quotations || 3}</span>
                  <span>Selected: {selectedVendorIds.length}</span>
                </div>
                {selectedVendorIds.length < (activeRfq?.required_min_quotations || 3) && (
                  <p className="text-amber-700 dark:text-amber-400">
                    ⚠️ You must select {((activeRfq?.required_min_quotations || 3) - selectedVendorIds.length)} more vendor(s) to meet the minimum quotation rule.
                  </p>
                )}
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 border p-3 rounded-md">
                {empanelledVendors.map((vendor) => {
                  const isChecked = selectedVendorIds.includes(vendor.id);
                  return (
                    <div
                      key={vendor.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer"
                      onClick={() => {
                        setSelectedVendorIds((prev) =>
                          isChecked ? prev.filter((id) => id !== vendor.id) : [...prev, vendor.id],
                        );
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <Checkbox checked={isChecked} />
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{vendor.name}</p>
                          <p className="text-xs text-slate-400">GST: {vendor.gst_number || 'N/A'}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500">
                        Empanelled
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSendRfq}
                disabled={sending || selectedVendorIds.length < (activeRfq?.required_min_quotations || 3)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {sending ? 'Sending...' : `Send to ${selectedVendorIds.length} Vendors`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Record Quotation Response */}
        <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record Vendor Quotation</DialogTitle>
              <DialogDescription>
                Capture quotation lines, unit pricing, taxes, and technical compliance check.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Responding Vendor</Label>
                  <Select value={quoteVendorId} onValueChange={setQuoteVendorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {quoteRfq?.rfq_vendors?.map((rv: any) => (
                        <SelectItem key={rv.vendor_id} value={rv.vendor_id}>
                          {rv.vendors?.name || rv.vendor_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Quotation Reference / Invoice No</Label>
                  <Input
                    placeholder="e.g. QUOT-2026-99"
                    value={quotationRef}
                    onChange={(e) => setQuotationRef(e.target.value)}
                  />
                </div>
              </div>

              {/* Line items table */}
              <div className="space-y-3">
                <Label>Line Item Pricing & Technical Compliance</Label>
                {quoteLines.map((line, idx) => (
                  <div key={idx} className="p-3 border rounded-lg bg-slate-50 dark:bg-slate-900 space-y-3 text-xs">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      Item #{idx + 1}: {line.description}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <Label className="text-[10px]">Quantity</Label>
                        <Input
                          type="number"
                          value={line.quantity}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 1;
                            setQuoteLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: val } : l)));
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
                            setQuoteLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unit_price: val } : l)));
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Taxes (₹)</Label>
                        <Input
                          type="number"
                          value={line.tax_amount}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setQuoteLines((prev) => prev.map((l, i) => (i === idx ? { ...l, tax_amount: val } : l)));
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Total (₹)</Label>
                        <div className="p-2 font-mono font-bold bg-white dark:bg-slate-950 border rounded text-right">
                          ₹{((line.quantity * line.unit_price) + Number(line.tax_amount)).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t">
                      <div>
                        <Label className="text-[10px]">Delivery (Days)</Label>
                        <Input
                          type="number"
                          value={line.delivery_days}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 7;
                            setQuoteLines((prev) => prev.map((l, i) => (i === idx ? { ...l, delivery_days: val } : l)));
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Warranty (Months)</Label>
                        <Input
                          type="number"
                          value={line.warranty_months}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 12;
                            setQuoteLines((prev) => prev.map((l, i) => (i === idx ? { ...l, warranty_months: val } : l)));
                          }}
                        />
                      </div>
                      <div className="flex items-center space-x-2 pt-4">
                        <Checkbox
                          id={`spec-${idx}`}
                          checked={line.meets_technical_spec}
                          onCheckedChange={(checked) => {
                            setQuoteLines((prev) =>
                              prev.map((l, i) => (i === idx ? { ...l, meets_technical_spec: !!checked } : l)),
                            );
                          }}
                        />
                        <Label htmlFor={`spec-${idx}`} className="text-xs cursor-pointer font-medium">
                          Meets Spec
                        </Label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setQuoteOpen(false)}>Cancel</Button>
              <Button onClick={handleRecordQuote} disabled={recording || !quoteVendorId}>
                {recording ? 'Saving...' : 'Save Quotation Response'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
