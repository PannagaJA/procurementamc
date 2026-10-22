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
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CreatePoInput = {
  pr_id: string;
  cs_id?: string | null;
  rate_contract_id?: string | null;
  type: "regular" | "rate_contract" | "direct_purchase";
  vendor_id: string;
  scope_of_supply: string;
  price: number;
  taxes: number;
  delivery_timeline?: string | null;
  payment_terms?: string | null;
  /** Direct purchase: officer confirms the items aren't available in Central Stores (SOP §8.4). */
  stores_confirmed?: boolean;
  /** Direct purchase: optional note of any quotes obtained (quotes aren't required). */
  quotes_note?: string | null;
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Why the caller may not approve/reject this PO, or null if they may. */
function poDecisionError(
  po: {
    status: string;
    current_approver_role: string | null;
    created_by: string | null;
    department_id: string | null;
    po_number: string | null;
  },
  roles: { role: string; department_id: string | null }[],
  userId: string,
): string | null {
  const held = roles.map((r) => r.role);
  if (po.status !== "pending_approval")
    return `${po.po_number} is "${po.status}", not awaiting approval.`;
  if (po.created_by && po.created_by === userId)
    return "You created this purchase order, so another approver must decide it.";
  const required = po.current_approver_role;
  if (held.includes("admin") || !required) return null;
  if (!held.includes(required))
    return `This purchase order is waiting for the ${required.replace(/_/g, " ").toUpperCase()}.`;
  if (
    required === "hod" &&
    !roles.some((r) => r.role === "hod" && r.department_id === po.department_id)
  ) {
    return "This purchase order belongs to another department.";
  }
  return null;
}

export const createPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreatePoInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    if (!held.includes("admin") && !held.includes("procurement_officer")) {
      return {
        ok: false as const,
        error: "Only Procurement Officers can create Purchase Orders.",
        code: "unauthorized",
      };
    }

    const { assertPrApproved, assertVendorEmpanelled, assertNoPoSplitting } =
      await import("@/server/procurement/guards");
    const { ProcurementRuleError } = await import("@/server/procurement/errors");
    const { resolveApprover, normalizeCategory } =
      await import("@/lib/procurement/authorityMatrix");

    // 1. Guard: Requisition must be approved
    try {
      await assertPrApproved(db, data.pr_id);
    } catch (e) {
      if (e instanceof ProcurementRuleError)
        return { ok: false as const, error: e.message, code: e.code };
      throw e;
    }

    // 2. Guard: Must have approved CS OR active Rate Contract
    if (data.type === "regular") {
      if (!data.cs_id) {
        return {
          ok: false as const,
          error: "Select an approved Comparative Statement for this purchase order.",
          code: "cs_required",
        };
      }
      const { data: cs, error: csErr } = await db
        .from("comparative_statements")
        .select("id, status, recommended_vendor_id, recommended_total, pr_id, cs_number")
        .eq("id", data.cs_id)
        .single();

      if (csErr || !cs)
        return {
          ok: false as const,
          error: "Comparative Statement not found",
          code: "cs_not_found",
        };
      if (cs.status !== "approved") {
        return {
          ok: false as const,
          error: `This Comparative Statement is "${cs.status}". It must be approved before a purchase order can be created.`,
          code: "cs_not_approved",
        };
      }
      if (cs.pr_id && cs.pr_id !== data.pr_id) {
        return {
          ok: false as const,
          error: `${cs.cs_number} belongs to a different requisition.`,
          code: "cs_pr_mismatch",
        };
      }
      if (cs.recommended_vendor_id && cs.recommended_vendor_id !== data.vendor_id) {
        return {
          ok: false as const,
          error: `The purchase order must go to the vendor awarded in ${cs.cs_number}.`,
          code: "cs_vendor_mismatch",
        };
      }
      const poTotal = (Number(data.price) || 0) + (Number(data.taxes) || 0);
      if (cs.recommended_total && poTotal > Number(cs.recommended_total) + 1) {
        return {
          ok: false as const,
          error: `The order total (Rs. ${poTotal.toLocaleString("en-IN")}) is more than the approved quote in ${cs.cs_number} (Rs. ${Number(cs.recommended_total).toLocaleString("en-IN")}).`,
          code: "cs_total_exceeded",
        };
      }
      const { data: existingPo } = await db
        .from("purchase_orders")
        .select("po_number")
        .eq("cs_id", data.cs_id)
        .neq("status", "cancelled")
        .limit(1)
        .maybeSingle();
      if (existingPo) {
        return {
          ok: false as const,
          error: `${cs.cs_number} already has purchase order ${existingPo.po_number}.`,
          code: "cs_already_ordered",
        };
      }
    } else if (data.type === "rate_contract") {
      if (!data.rate_contract_id) {
        return {
          ok: false as const,
          error: "Select a rate contract for this purchase order.",
          code: "rc_required",
        };
      }
      const today = new Date().toISOString().split("T")[0];
      const { data: rc, error: rcErr } = await db
        .from("rate_contracts")
        .select("id, vendor_id, valid_from, valid_to")
        .eq("id", data.rate_contract_id)
        .single();

      if (rcErr || !rc)
        return { ok: false as const, error: "Rate contract not found", code: "rc_not_found" };
      if (rc.valid_from > today || rc.valid_to < today) {
        return {
          ok: false as const,
          error: `Rate contract is not active (valid: ${rc.valid_from} to ${rc.valid_to}).`,
          code: "rc_expired",
        };
      }
    } else if (data.type === "direct_purchase") {
      // Small-value direct purchase: no CS or quotes; the PR approval is the authority.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { directPurchaseChecks, directPurchaseApprovalFields } =
        await import("@/server/procurement/directPurchase");
      const price = Number(data.price) || 0;
      const taxes = Number(data.taxes) || 0;
      const check = await directPurchaseChecks(db, supabaseAdmin as any, {
        prId: data.pr_id,
        vendorId: data.vendor_id,
        total: price + taxes,
        storesConfirmed: data.stores_confirmed === true,
      });
      if (!check.ok) return check;
      // Quotes already requested: the order comes from awarding that RFQ, not a parallel PO.
      const { data: openRfq } = await supabaseAdmin
        .from("rfqs")
        .select("rfq_number")
        .eq("pr_id", data.pr_id)
        .in("status", ["draft", "sent"])
        .limit(1)
        .maybeSingle();
      if (openRfq) {
        return {
          ok: false as const,
          error: `Quotes for ${check.pr.pr_number} were requested on ${openRfq.rfq_number}. Award the order from the RFQ page.`,
          code: "quotes_pending",
        };
      }
      const scope = [
        data.scope_of_supply?.trim() || `Direct purchase against ${check.pr.pr_number}`,
        "Checked: not available in Central Stores.",
        data.quotes_note?.trim() ? `Quotes: ${data.quotes_note.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const { data: po, error: poErr } = await supabaseAdmin
        .from("purchase_orders")
        .insert({
          pr_id: check.pr.id,
          cs_id: null,
          vendor_id: data.vendor_id,
          department_id: check.pr.department_id,
          type: "regular", // DB allows regular | rate_contract; direct purchase is a regular PO
          scope_of_supply: scope,
          price,
          taxes,
          delivery_timeline: data.delivery_timeline ?? null,
          payment_terms: data.payment_terms ?? null,
          created_by: context.userId,
          ...directPurchaseApprovalFields(check),
        })
        .select("*")
        .single();
      if (poErr) return { ok: false as const, error: poErr.message, code: "insert_po_failed" };
      return {
        ok: true as const,
        po,
        routing: {
          role: po.current_approver_role,
          escalate: !!check.escalation,
          reason: po.routing_reason,
        },
      };
    }

    // 3. Guard: Vendor must be empanelled & active
    try {
      await assertVendorEmpanelled(db, data.vendor_id);
    } catch (e) {
      if (e instanceof ProcurementRuleError)
        return { ok: false as const, error: e.message, code: e.code };
      throw e;
    }

    // 4. Guard: PO-splitting guard (cumulative PR value + 30-day window aggregation)
    const price = Number(data.price) || 0;
    const taxes = Number(data.taxes) || 0;
    const totalValue = price + taxes;

    let escalationInfo: any = null;
    try {
      escalationInfo = await assertNoPoSplitting(
        db,
        data.pr_id,
        totalValue,
        data.vendor_id,
        undefined,
        data.cs_id ?? undefined,
      );
    } catch (e) {
      if (e instanceof ProcurementRuleError)
        return { ok: false as const, error: e.message, code: e.code };
      throw e;
    }

    // 5. Authority Matrix routing for PO approval
    const { data: pr } = await db
      .from("purchase_requisitions")
      .select("id, category, department_id, pr_number")
      .eq("id", data.pr_id)
      .single();

    const canonicalCat = normalizeCategory(pr?.category ?? "routine_consumable");
    const { data: rules } = await db.from("approval_matrix_rules").select("*").eq("active", true);

    let spend = 0;
    if (pr?.department_id) {
      const { data: rows } = await db
        .from("department_monthly_spend")
        .select("total_spent")
        .eq("department_id", pr.department_id)
        .eq("month", monthKey())
        .eq("category", canonicalCat);
      spend = (rows ?? []).reduce((s: number, r: any) => s + Number(r.total_spent ?? 0), 0);
    }

    const standardResolved = resolveApprover(canonicalCat, totalValue, spend, rules ?? []);
    const resolvedRole = escalationInfo?.escalateRole || standardResolved.role;
    const resolvedReason = escalationInfo?.reason || standardResolved.reason;
    const isEscalated = Boolean(escalationInfo || standardResolved.escalate);

    // In database schema check constraint (purchase_orders_type_check): type IN ('regular', 'rate_contract').
    // Map 'direct_purchase' to 'regular' so it never violates the database check constraint, while preserving direct purchase semantics.
    const dbType = data.type === "rate_contract" ? "rate_contract" : "regular";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: po, error: poErr } = await supabaseAdmin
      .from("purchase_orders")
      .insert({
        pr_id: data.pr_id,
        cs_id: data.cs_id ?? null,
        rate_contract_id: data.rate_contract_id ?? null,
        vendor_id: data.vendor_id,
        department_id: pr?.department_id ?? null,
        type: dbType,
        scope_of_supply: data.scope_of_supply,
        price,
        taxes,
        delivery_timeline: data.delivery_timeline ?? null,
        payment_terms: data.payment_terms ?? null,
        status: "pending_approval",
        original_approver_role: resolvedRole,
        current_approver_role: resolvedRole,
        routing_reason: resolvedReason,
        created_by: context.userId,
      })
      .select("*")
      .single();

    if (poErr) return { ok: false as const, error: poErr.message, code: "insert_po_failed" };

    // Notify PO approver via SMTP in background
    import("@/server/email/notificationDispatcher")
      .then(({ notifyApproversForPo }) =>
        notifyApproversForPo({
          poNumber: po.po_number || "PO",
          role: resolvedRole,
          totalValue,
        }),
      )
      .catch((e) => console.warn("[Email] PO approver dispatch failed:", e));

    return {
      ok: true as const,
      po,
      routing: {
        role: resolvedRole,
        escalate: isEscalated,
        reason: resolvedReason,
      },
    };
  });

export const approvePo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ApprovePoInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const { ForbiddenError } = await import("@/server/procurement/errors");

    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: po, error } = await supabaseAdmin
      .from("purchase_orders")
      .select("id, status, current_approver_role, po_number, created_by, department_id")
      .eq("id", data.po_id)
      .maybeSingle();

    if (error || !po) return { ok: false as const, error: "Purchase Order not found" };

    const authError = poDecisionError(po, roles, context.userId);
    if (authError) return { ok: false as const, error: authError };

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("purchase_orders")
      .update({
        status: "approved",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", po.id)
      .select("id, status")
      .single();

    if (upErr) return { ok: false as const, error: upErr.message };

    if (!updated || updated.status !== "approved") {
      return {
        ok: false as const,
        error: `Update did not persist. DB status is still "${updated?.status || "unknown"}".`,
      };
    }

    // Approving a re-routed amendment closes that amendment too.
    await supabaseAdmin
      .from("po_amendments")
      .update({
        status: "approved",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
      })
      .eq("po_id", po.id)
      .eq("status", "pending");

    return { ok: true as const, poId: po.id, status: "approved" };
  });

/**
 * Reject a PO awaiting approval. A new order is cancelled; a re-routed amendment is
 * rejected and the order goes back to its previous value and status.
 */
export const rejectPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { po_id: string; remarks: string }) => input)
  .handler(async ({ data, context }) => {
    if (!data.remarks?.trim())
      return { ok: false as const, error: "Enter a reason for rejecting this purchase order." };
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: po } = await supabaseAdmin
      .from("purchase_orders")
      .select(
        "id, status, current_approver_role, po_number, created_by, department_id, taxes, issued_at",
      )
      .eq("id", data.po_id)
      .maybeSingle();
    if (!po) return { ok: false as const, error: "Purchase Order not found" };
    const authError = poDecisionError(po, roles, context.userId);
    if (authError) return { ok: false as const, error: authError };

    const now = new Date().toISOString();
    const { data: amendment } = await supabaseAdmin
      .from("po_amendments")
      .select("id, old_value_total, changed_fields_json, original_approver_role")
      .eq("po_id", po.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (amendment) {
      const prev = (amendment.changed_fields_json as any)?.previous ?? {};
      const oldTaxes = prev.taxes ?? Number(po.taxes || 0);
      await supabaseAdmin
        .from("po_amendments")
        .update({ status: "rejected", approved_by: context.userId, approved_at: now })
        .eq("id", amendment.id);
      const { error } = await supabaseAdmin
        .from("purchase_orders")
        .update({
          price: prev.price ?? Number(amendment.old_value_total) - oldTaxes,
          taxes: oldTaxes,
          status: prev.status ?? (po.issued_at ? "issued" : "approved"),
          current_approver_role: amendment.original_approver_role ?? po.current_approver_role,
          routing_reason: `Amendment rejected: ${data.remarks.trim()}`,
          updated_at: now,
        })
        .eq("id", po.id);
      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const, status: "amendment_rejected" };
    }

    const { error } = await supabaseAdmin
      .from("purchase_orders")
      .update({
        status: "cancelled",
        routing_reason: `Rejected: ${data.remarks.trim()}`,
        updated_at: now,
      })
      .eq("id", po.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, status: "cancelled" };
  });

export const issuePo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: IssuePoInput) => input)
  .handler(async ({ data, context }) => {
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const held = (await getCallerRoles(context.supabase as any, context.userId)).map((r) => r.role);
    if (!["admin", "procurement_officer", "procurement_executive"].some((r) => held.includes(r))) {
      return { ok: false as const, error: "Only the procurement team can issue purchase orders." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: po, error } = await supabaseAdmin
      .from("purchase_orders")
      .select("id, status, po_number, vendor_id, pr_id, department_id, total_value, price, taxes, purchase_requisitions(budget_head)")
      .eq("id", data.po_id)
      .maybeSingle();

    if (error || !po) return { ok: false as const, error: "Purchase Order not found" };

    if (po.status !== "approved" && po.status !== "amended") {
      return {
        ok: false as const,
        error: `This purchase order is "${po.status}". It must be approved before it can be issued.`,
      };
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("purchase_orders")
      .update({
        status: "issued",
        issued_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", po.id)
      .select("id, status")
      .single();

    if (upErr) return { ok: false as const, error: upErr.message };
    if (!updated || updated.status !== "issued") {
      return {
        ok: false as const,
        error: `Update did not persist. DB status is still "${updated?.status}".`,
      };
    }

    // SOP §8.1 C6: Live table deducting committed amounts dynamically upon PO generation
    try {
      const budgetHeadCode = (po as any).purchase_requisitions?.budget_head;
      if (budgetHeadCode) {
        const { recordBudgetSpendDeduction } = await import("@/lib/procurement/budget.functions");
        const val = Number((po as any).total_value || (Number((po as any).price || 0) + Number((po as any).taxes || 0)));
        recordBudgetSpendDeduction({
          budgetHeadCode,
          departmentId: (po as any).department_id,
          amount: val,
          type: "commit",
          poId: po.id,
          poNumber: po.po_number,
          prId: po.pr_id,
          description: `Order issued: ${po.po_number} (₹${val.toLocaleString("en-IN")})`,
        });
      }
    } catch {
      // non-blocking
    }

    return { ok: true as const, poId: po.id, status: "issued", poNumber: po.po_number };
  });

export const amendPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: AmendPoInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveApprover, normalizeCategory } =
      await import("@/lib/procurement/authorityMatrix");
    const { assertNoPoSplitting } = await import("@/server/procurement/guards");
    const { ProcurementRuleError } = await import("@/server/procurement/errors");

    const { data: po, error: poErr } = await supabaseAdmin
      .from("purchase_orders")
      .select(
        `
        *,
        purchase_requisitions (id, category, department_id, estimated_value)
      `,
      )
      .eq("id", data.po_id)
      .single();

    if (poErr || !po) return { ok: false as const, error: "Purchase Order not found" };

    const { getCallerRoles } = await import("@/server/procurement/roles");
    const amendHeld = (await getCallerRoles(db, context.userId)).map((r) => r.role);
    if (!["admin", "procurement_officer"].some((r) => amendHeld.includes(r))) {
      return {
        ok: false as const,
        error: "Only the procurement officer can amend purchase orders.",
      };
    }
    if (!["approved", "issued", "amended"].includes(po.status)) {
      return {
        ok: false as const,
        error: `${po.po_number} is "${po.status}" and can't be amended.`,
      };
    }
    if (!data.reason?.trim())
      return { ok: false as const, error: "Enter the reason for this amendment." };

    const oldTotal = Number(po.price || 0) + Number(po.taxes || 0);
    const newPrice = Number(data.new_price) || 0;
    const newTaxes = Number(data.new_taxes) || 0;
    const newTotal = newPrice + newTaxes;

    // Never reduce an order below what has already been received or billed.
    const [{ data: grns }, { data: invs }] = await Promise.all([
      supabaseAdmin.from("grns").select("accepted_value, status").eq("po_id", po.id),
      supabaseAdmin.from("invoices").select("invoice_amount, approved_amount, match_status").eq("po_id", po.id),
    ]);
    const received = (grns ?? [])
      .filter((g: any) => g.status === "accepted" || g.status === "partially_accepted")
      .reduce((sum: number, g: any) => sum + Number(g.accepted_value || 0), 0);
    const billed = (invs ?? [])
      .filter((i: any) => ["matched", "approved", "paid"].includes(i.match_status))
      .reduce((sum: number, i: any) => sum + Number(i.approved_amount ?? i.invoice_amount ?? 0), 0);
    const floor = Math.max(received, billed);
    if (newTotal + 1 < floor) {
      return {
        ok: false as const,
        error: `The new total (Rs. ${newTotal.toLocaleString("en-IN")}) is below what has already been received or billed (Rs. ${floor.toLocaleString("en-IN")}).`,
      };
    }

    // Guard: Check PO splitting on delta
    const delta = newTotal - oldTotal;
    if (delta > 0) {
      try {
        await assertNoPoSplitting(db, po.pr_id, delta, po.vendor_id);
      } catch (e) {
        if (e instanceof ProcurementRuleError)
          return { ok: false as const, error: e.message, code: e.code };
        throw e;
      }
    }

    // Check authority matrix tier escalation
    const canonicalCat = normalizeCategory(
      po.purchase_requisitions?.category ?? "routine_consumable",
    );
    const { data: rules } = await db.from("approval_matrix_rules").select("*").eq("active", true);

    let spend = 0;
    if (po.purchase_requisitions?.department_id) {
      const { data: rows } = await db
        .from("department_monthly_spend")
        .select("total_spent")
        .eq("department_id", po.purchase_requisitions.department_id)
        .eq("month", monthKey())
        .eq("category", canonicalCat);
      spend = (rows ?? []).reduce((s: number, r: any) => s + Number(r.total_spent ?? 0), 0);
    }

    const resolvedNew = resolveApprover(canonicalCat, newTotal, spend, rules ?? []);
    const resolvedOld = resolveApprover(canonicalCat, oldTotal, spend, rules ?? []);

    // Check if new total exceeds original approver's tier
    const roleHierarchy = [
      "hod",
      "principal",
      "procurement_officer",
      "purchase_committee",
      "director_admin_finance",
      "evp",
    ];
    const originalRole = po.original_approver_role || resolvedOld.role;
    const originalRank = roleHierarchy.indexOf(originalRole.toLowerCase());
    const newRank = roleHierarchy.indexOf(resolvedNew.role.toLowerCase());

    // Re-approval goes to whichever is higher: the original approver or the new value's approver.
    const reapprovalRole = newRank >= originalRank ? resolvedNew.role : originalRole;

    const requiresReapproval =
      newRank > originalRank ||
      (resolvedNew.escalate && !resolvedOld.escalate) ||
      newTotal > oldTotal * 1.1;

    // Record Amendment
    const { data: amendment, error: amErr } = await supabaseAdmin
      .from("po_amendments")
      .insert({
        po_id: po.id,
        old_value_total: oldTotal,
        new_value_total: newTotal,
        reason: data.reason,
        requires_reapproval: requiresReapproval,
        original_approver_role: originalRole,
        new_approver_role: reapprovalRole,
        status: requiresReapproval ? "pending" : "approved",
        changed_fields_json: {
          ...(data.changed_fields ?? {}),
          previous: {
            price: Number(po.price || 0),
            taxes: Number(po.taxes || 0),
            status: po.status,
          },
        },
        created_by: context.userId,
      })
      .select("*")
      .single();

    if (amErr) return { ok: false as const, error: amErr.message, code: "amendment_insert_failed" };

    // Update PO
    // A change that needs no re-approval keeps the order live in its current state (legacy
    // "amended" rows resolve to issued/approved) so GRNs and invoices can continue against it.
    const liveStatus = po.status === "amended" ? (po.issued_at ? "issued" : "approved") : po.status;
    const nextStatus = requiresReapproval ? "pending_approval" : liveStatus;
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("purchase_orders")
      .update({
        price: newPrice,
        taxes: newTaxes,
        status: nextStatus,
        current_approver_role: requiresReapproval ? reapprovalRole : po.current_approver_role,
        routing_reason: resolvedNew.reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", po.id)
      .select("id, status")
      .single();

    if (upErr) return { ok: false as const, error: upErr.message };

    return {
      ok: true as const,
      amendmentId: amendment.id,
      requiresReapproval,
      newApproverRole: resolvedNew.role,
      status: nextStatus,
    };
  });

export const closePo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ClosePoInput) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nextStatus = data.partially ? "partially_closed" : "closed";

    const { error } = await supabaseAdmin
      .from("purchase_orders")
      .update({
        status: nextStatus,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.po_id);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, status: nextStatus };
  });

export const listPurchaseOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { pr_id?: string; vendor_id?: string; status?: string }) => input)
  .handler(async ({ data, context }) => {
    let db = context.supabase as any;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (supabaseAdmin) db = supabaseAdmin;
    } catch {
      // fallback to session db
    }

    let query = db
      .from("purchase_orders")
      .select(
        `
        *,
        purchase_requisitions (
          id, pr_number, category, scope, estimated_value, justification, requested_by, department_id,
          departments (id, name),
          pr_line_items (id, description, net_qty_to_procure, qty_required, est_unit_price, est_total, unit)
        ),
        comparative_statements (
          id, cs_number, status, recommended_total, is_lowest_price, rfq_id
        ),
        vendors (
          id, name, gst_number, pan_number, registered_address, bank_details_json, status
        ),
        rate_contracts (
          id, contract_number, title, approved_rates_json, valid_from, valid_to
        ),
        po_amendments (
          id, old_value_total, new_value_total, reason, requires_reapproval, original_approver_role, new_approver_role, status, created_at
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (data?.pr_id) query = query.eq("pr_id", data.pr_id);
    if (data?.vendor_id) query = query.eq("vendor_id", data.vendor_id);
    if (data?.status) query = query.eq("status", data.status);

    const { data: allOrders, error } = await query;
    if (error) return { ok: false as const, error: error.message };

    // This reads with the service role, so scope visibility here: procurement, finance, stores and
    // executive roles see every PO; an HOD sees their department's; anyone else only POs for PRs they raised.
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const callerRoles = await getCallerRoles(context.supabase as any, context.userId);
    const held = callerRoles.map((r) => r.role);
    const SEE_ALL = [
      "admin",
      "evp",
      "director_admin_finance",
      "purchase_committee",
      "principal",
      "procurement_officer",
      "procurement_executive",
      "finance",
      "stores",
    ];
    const hodDepts = new Set(
      callerRoles.filter((r) => r.role === "hod" && r.department_id).map((r) => r.department_id),
    );
    const list = held.some((r) => SEE_ALL.includes(r))
      ? (allOrders ?? [])
      : (allOrders ?? []).filter(
          (po: any) =>
            hodDepts.has(po.department_id ?? po.purchase_requisitions?.department_id) ||
            po.purchase_requisitions?.requested_by === context.userId,
        );

    // Attach the awarded vendor's quoted lines so the PO document shows real prices.
    const { quotedLinesByPo } = await import("@/server/procurement/quotes");
    const quoted = await quotedLinesByPo(db, list);
    const purchaseOrders = list.map((po: any) => ({
      ...po,
      quoted_lines: quoted.get(po.id) ?? [],
    }));
    return { ok: true as const, purchaseOrders };
  });
