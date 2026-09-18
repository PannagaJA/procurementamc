import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Layout from '@/components/Layout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, ShieldCheck, AlertTriangle, ArrowRight, CheckCircle2, Building2, Layers, IndianRupee } from 'lucide-react';
import { resolveApprover, normalizeCategory } from '@/lib/procurement/authorityMatrix';
import { createPr } from '@/lib/procurement/pr.functions';

type LineItem = {
  id: string;
  description: string;
  unit: string;
  qty_required: number;
  qty_in_stock: number;
  est_unit_price: number;
};

const CATEGORIES = [
  { value: 'small_value', label: 'Small Value / Direct Purchase (≤ ₹5,000)' },
  { value: 'routine_consumable', label: 'Routine Consumables (Rate Contract)' },
  { value: 'equipment_asset', label: 'Equipment & Asset Procurement' },
  { value: 'software', label: 'Software & Cloud Licenses' },
  { value: 'academic_research', label: 'Academic & Research Material' },
  { value: 'services_amc', label: 'Services & Annual Maintenance (AMC)' },
  { value: 'maintenance', label: 'Facility Maintenance & Repairs' },
];

export default function RaiseRequisition() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [matrixRules, setMatrixRules] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<any | null>(null);

  // Form State
  const [departmentId, setDepartmentId] = useState<string>('');
  const [category, setCategory] = useState<string>('small_value');
  const [scope, setScope] = useState<'academic' | 'operational'>('operational');
  const [budgetHead, setBudgetHead] = useState<string>('');
  const [isEmergency, setIsEmergency] = useState<boolean>(false);
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurringFrequency, setRecurringFrequency] = useState<string>('');
  const [justification, setJustification] = useState<string>('');
  const [marketSurveyNotes, setMarketSurveyNotes] = useState<string>('');

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: '1',
      description: '',
      unit: 'pcs',
      qty_required: 1,
      qty_in_stock: 0,
      est_unit_price: 1500,
    },
  ]);

  // Load initial data (departments, matrix rules)
  useEffect(() => {
    async function loadData() {
      const { data: depts } = await supabase.from('departments').select('id, name').order('name');
      if (depts && depts.length > 0) {
        setDepartments(depts);
        setDepartmentId(depts[0].id);
      }

      const { data: rules } = await supabase.from('approval_matrix_rules').select('*').eq('active', true);
      if (rules) {
        setMatrixRules(rules);
      }
    }
    loadData();
  }, []);

  // Compute item totals and estimated total value
  const computedItems = useMemo(() => {
    return lineItems.map((item) => {
      const netQty = Math.max(0, Number(item.qty_required || 0) - Number(item.qty_in_stock || 0));
      const lineTotal = netQty * Number(item.est_unit_price || 0);
      return {
        ...item,
        net_qty: netQty,
        line_total: lineTotal,
      };
    });
  }, [lineItems]);

  const totalEstimatedValue = useMemo(() => {
    return computedItems.reduce((sum, item) => sum + item.line_total, 0);
  }, [computedItems]);

  // Real-time Authority Matrix Resolver preview
  const liveRouting = useMemo(() => {
    return resolveApprover(category, totalEstimatedValue, 0, matrixRules);
  }, [category, totalEstimatedValue, matrixRules]);

  const handleAddItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        description: '',
        unit: 'pcs',
        qty_required: 1,
        qty_in_stock: 0,
        est_unit_price: 1000,
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (lineItems.length === 1) {
      toast({
        title: 'At least one item required',
        description: 'You cannot remove all line items.',
        variant: 'destructive',
      });
      return;
    }
    setLineItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleItemChange = (id: string, field: keyof LineItem, val: any) => {
    setLineItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: val } : i)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentId) {
      toast({ title: 'Please select a department', variant: 'destructive' });
      return;
    }
    if (!justification.trim()) {
      toast({ title: 'Please provide a justification', variant: 'destructive' });
      return;
    }
    const validItems = lineItems.filter((i) => i.description.trim().length > 0);
    if (validItems.length === 0) {
      toast({ title: 'Please provide at least one valid line item description', variant: 'destructive' });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createPr({
        data: {
          department_id: departmentId,
          category: normalizeCategory(category),
          scope,
          budget_head: budgetHead.trim() || null,
          estimated_value: totalEstimatedValue,
          is_recurring: isRecurring,
          recurring_frequency: isRecurring ? recurringFrequency : null,
          is_emergency: isEmergency,
          justification: justification.trim(),
          market_survey_notes: marketSurveyNotes.trim() || null,
          line_items: validItems.map((i) => ({
            description: i.description,
            unit: i.unit,
            qty_required: Number(i.qty_required),
            qty_in_stock: Number(i.qty_in_stock),
            est_unit_price: Number(i.est_unit_price),
          })),
        },
      });

      if (!res.ok) {
        toast({
          title: 'Failed to create requisition',
          description: (res as any).error || 'Server error',
          variant: 'destructive',
        });
        return;
      }

      setCreatedResult(res);
      toast({
        title: 'Requisition Raised Successfully!',
        description: `PR Number: ${res.pr.pr_number} routed to ${res.routing.role.toUpperCase()}`,
      });
    } catch (err: any) {
      console.error('Submission failed', err);
      toast({
        title: 'Requisition failed',
        description: err.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> SOP §8.3 Compliance
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Raise Purchase Requisition (PR)
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Create structured indent requests with server-enforced Authority Matrix routing and instant approval preview.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate({ to: '/procurement/vendors' })}>
              Vendor Management <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>

        {/* Success Confirmation Modal / Banner */}
        {createdResult && (
          <Card className="border-2 border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <CardTitle className="text-xl text-emerald-900 dark:text-emerald-100">
                    Requisition Submitted: {createdResult.pr.pr_number}
                  </CardTitle>
                  <CardDescription className="text-emerald-700 dark:text-emerald-300">
                    Authority Matrix engine successfully evaluated and routed this purchase request.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-emerald-900 dark:text-emerald-100">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-white/80 dark:bg-slate-900/80 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div>
                  <span className="text-xs uppercase text-slate-500 font-semibold">Assigned Approver</span>
                  <p className="font-bold text-base text-slate-800 dark:text-slate-100 capitalize">
                    {createdResult.routing.role.replace(/_/g, ' ')}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-500 font-semibold">Routing Status</span>
                  <p className="font-bold text-base text-slate-800 dark:text-slate-100">
                    {createdResult.routing.escalate ? '🚨 Escalated to EVP' : '✓ Normal Authority Band'}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-500 font-semibold">Min. Quotations</span>
                  <p className="font-bold text-base text-slate-800 dark:text-slate-100">
                    {createdResult.routing.minQuotations} Quotes Required
                  </p>
                </div>
              </div>
              <p className="italic text-xs text-emerald-800 dark:text-emerald-200">
                <strong>Routing Reason:</strong> {createdResult.routing.reason}
              </p>
              <div className="pt-2 flex gap-3">
                <Button size="sm" onClick={() => setCreatedResult(null)}>
                  Raise Another PR
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Requisition Form */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Section 1: Classification & Scope */}
              <Card className="shadow-sm border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" /> 1. Requisition Metadata
                  </CardTitle>
                  <CardDescription>Department indent details and classification category.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="department">Requesting Department *</Label>
                    <Select value={departmentId} onValueChange={setDepartmentId}>
                      <SelectTrigger id="department">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">SOP Category *</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select procurement category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scope">Procurement Scope *</Label>
                    <Select value={scope} onValueChange={(v: any) => setScope(v)}>
                      <SelectTrigger id="scope">
                        <SelectValue placeholder="Scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="operational">Operational / Administrative</SelectItem>
                        <SelectItem value="academic">Academic / Teaching & Research</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="budgetHead">Budget Head (Optional)</Label>
                    <Input
                      id="budgetHead"
                      placeholder="e.g. LAB-EQUIP-2026 / OPEX"
                      value={budgetHead}
                      onChange={(e) => setBudgetHead(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Section 2: Line Items */}
              <Card className="shadow-sm border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Layers className="w-5 h-5 text-indigo-600" /> 2. PR Line Items
                    </CardTitle>
                    <CardDescription>
                      Specify required items. Net quantities to procure and line estimates calculate automatically.
                    </CardDescription>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={handleAddItem} className="gap-1.5">
                    <Plus className="w-4 h-4" /> Add Item
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {lineItems.map((item, idx) => {
                    const net = Math.max(0, Number(item.qty_required || 0) - Number(item.qty_in_stock || 0));
                    const subtotal = net * Number(item.est_unit_price || 0);

                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                            Item #{idx + 1}
                          </span>
                          {lineItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                          <div className="md:col-span-3 space-y-1">
                            <Label className="text-xs">Description *</Label>
                            <Input
                              placeholder="Item specification & model"
                              value={item.description}
                              onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                              required
                            />
                          </div>
                          <div className="md:col-span-1 space-y-1">
                            <Label className="text-xs">Unit</Label>
                            <Input
                              placeholder="pcs/kg/box"
                              value={item.unit}
                              onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                            />
                          </div>
                          <div className="md:col-span-1 space-y-1">
                            <Label className="text-xs">Qty Req.</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.qty_required}
                              onChange={(e) => handleItemChange(item.id, 'qty_required', Math.max(1, parseInt(e.target.value) || 0))}
                            />
                          </div>
                          <div className="md:col-span-1 space-y-1">
                            <Label className="text-xs">In Stock</Label>
                            <Input
                              type="number"
                              min="0"
                              value={item.qty_in_stock}
                              onChange={(e) => handleItemChange(item.id, 'qty_in_stock', Math.max(0, parseInt(e.target.value) || 0))}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-slate-200 dark:border-slate-800 items-center">
                          <div className="space-y-1">
                            <Label className="text-xs">Est. Unit Price (₹)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.est_unit_price}
                              onChange={(e) => handleItemChange(item.id, 'est_unit_price', parseFloat(e.target.value) || 0)}
                            />
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            Net to Procure: <span className="font-semibold text-slate-900 dark:text-slate-100">{net} {item.unit}</span>
                          </div>
                          <div className="text-right text-sm">
                            Line Total: <span className="font-bold text-slate-900 dark:text-slate-100">₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Section 3: Justification & Flags */}
              <Card className="shadow-sm border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">3. Justification & Pre-Indent Due Diligence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="justification">Procurement Necessity & Justification *</Label>
                    <Textarea
                      id="justification"
                      rows={3}
                      placeholder="Explain why this procurement is necessary, proposed use, and urgency..."
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="marketSurvey">Pre-indent Market Survey Notes (Optional)</Label>
                    <Textarea
                      id="marketSurvey"
                      rows={2}
                      placeholder="Brief notes on prevailing market rates, potential vendors contacted..."
                      value={marketSurveyNotes}
                      onChange={(e) => setMarketSurveyNotes(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
                      <input
                        type="checkbox"
                        id="isEmergency"
                        checked={isEmergency}
                        onChange={(e) => setIsEmergency(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                      />
                      <div>
                        <Label htmlFor="isEmergency" className="font-semibold text-amber-900 dark:text-amber-200 cursor-pointer">
                          Emergency Procurement (§9)
                        </Label>
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Subject to ₹10,00,000 annual institutional cap and post-facto audit.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                      <input
                        type="checkbox"
                        id="isRecurring"
                        checked={isRecurring}
                        onChange={(e) => setIsRecurring(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="space-y-1.5 flex-1">
                        <Label htmlFor="isRecurring" className="font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                          Recurring Requirement
                        </Label>
                        {isRecurring && (
                          <Input
                            placeholder="e.g. Monthly, Quarterly"
                            value={recurringFrequency}
                            onChange={(e) => setRecurringFrequency(e.target.value)}
                            className="h-8 text-xs mt-1"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button type="submit" size="lg" disabled={isSubmitting} className="w-full text-base font-semibold shadow-md">
                {isSubmitting ? 'Validating & Submitting PR...' : `Submit Purchase Requisition (₹${totalEstimatedValue.toLocaleString('en-IN')})`}
              </Button>
            </form>
          </div>

          {/* Sidebar: Live Authority Matrix Engine Inspector */}
          <div className="space-y-6">
            <Card className="sticky top-24 border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-50/50 via-white to-slate-50 dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-900 shadow-md">
              <CardHeader className="pb-3 border-b border-indigo-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    SOP Engine
                  </span>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Authority Matrix Live Routing
                </CardTitle>
                <CardDescription className="text-xs">
                  Server-enforced decision logic based on SOP §6 rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4 text-sm">
                {/* Total Value */}
                <div className="p-3 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <IndianRupee className="w-4 h-4 text-slate-500" />
                    <span>Requisition Value:</span>
                  </div>
                  <span className="text-lg font-black text-slate-900 dark:text-slate-100">
                    ₹{totalEstimatedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Resolved Role Display */}
                <div className="p-4 rounded-xl bg-indigo-600 text-white shadow-sm space-y-1">
                  <span className="text-xs uppercase text-indigo-200 font-medium">Target Approval Authority</span>
                  <div className="text-2xl font-black tracking-tight capitalize">
                    {liveRouting.role.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs text-indigo-100">
                    {liveRouting.escalate ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5" /> Escalated (Exceeds Band Cap)
                      </span>
                    ) : (
                      '✓ Within standard delegated approval band'
                    )}
                  </div>
                </div>

                {/* Proof Cases Quick Guide */}
                <div className="space-y-2 pt-2 text-xs border-t border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                    SOP §6 Threshold Proofs:
                  </span>
                  <ul className="space-y-1.5 text-slate-600 dark:text-slate-400">
                    <li className="flex items-start gap-1.5">
                      <span className="font-semibold text-emerald-600">₹1,500 Small Value:</span> Routes to <strong>HOD</strong> (≤ ₹2,000 txn limit)
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="font-semibold text-blue-600">₹4,500 Small Value:</span> Routes to <strong>Principal</strong> (≤ ₹5,000 txn limit)
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="font-semibold text-amber-600">₹15,000 Equipment:</span> Escalates to <strong>EVP</strong> (exceeds ₹10,000 cap)
                    </li>
                  </ul>
                </div>

                {/* Quotations & Requirements */}
                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Min. Quotations:</span>
                    <strong className="text-slate-900 dark:text-slate-100">{liveRouting.minQuotations} Quotes</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Rate Contract Required:</span>
                    <strong className="text-slate-900 dark:text-slate-100">{liveRouting.requiresRateContract ? 'Yes' : 'No'}</strong>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
                  <strong>Authority Rule:</strong> {liveRouting.reason}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
