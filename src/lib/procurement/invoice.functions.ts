/**
 * Invoice & Payment Functions with Three-Way Match Engine (SOP §8.7).
 *
 * Enforces server-side gates:
 * - Duplicate invoice number check against the same vendor.
 * - Three-Way Match (PO ↔ GRN ↔ Invoice amount agreement).
 * - Service PO exception with completion certificate in lieu of GRN (§I2).
 * - Invoice approval strictly BLOCKED unless match_status = 'matched'.
 * - Payment recording strictly BLOCKED unless invoice is 'approved'.
 */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type SubmitInvoiceInput = {
  po_id: string;
  vendor_id?: string | null;
  grn_id?: string | null;
  invoice_number: string;
  invoice_amount: number;
  gst_details_json?: any;
  is_service_po?: boolean;
  service_completion_cert_url?: string | null;
};

export type ApproveInvoiceInput = {
  invoice_id: string;
  remarks?: string | null;
};

export type RecordPaymentInput = {
  invoice_id: string;
  amount: number;
  payment_mode?: 'bank_transfer' | 'neft' | 'rtgs' | 'cheque' | 'upi';
  payment_terms_ref?: string | null;
  external_ref?: string | null;
};

export function evaluateThreeWayMatch(
  po: { total_value: number; status: string; type?: string },
  grn: { accepted_value: number; status: string } | null,
  invoiceAmount: number,
  isServicePo = false,
  serviceCertUrl?: string | null,
): { matchStatus: 'matched' | 'on_hold'; holdReason: string | null } {
  const invAmt = Number(invoiceAmount) || 0;
  const poVal = Number(po.total_value) || 0;

  // Service PO exception per SOP §I2
  if (isServicePo && serviceCertUrl && serviceCertUrl.trim()) {
    if (invAmt > poVal + 1) {
      return {
        matchStatus: 'on_hold',
        holdReason: `Invoice amount ₹${invAmt.toLocaleString('en-IN')} exceeds service purchase order value ₹${poVal.toLocaleString('en-IN')}.`,
      };
    }
    return { matchStatus: 'matched', holdReason: null };
  }

  // Regular goods PO requires accepted GRN
  if (!grn) {
    return {
      matchStatus: 'on_hold',
      holdReason: 'Three-way match pending: No Goods Receipt Note (GRN) linked to this invoice.',
    };
  }

  if (grn.status !== 'accepted' && grn.status !== 'partially_accepted') {
    return {
      matchStatus: 'on_hold',
      holdReason: `Three-way match failed: Goods Receipt Note is "${grn.status}", not accepted.`,
    };
  }

  const grnAccepted = Number(grn.accepted_value) || 0;

  if (invAmt > grnAccepted + 1) {
    return {
      matchStatus: 'on_hold',
      holdReason: `Three-way match failed: Invoice amount (₹${invAmt.toLocaleString('en-IN')}) exceeds accepted goods value (₹${grnAccepted.toLocaleString('en-IN')}) per GRN.`,
    };
  }

  if (invAmt > poVal + 1) {
    return {
      matchStatus: 'on_hold',
      holdReason: `Three-way match failed: Invoice amount (₹${invAmt.toLocaleString('en-IN')}) exceeds Purchase Order total (₹${poVal.toLocaleString('en-IN')}).`,
    };
  }

  return { matchStatus: 'matched', holdReason: null };
}

export const submitInvoice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: SubmitInvoiceInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;

    // 1. Fetch PO details
    const { data: po, error: poErr } = await db
      .from('purchase_orders')
      .select('id, po_number, vendor_id, total_value, status, type')
      .eq('id', data.po_id)
      .single();

    if (poErr || !po) {
      return { ok: false as const, error: 'Purchase Order not found', code: 'po_not_found' };
    }

    const effectiveVendorId = data.vendor_id || po.vendor_id;

    // 2. Duplicate invoice number check against this vendor
    const { data: dup } = await db
      .from('invoices')
      .select('id, invoice_number')
      .eq('vendor_id', effectiveVendorId)
      .eq('invoice_number', data.invoice_number.trim())
      .maybeSingle();

    if (dup) {
      return {
        ok: false as const,
        error: `Duplicate invoice detected: Invoice "${data.invoice_number}" has already been submitted for this vendor.`,
        code: 'duplicate_invoice_number',
      };
    }

    // 3. Fetch GRN if provided
    let grnData: any = null;
    if (data.grn_id) {
      const { data: grn } = await db
        .from('grns')
        .select('id, accepted_value, status')
        .eq('id', data.grn_id)
        .maybeSingle();
      grnData = grn;
    } else {
      // Find latest accepted GRN for this PO if not explicitly passed
      const { data: latestGrn } = await db
        .from('grns')
        .select('id, accepted_value, status')
        .eq('po_id', data.po_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      grnData = latestGrn;
    }

    // 4. Run Three-Way Match Engine
    const { matchStatus, holdReason } = evaluateThreeWayMatch(
      po,
      grnData,
      data.invoice_amount,
      data.is_service_po ?? false,
      data.service_completion_cert_url,
    );

    // 5. Insert Invoice
    const { data: invoice, error: insErr } = await db
      .from('invoices')
      .insert({
        po_id: data.po_id,
        vendor_id: effectiveVendorId,
        grn_id: grnData?.id ?? data.grn_id ?? null,
        invoice_number: data.invoice_number.trim(),
        invoice_amount: Number(data.invoice_amount) || 0,
        gst_details_json: data.gst_details_json ?? {},
        is_duplicate_check_passed: true,
        match_status: matchStatus,
        hold_reason: holdReason,
        is_service_po: data.is_service_po ?? false,
        service_completion_cert_url: data.service_completion_cert_url ?? null,
        submitted_by: context.userId,
      })
      .select('*')
      .single();

    if (insErr) return { ok: false as const, error: insErr.message, code: 'insert_invoice_failed' };

    return {
      ok: true as const,
      invoice,
      matchStatus,
      holdReason,
    };
  });

export const runThreeWayMatch = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoice_id: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;

    const { data: inv, error: invErr } = await db
      .from('invoices')
      .select(`
        *,
        purchase_orders (id, total_value, status, type),
        grns (id, accepted_value, status)
      `)
      .eq('id', data.invoice_id)
      .single();

    if (invErr || !inv) return { ok: false as const, error: 'Invoice not found' };

    const { matchStatus, holdReason } = evaluateThreeWayMatch(
      inv.purchase_orders,
      inv.grns,
      inv.invoice_amount,
      inv.is_service_po,
      inv.service_completion_cert_url,
    );

    const { error: upErr } = await db
      .from('invoices')
      .update({
        match_status: matchStatus,
        hold_reason: holdReason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inv.id);

    if (upErr) return { ok: false as const, error: upErr.message };

    return { ok: true as const, matchStatus, holdReason };
  });

export const approveInvoice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: ApproveInvoiceInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import('@/server/procurement/roles');
    const { ForbiddenError } = await import('@/server/procurement/errors');

    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    if (
      !held.includes('admin') &&
      !held.includes('director_admin_finance') &&
      !held.includes('procurement_officer')
    ) {
      throw new ForbiddenError(
        `Invoice approval requires Finance or Procurement Officer authorization. You hold: ${held.join(', ') || 'none'}.`,
      );
    }

    const { data: inv, error: invErr } = await db
      .from('invoices')
      .select('id, invoice_number, match_status, hold_reason, invoice_amount')
      .eq('id', data.invoice_id)
      .single();

    if (invErr || !inv) return { ok: false as const, error: 'Invoice not found' };

    // Strict Gate: Cannot approve invoice if not matched
    if (inv.match_status !== 'matched') {
      return {
        ok: false as const,
        error: `Cannot approve invoice "${inv.invoice_number}": Three-way match is "${inv.match_status}". Reason: ${inv.hold_reason || 'Discrepancy detected between PO, GRN, and Invoice.'}`,
        code: 'three_way_match_not_passed',
      };
    }

    const { error: upErr } = await db
      .from('invoices')
      .update({
        match_status: 'approved',
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', inv.id);

    if (upErr) return { ok: false as const, error: upErr.message };

    return { ok: true as const, invoiceId: inv.id, status: 'approved' };
  });

export const recordPayment = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: RecordPaymentInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import('@/server/procurement/roles');
    const { ForbiddenError } = await import('@/server/procurement/errors');

    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    if (!held.includes('admin') && !held.includes('director_admin_finance')) {
      throw new ForbiddenError(
        `Recording payment requires Finance role authorization. You hold: ${held.join(', ') || 'none'}.`,
      );
    }

    const { data: inv, error: invErr } = await db
      .from('invoices')
      .select('id, invoice_number, po_id, match_status, invoice_amount')
      .eq('id', data.invoice_id)
      .single();

    if (invErr || !inv) return { ok: false as const, error: 'Invoice not found' };

    // Strict Gate: Invoice must be approved before payment
    if (inv.match_status !== 'approved') {
      return {
        ok: false as const,
        error: `Cannot record payment: Invoice "${inv.invoice_number}" is in "${inv.match_status}" status. It must be approved first (SOP §8.7).`,
        code: 'invoice_not_approved',
      };
    }

    const paymentAmount = Number(data.amount) || Number(inv.invoice_amount) || 0;

    // 1. Insert Payment
    const { data: payment, error: pErr } = await db
      .from('payments')
      .insert({
        invoice_id: inv.id,
        po_id: inv.po_id,
        amount: paymentAmount,
        payment_mode: data.payment_mode || 'bank_transfer',
        payment_terms_ref: data.payment_terms_ref ?? null,
        external_ref: data.external_ref ?? null,
        paid_by: context.userId,
      })
      .select('*')
      .single();

    if (pErr) return { ok: false as const, error: pErr.message, code: 'insert_payment_failed' };

    // 2. Mark Invoice as paid
    await db
      .from('invoices')
      .update({ match_status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', inv.id);

    // 3. Check PO settlement and close PO if fully invoiced
    if (inv.po_id) {
      const { data: allInvoices } = await db
        .from('invoices')
        .select('invoice_amount, match_status')
        .eq('po_id', inv.po_id);

      const { data: po } = await db
        .from('purchase_orders')
        .select('total_value')
        .eq('id', inv.po_id)
        .single();

      const totalPaid = (allInvoices ?? [])
        .filter((i: any) => i.match_status === 'paid')
        .reduce((sum: number, i: any) => sum + Number(i.invoice_amount || 0), 0);

      const poTotal = Number(po?.total_value || 0);
      const isFull = totalPaid >= poTotal - 1;

      await db
        .from('purchase_orders')
        .update({
          status: isFull ? 'closed' : 'partially_closed',
          closed_at: isFull ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inv.po_id);
    }

    return { ok: true as const, payment, status: 'paid' };
  });

export const listInvoices = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input?: { po_id?: string; vendor_id?: string; match_status?: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    let query = db
      .from('invoices')
      .select(`
        *,
        purchase_orders (
          id, po_number, total_value, price, taxes, type, status,
          purchase_requisitions (id, pr_number, category, departments(id, name))
        ),
        vendors (id, name, gst_number, pan_number),
        grns (id, grn_number, accepted_value, status),
        payments (id, amount, paid_at, payment_mode, external_ref)
      `)
      .order('created_at', { ascending: false });

    if (data?.po_id) query = query.eq('po_id', data.po_id);
    if (data?.vendor_id) query = query.eq('vendor_id', data.vendor_id);
    if (data?.match_status) query = query.eq('match_status', data.match_status);

    const { data: list, error } = await query;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, invoices: list ?? [] };
  });
