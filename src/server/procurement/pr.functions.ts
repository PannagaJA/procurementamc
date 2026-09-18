/**
 * Purchase Requisition server functions (SOP §8.3).
 *
 * Every write goes through here. The caller's roles are re-derived from the
 * verified session server-side; the client-sent role is never trusted.
 * The pure rule engine lives in src/server/procurement/* and is dynamically
 * imported inside the handlers so it never enters the client bundle.
 */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type CreatePrInput = {
  department_id: string | null;
  category: string;
  scope: 'academic' | 'operational';
  budget_head: string | null;
  estimated_value: number;
  is_recurring: boolean;
  recurring_frequency: string | null;
  is_emergency: boolean;
  justification: string;
  market_survey_notes: string | null;
  line_items: {
    description: string;
    unit: string | null;
    qty_required: number;
    qty_in_stock: number;
    est_unit_price: number;
  }[];
};

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Load matrix rules + month-to-date spend and resolve the approver. */
async function resolve(db: any, category: string, departmentId: string | null, value: number) {
  const { resolveApprover, normalizeCategory } = await import('@/server/procurement/authorityMatrix');
  const canonicalCat = normalizeCategory(category);
  const { data: rules } = await db
    .from('approval_matrix_rules')
    .select('*')
    .eq('active', true);

  let spend = 0;
  if (departmentId) {
    const { data: rows } = await db
      .from('department_monthly_spend')
      .select('total_spent')
      .eq('department_id', departmentId)
      .eq('month', monthKey())
      .eq('category', canonicalCat);
    spend = (rows ?? []).reduce((s: number, r: any) => s + Number(r.total_spent ?? 0), 0);
  }
  return resolveApprover(category, value, spend, (rules ?? []) as any);
}

export const createPr = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: CreatePrInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import('@/server/procurement/roles');
    const { normalizeCategory } = await import('@/server/procurement/authorityMatrix');
    const { ProcurementRuleError } = await import('@/server/procurement/errors');
    const roles = await getCallerRoles(db, context.userId);

    const value = Number(data.estimated_value) || 0;
    const canonicalCat = normalizeCategory(data.category);

    if (data.is_emergency) {
      const { assertEmergencyCapNotExceeded } = await import('@/server/procurement/guards');
      try {
        await assertEmergencyCapNotExceeded(db, value);
      } catch (e) {
        if (e instanceof ProcurementRuleError) return { ok: false as const, error: e.message, code: e.code };
        throw e;
      }
    }

    const resolved = await resolve(db, canonicalCat, data.department_id, value);

    const { data: pr, error } = await db
      .from('purchase_requisitions')
      .insert({
        department_id: data.department_id,
        requested_by: context.userId,
        category: canonicalCat,
        scope: data.scope,
        status: 'submitted',
        budget_head: data.budget_head,
        estimated_value: value,
        is_recurring: data.is_recurring,
        recurring_frequency: data.recurring_frequency,
        is_emergency: data.is_emergency,
        justification: data.justification,
        market_survey_notes: data.market_survey_notes,
        source: 'app',
        current_approver_role: resolved.role,
        routing_reason: resolved.reason,
      })
      .select('id, pr_number, status')
      .single();

    if (error) return { ok: false as const, error: error.message, code: 'insert_failed' };

    const items = (data.line_items ?? []).filter((i) => i.description?.trim());
    if (items.length) {
      const { error: liErr } = await db.from('pr_line_items').insert(
        items.map((i) => ({
          pr_id: pr.id,
          description: i.description,
          unit: i.unit,
          qty_required: i.qty_required,
          qty_in_stock: i.qty_in_stock,
          net_qty_to_procure: Math.max(0, Number(i.qty_required) - Number(i.qty_in_stock)),
          est_unit_price: i.est_unit_price,
          est_total: Math.max(0, Number(i.qty_required) - Number(i.qty_in_stock)) * Number(i.est_unit_price),
        })),
      );
      if (liErr) return { ok: false as const, error: liErr.message, code: 'line_items_failed' };
    }

    await db.from('pr_approvals').insert({
      pr_id: pr.id,
      stage: 'submitted',
      approver_role: resolved.role,
      approver_id: context.userId,
      decision: 'routed',
      remarks: resolved.reason,
    });

    return {
      ok: true as const,
      pr,
      routing: {
        role: resolved.role,
        escalate: resolved.escalate,
        reason: resolved.reason,
        minQuotations: resolved.minQuotations,
        requiresRateContract: resolved.requiresRateContract,
      },
      callerRoles: roles.map((r) => r.role),
    };
  });

/** Preview routing without writing anything — used by the PR form. */
export const previewRouting = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: { category: string; department_id: string | null; estimated_value: number }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const r = await resolve(db, data.category, data.department_id, Number(data.estimated_value) || 0);
    return { role: r.role, escalate: r.escalate, reason: r.reason, minQuotations: r.minQuotations, requiresRateContract: r.requiresRateContract };
  });

type DecisionInput = { pr_id: string; remarks?: string | null };

async function decide(
  context: any,
  data: DecisionInput,
  stage: string,
  decision: 'reviewed' | 'approved' | 'rejected' | 'escalated',
  nextStatus: string,
) {
  const db = context.supabase as any;
  const { getCallerRoles } = await import('@/server/procurement/roles');
  const { ForbiddenError } = await import('@/server/procurement/errors');
  const roles = await getCallerRoles(db, context.userId);
  const held = roles.map((r) => r.role);

  const { data: pr, error } = await db
    .from('purchase_requisitions')
    .select('id, pr_number, status, category, estimated_value, department_id, current_approver_role')
    .eq('id', data.pr_id)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!pr) return { ok: false as const, error: 'That purchase requisition does not exist.' };

  // Re-derive the authorised role from the matrix — never trust the stored value alone.
  const resolved = await resolve(db, pr.category, pr.department_id, Number(pr.estimated_value) || 0);

  const allowed =
    decision === 'escalated'
      ? [resolved.role, 'director_admin_finance', 'purchase_committee']
      : [resolved.role];

  try {
    if (!held.includes('admin') && !allowed.some((a) => held.includes(a))) {
      throw new ForbiddenError(
        `This requisition routes to "${resolved.role}". You hold: ${held.join(', ') || 'no procurement role'}.`,
      );
    }
  } catch (e: any) {
    return { ok: false as const, error: e.message };
  }

  const { error: upErr } = await db
    .from('purchase_requisitions')
    .update({
      status: nextStatus,
      current_approver_role: decision === 'escalated' ? 'evp' : pr.current_approver_role,
    })
    .eq('id', pr.id);
  if (upErr) return { ok: false as const, error: upErr.message };

  await db.from('pr_approvals').insert({
    pr_id: pr.id,
    stage,
    approver_role: held.find((h) => allowed.includes(h)) ?? 'admin',
    approver_id: context.userId,
    decision,
    remarks: data.remarks ?? null,
  });

  return { ok: true as const, status: nextStatus, reason: resolved.reason };
}

export const reviewPr = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: DecisionInput) => input)
  .handler(({ data, context }) => decide(context, data, 'director_pc_review', 'reviewed', 'under_review'));

export const approvePr = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: DecisionInput) => input)
  .handler(({ data, context }) => decide(context, data, 'authority_approval', 'approved', 'approved'));

export const rejectPr = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: DecisionInput) => input)
  .handler(({ data, context }) => decide(context, data, 'authority_approval', 'rejected', 'rejected'));

export const escalateToEvp = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: DecisionInput) => input)
  .handler(({ data, context }) => decide(context, data, 'evp_escalation', 'escalated', 'escalated_to_evp'));
