/**
 * Purchase Order (PO) Server Functions (SOP §8.5).
 *
 * Enforces server-side gates:
 * - PO creation BLOCKED unless a Comparative Statement is approved OR an active Rate Contract exists.
 * - Vendor must be empanelled & active.
 * - PO-splitting check (cumulative PR value and 30-day window aggregation).
 * - PO Amendments: If amended value breaches original approver's tier limit (e.g. ₹8k -> ₹15k crossing ₹10k),
 *   requires_reapproval=true and routes to the higher authority tier.
 */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type CreatePoInput = {
  pr_id: string;
  cs_id?: string | null;
  rate_contract_id?: string | null;
  type: 'regular' | 'rate_contract';
  vendor_id: string;
  scope_of_supply: string;
  price: number;
  taxes: number;
  delivery_timeline?: string | null;
  payment_terms?: string | null;
};

export type ApprovePoInput = {
  po_id: string;
  remarks?: string | null;
};

export type IssuePoInput = {
  po_id: string;
};

export type AmendPoInput = {
  po_id: string;
  new_price: number;
  new_taxes: number;
  reason: string;
  changed_fields?: Record<string, any>;
};

export type ClosePoInput = {
  po_id: string;
  partially?: boolean;
  notes?: string | null;
};

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export const createPo = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: CreatePoInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { assertPrApproved, assertVendorEmpanelled, assertNoPoSplitting } = await import(
      '@/server/procurement/guards'
    );
    const { ProcurementRuleError } = await import('@/server/procurement/errors');
    const { resolveApprover, normalizeCategory } = await import('@/lib/procurement/authorityMatrix');

    // 1. Guard: Requisition must be approved
    try {
      await assertPrApproved(db, data.pr_id);
    } catch (e) {
      if (e instanceof ProcurementRuleError) return { ok: false as const, error: e.message, code: e.code };
      throw e;
    }

    // 2. Guard: Must have approved CS OR active Rate Contract
    if (data.type === 'regular') {
      if (!data.cs_id) {
        return {
          ok: false as const,
          error: 'A Comparative Statement (CS) ID is required for regular purchase orders (SOP §8.5).',
          code: 'cs_required',
        };
      }
      const { data: cs, error: csErr } = await db
        .from('comparative_statements')
        .select('id, status, recommended_vendor_id')
        .eq('id', data.cs_id)
        .single();

      if (csErr || !cs) return { ok: false as const, error: 'Comparative Statement not found', code: 'cs_not_found' };
      if (cs.status !== 'approved') {
        return {
          ok: false as const,
          error: `Cannot create PO: Comparative Statement is "${cs.status}", not approved (SOP §8.4, §8.5).`,
          code: 'cs_not_approved',
        };
      }
    } else if (data.type === 'rate_contract') {
      if (!data.rate_contract_id) {
        return {
          ok: false as const,
          error: 'A Rate Contract ID is required for rate contract purchase orders (SOP §8.2).',
          code: 'rc_required',
        };
      }
      const today = new Date().toISOString().split('T')[0];
      const { data: rc, error: rcErr } = await db
        .from('rate_contracts')
        .select('id, vendor_id, valid_from, valid_to')
        .eq('id', data.rate_contract_id)
        .single();

      if (rcErr || !rc) return { ok: false as const, error: 'Rate contract not found', code: 'rc_not_found' };
      if (rc.valid_from > today || rc.valid_to < today) {
        return {
          ok: false as const,
          error: `Rate contract is not active (valid: ${rc.valid_from} to ${rc.valid_to}).`,
          code: 'rc_expired',
        };
      }
    }

    // 3. Guard: Vendor must be empanelled & active
    try {
      await assertVendorEmpanelled(db, data.vendor_id);
    } catch (e) {
      if (e instanceof ProcurementRuleError) return { ok: false as const, error: e.message, code: e.code };
      throw e;
    }

    // 4. Guard: PO-splitting guard (cumulative PR value + 30-day window aggregation)
    const price = Number(data.price) || 0;
    const taxes = Number(data.taxes) || 0;
    const totalValue = price + taxes;

    try {
      await assertNoPoSplitting(db, data.pr_id, totalValue, data.vendor_id);
    } catch (e) {
      if (e instanceof ProcurementRuleError) return { ok: false as const, error: e.message, code: e.code };
      throw e;
    }

    // 5. Authority Matrix routing for PO approval
    const { data: pr } = await db
      .from('purchase_requisitions')
      .select('id, category, department_id, pr_number')
      .eq('id', data.pr_id)
      .single();

    const canonicalCat = normalizeCategory(pr?.category ?? 'routine_consumable');
    const { data: rules } = await db
      .from('approval_matrix_rules')
      .select('*')
      .eq('active', true);

    let spend = 0;
    if (pr?.department_id) {
      const { data: rows } = await db
        .from('department_monthly_spend')
        .select('total_spent')
        .eq('department_id', pr.department_id)
        .eq('month', monthKey())
        .eq('category', canonicalCat);
      spend = (rows ?? []).reduce((s: number, r: any) => s + Number(r.total_spent ?? 0), 0);
    }

    const resolved = resolveApprover(canonicalCat, totalValue, spend, rules ?? []);

    // 6. Insert Purchase Order
    const { data: po, error: poErr } = await db
      .from('purchase_orders')
      .insert({
        pr_id: data.pr_id,
        cs_id: data.cs_id ?? null,
        rate_contract_id: data.rate_contract_id ?? null,
        vendor_id: data.vendor_id,
        department_id: pr?.department_id ?? null,
        type: data.type,
        scope_of_supply: data.scope_of_supply,
        price,
        taxes,
        delivery_timeline: data.delivery_timeline ?? null,
        payment_terms: data.payment_terms ?? null,
        status: 'pending_approval',
        original_approver_role: resolved.role,
        current_approver_role: resolved.role,
        routing_reason: resolved.reason,
        created_by: context.userId,
      })
      .select('*')
      .single();

    if (poErr) return { ok: false as const, error: poErr.message, code: 'insert_po_failed' };

    return {
      ok: true as const,
      po,
      routing: {
        role: resolved.role,
        escalate: resolved.escalate,
        reason: resolved.reason,
      },
    };
  });

export const approvePo = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: ApprovePoInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import('@/server/procurement/roles');
    const { ForbiddenError } = await import('@/server/procurement/errors');

    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    const { data: po, error } = await db
      .from('purchase_orders')
      .select('id, status, current_approver_role, po_number')
      .eq('id', data.po_id)
      .maybeSingle();

    if (error || !po) return { ok: false as const, error: 'Purchase Order not found' };

    const requiredRole = po.current_approver_role;
    if (!held.includes('admin') && requiredRole && !held.includes(requiredRole)) {
      throw new ForbiddenError(
        `This Purchase Order requires "${requiredRole}" approval. You hold: ${held.join(', ') || 'none'}.`,
      );
    }

    const { error: upErr } = await db
      .from('purchase_orders')
      .update({
        status: 'approved',
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', po.id);

    if (upErr) return { ok: false as const, error: upErr.message };
    return { ok: true as const, poId: po.id, status: 'approved' };
  });

export const issuePo = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: IssuePoInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;

    const { data: po, error } = await db
      .from('purchase_orders')
      .select('id, status, po_number, vendor_id, pr_id')
      .eq('id', data.po_id)
      .maybeSingle();

    if (error || !po) return { ok: false as const, error: 'Purchase Order not found' };

    if (po.status !== 'approved' && po.status !== 'amended') {
      return {
        ok: false as const,
        error: `Cannot issue PO: Order is in "${po.status}" status, must be approved first (SOP §8.5).`,
      };
    }

    const { error: upErr } = await db
      .from('purchase_orders')
      .update({
        status: 'issued',
        issued_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', po.id);

    if (upErr) return { ok: false as const, error: upErr.message };

    return { ok: true as const, poId: po.id, status: 'issued', poNumber: po.po_number };
  });

export const amendPo = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: AmendPoInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { resolveApprover, normalizeCategory } = await import('@/lib/procurement/authorityMatrix');
    const { assertNoPoSplitting } = await import('@/server/procurement/guards');
    const { ProcurementRuleError } = await import('@/server/procurement/errors');

    const { data: po, error: poErr } = await db
      .from('purchase_orders')
      .select(`
        *,
        purchase_requisitions (id, category, department_id, estimated_value)
      `)
      .eq('id', data.po_id)
      .single();

    if (poErr || !po) return { ok: false as const, error: 'Purchase Order not found' };

    const oldTotal = Number(po.price || 0) + Number(po.taxes || 0);
    const newPrice = Number(data.new_price) || 0;
    const newTaxes = Number(data.new_taxes) || 0;
    const newTotal = newPrice + newTaxes;

    // Guard: Check PO splitting on delta
    const delta = newTotal - oldTotal;
    if (delta > 0) {
      try {
        await assertNoPoSplitting(db, po.pr_id, delta, po.vendor_id);
      } catch (e) {
        if (e instanceof ProcurementRuleError) return { ok: false as const, error: e.message, code: e.code };
        throw e;
      }
    }

    // Check authority matrix tier escalation
    const canonicalCat = normalizeCategory(po.purchase_requisitions?.category ?? 'routine_consumable');
    const { data: rules } = await db
      .from('approval_matrix_rules')
      .select('*')
      .eq('active', true);

    let spend = 0;
    if (po.purchase_requisitions?.department_id) {
      const { data: rows } = await db
        .from('department_monthly_spend')
        .select('total_spent')
        .eq('department_id', po.purchase_requisitions.department_id)
        .eq('month', monthKey())
        .eq('category', canonicalCat);
      spend = (rows ?? []).reduce((s: number, r: any) => s + Number(r.total_spent ?? 0), 0);
    }

    const resolvedNew = resolveApprover(canonicalCat, newTotal, spend, rules ?? []);
    const resolvedOld = resolveApprover(canonicalCat, oldTotal, spend, rules ?? []);

    // Check if new total exceeds original approver's tier
    const roleHierarchy = ['hod', 'principal', 'procurement_officer', 'purchase_committee', 'director_admin_finance', 'evp'];
    const originalRole = po.original_approver_role || resolvedOld.role;
    const originalRank = roleHierarchy.indexOf(originalRole.toLowerCase());
    const newRank = roleHierarchy.indexOf(resolvedNew.role.toLowerCase());

    const requiresReapproval = newRank > originalRank || (resolvedNew.escalate && !resolvedOld.escalate) || newTotal > oldTotal * 1.1;

    // Record Amendment
    const { data: amendment, error: amErr } = await db
      .from('po_amendments')
      .insert({
        po_id: po.id,
        old_value_total: oldTotal,
        new_value_total: newTotal,
        reason: data.reason,
        requires_reapproval: requiresReapproval,
        original_approver_role: originalRole,
        new_approver_role: resolvedNew.role,
        status: requiresReapproval ? 'pending' : 'approved',
        changed_fields_json: data.changed_fields ?? {},
        created_by: context.userId,
      })
      .select('*')
      .single();

    if (amErr) return { ok: false as const, error: amErr.message, code: 'amendment_insert_failed' };

    // Update PO
    const nextStatus = requiresReapproval ? 'pending_approval' : 'amended';
    const { error: upErr } = await db
      .from('purchase_orders')
      .update({
        price: newPrice,
        taxes: newTaxes,
        status: nextStatus,
        current_approver_role: requiresReapproval ? resolvedNew.role : po.current_approver_role,
        routing_reason: resolvedNew.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', po.id);

    if (upErr) return { ok: false as const, error: upErr.message };

    return {
      ok: true as const,
      amendmentId: amendment.id,
      requiresReapproval,
      newApproverRole: resolvedNew.role,
      status: nextStatus,
    };
  });

export const closePo = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: ClosePoInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const nextStatus = data.partially ? 'partially_closed' : 'closed';

    const { error } = await db
      .from('purchase_orders')
      .update({
        status: nextStatus,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.po_id);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, status: nextStatus };
  });

export const listPurchaseOrders = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input?: { pr_id?: string; vendor_id?: string; status?: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    let query = db
      .from('purchase_orders')
      .select(`
        *,
        purchase_requisitions (
          id, pr_number, category, scope, estimated_value, justification,
          departments (id, name)
        ),
        comparative_statements (
          id, cs_number, status, recommended_total, is_lowest_price
        ),
        vendors (
          id, name, gst_number, pan_number, status
        ),
        rate_contracts (
          id, contract_number, title, valid_from, valid_to
        ),
        po_amendments (
          id, old_value_total, new_value_total, reason, requires_reapproval, new_approver_role, status, created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (data?.pr_id) query = query.eq('pr_id', data.pr_id);
    if (data?.vendor_id) query = query.eq('vendor_id', data.vendor_id);
    if (data?.status) query = query.eq('status', data.status);

    const { data: list, error } = await query;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, purchaseOrders: list ?? [] };
  });
