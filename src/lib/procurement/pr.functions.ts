/**
 * Purchase Requisition server functions (SOP §8.3).
 *
 * Every write goes through here. The caller's roles are re-derived from the
 * verified session server-side; the client-sent role is never trusted.
 * The pure rule engine lives in src/server/procurement/* and is dynamically
 * imported inside the handlers so it never enters the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { roleLabel } from "@/lib/procurement/labels";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeCategory } from "@/lib/procurement/authorityMatrix";

export type CreatePrInput = {
  department_id: string | null;
  category: string;
  scope: "academic" | "operational";
  /** Legacy free-text head; the Section B head is chosen on the server from the category. */
  budget_head?: string | null;
  /** Required when the estimate is over the head's balance (the PR then needs the EVP). */
  budget_justification?: string | null;
  reappropriation_ref?: string | null;
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
    /** SOP item group (src/lib/procurement/itemGroups.ts). */
    item_group: string;
  }[];
};

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Nobody approves their own requisition: if the requester holds the routed role (an HOD for
 * their own department), route to the next authority up the chain instead.
 */
async function independentApprover(
  requesterId: string | null,
  departmentId: string | null,
  role: string,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { independentRole } = await import("@/server/procurement/separation");
  return independentRole(supabaseAdmin as any, { actorId: requesterId, departmentId, role });
}

/** Active rate contracts covering the given item groups (SOP §VII.5), keyed by group. */
async function rateContractCover(groups: string[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { rateContractCover: cover } = await import("@/server/procurement/directPurchase");
  return cover(supabaseAdmin as any, groups);
}

/** Read-only preview for the PR form: which of these groups must go through a rate contract. */
export const rateContractCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { groups: string[] }) => input)
  .handler(async ({ data }) => ({
    ok: true as const,
    cover: await rateContractCover(data.groups ?? []),
  }));

/** Load matrix rules + month-to-date spend and resolve the approver. */
async function resolve(db: any, category: string, departmentId: string | null, value: number) {
  const { resolveApprover, normalizeCategory, fetchMonthlySpendBreakdown } =
    await import("@/lib/procurement/authorityMatrix");
  const canonicalCat = normalizeCategory(category);
  const { data: rules } = await db.from("approval_matrix_rules").select("*").eq("active", true);

  const spendContext = await fetchMonthlySpendBreakdown(db, canonicalCat, departmentId);
  return resolveApprover(category, value, spendContext, (rules ?? []) as any);
}

export const createPr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreatePrInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const { normalizeCategory } = await import("@/lib/procurement/authorityMatrix");
    const { ProcurementRuleError } = await import("@/server/procurement/errors");
    const roles = await getCallerRoles(db, context.userId);

    const linesRaw = data.line_items ?? [];
    const computedTotal = linesRaw.reduce((sum, item) => {
      const net = Math.max(0, Number(item.qty_required || 0) - Number(item.qty_in_stock || 0));
      return sum + net * Number(item.est_unit_price || 0);
    }, 0);
    const value = computedTotal > 0 ? computedTotal : (Number(data.estimated_value) || 0);
    const canonicalCat = normalizeCategory(data.category);

    if (data.is_emergency) {
      const { assertEmergencyCapNotExceeded } = await import("@/server/procurement/guards");
      const { supabaseAdmin: capDb } = await import("@/integrations/supabase/client.server");
      try {
        // Service role: the shared counter must see every department's emergency PRs.
        await assertEmergencyCapNotExceeded(capDb as any, value);
      } catch (e) {
        if (e instanceof ProcurementRuleError)
          return { ok: false as const, error: e.message, code: e.code };
        throw e;
      }
    }

    if (data.is_recurring && (!data.recurring_frequency || !data.recurring_frequency.trim())) {
      return {
        ok: false as const,
        error: "Choose how often this requirement recurs, or turn off Recurring Requirement.",
        code: "recurring_frequency_required",
      };
    }

    // Every line needs an SOP item group; a group covered by an active rate contract must be
    // bought under that contract, never as a small-value direct purchase (SOP §VII.5).
    const { ITEM_GROUPS, itemGroupLabel } = await import("@/lib/procurement/itemGroups");
    const validGroups: string[] = ITEM_GROUPS.map((g) => g.id);
    const lines = data.line_items ?? [];
    const missing = lines.find((l) => !validGroups.includes(l.item_group));
    if (missing) {
      return {
        ok: false as const,
        error: `Choose an item group for "${missing.description || "each line"}".`,
        code: "item_group_required",
      };
    }
    if (canonicalCat === "small_value") {
      const cover = await rateContractCover(lines.map((l) => l.item_group));
      const [group, rc] = Object.entries(cover)[0] ?? [];
      if (group && rc) {
        return {
          ok: false as const,
          error: `${itemGroupLabel(group)} is covered by rate contract ${rc.contract_number} (valid to ${rc.valid_to}). Raise this as Routine Consumables (Rate Contract), not a small-value direct purchase.`,
          code: "rate_contract_applies",
        };
      }
    }

    const { supabaseAdmin: budgetDb } = await import("@/integrations/supabase/client.server");
    const { prBudgetCheck, budgetHeadForCategory } = await import("@/server/procurement/budget");
    // Section B: the department has one head per category, so the category decides it.
    // Emergency spend is kept out of department budgets (DECISIONS Q16): no head, status none.
    const budget = data.is_emergency
      ? ({ ok: true, status: "none", headId: null, balance: null } as const)
      : await prBudgetCheck(budgetDb, {
          headId: await budgetHeadForCategory(budgetDb, data.department_id, canonicalCat),
          departmentId: data.department_id,
          amount: value,
        });
    if (!budget.ok) return budget;
    if (
      budget.status === "over" &&
      !data.budget_justification?.trim() &&
      !data.reappropriation_ref?.trim()
    ) {
      return {
        ok: false as const,
        error: `This is more than the budget balance (Rs. ${Number(budget.balance).toLocaleString("en-IN")}). Give a justification or a re-appropriation reference; the EVP will then decide.`,
        code: "budget_justification_required",
      };
    }

    const resolved = await resolve(db, canonicalCat, data.department_id, value);
    const approverRole = await independentApprover(
      context.userId,
      data.department_id,
      resolved.role,
    );
    const routingReason =
      approverRole === resolved.role
        ? resolved.reason
        : `${resolved.reason} Routed to the ${roleLabel(approverRole)} because the requester holds the ${roleLabel(resolved.role)} role.`;

    const { data: pr, error } = await db
      .from("purchase_requisitions")
      .insert({
        department_id: data.department_id,
        requested_by: context.userId,
        category: canonicalCat,
        scope: data.scope,
        status: "submitted",
        budget_head: budget.status === "none" ? (data.budget_head ?? null) : (budget.code ?? null),
        budget_head_id: budget.headId,
        budget_status: budget.status,
        budget_justification: data.budget_justification?.trim() || null,
        reappropriation_ref: data.reappropriation_ref?.trim() || null,
        estimated_value: value,
        is_recurring: data.is_recurring,
        recurring_frequency: data.recurring_frequency,
        is_emergency: data.is_emergency,
        justification: data.justification,
        market_survey_notes: data.market_survey_notes,
        source: "app",
        current_approver_role: approverRole,
        routing_reason: routingReason,
      })
      .select("id, pr_number, status")
      .single();

    if (error) return { ok: false as const, error: error.message, code: "insert_failed" };

    const items = (data.line_items ?? []).filter((i) => i.description?.trim());
    if (items.length) {
      const { error: liErr } = await db.from("pr_line_items").insert(
        items.map((i) => ({
          pr_id: pr.id,
          description: i.description,
          unit: i.unit,
          qty_required: i.qty_required,
          qty_in_stock: i.qty_in_stock,
          net_qty_to_procure: Math.max(0, Number(i.qty_required) - Number(i.qty_in_stock)),
          est_unit_price: i.est_unit_price,
          item_group: i.item_group,
          est_total:
            Math.max(0, Number(i.qty_required) - Number(i.qty_in_stock)) * Number(i.est_unit_price),
        })),
      );
      if (liErr) return { ok: false as const, error: liErr.message, code: "line_items_failed" };
    }

    await db.from("pr_approvals").insert({
      pr_id: pr.id,
      stage: "submitted",
      approver_role: resolved.role,
      approver_id: context.userId,
      decision: "routed",
      remarks: resolved.reason,
    });

    // Notify approver via SMTP in background
    import("@/server/email/notificationDispatcher")
      .then(({ notifyApproversForPr }) =>
        notifyApproversForPr({
          prNumber: pr.pr_number,
          role: approverRole,
          estimatedValue: value,
          category: data.category,
          departmentId: data.department_id,
        }),
      )
      .catch((e) => console.warn("[Email] PR dispatch failed:", e));

    return {
      ok: true as const,
      pr,
      routing: {
        role: approverRole,
        escalate: resolved.escalate,
        reason: routingReason,
        budgetStatus: budget.status,
        minQuotations: resolved.minQuotations,
        requiresRateContract: resolved.requiresRateContract,
      },
      callerRoles: roles.map((r) => r.role),
    };
  });

/** Preview routing without writing anything — used by the PR form. */
export const previewRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { category: string; department_id: string | null; estimated_value: number }) => input,
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const r = await resolve(
      db,
      data.category,
      data.department_id,
      Number(data.estimated_value) || 0,
    );
    return {
      role: r.role,
      escalate: r.escalate,
      reason: r.reason,
      minQuotations: r.minQuotations,
      requiresRateContract: r.requiresRateContract,
    };
  });

type DecisionInput = { pr_id: string; remarks?: string | null };

async function decide(
  context: any,
  data: DecisionInput,
  stage: string,
  decision: "reviewed" | "approved" | "rejected" | "escalated",
  nextStatus: string,
) {
  const db = context.supabase as any;
  const { getCallerRoles } = await import("@/server/procurement/roles");
  const { ForbiddenError } = await import("@/server/procurement/errors");
  const roles = await getCallerRoles(db, context.userId);
  const held = roles.map((r) => r.role);

  const { data: pr, error } = await db
    .from("purchase_requisitions")
    .select(
      "id, pr_number, status, category, estimated_value, department_id, current_approver_role, requested_by, budget_head_id, budget_status",
    )
    .eq("id", data.pr_id)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!pr) return { ok: false as const, error: "That purchase requisition does not exist." };

  // Only open requisitions can be decided, and never by the person who raised them.
  if (!["submitted", "under_review", "escalated_to_evp"].includes(pr.status)) {
    return {
      ok: false as const,
      error: `${pr.pr_number} is already "${pr.status}" and can't be changed.`,
    };
  }
  if (pr.requested_by && pr.requested_by === context.userId) {
    return {
      ok: false as const,
      error: "You raised this requisition, so another approver must decide it.",
    };
  }
  if (decision === "escalated" && pr.status === "escalated_to_evp") {
    return { ok: false as const, error: `${pr.pr_number} is already with the EVP.` };
  }

  // Re-derive the authorised role from the matrix — never trust the stored value alone.
  const resolved = await resolve(
    db,
    pr.category,
    pr.department_id,
    Number(pr.estimated_value) || 0,
  );

  // Once escalated, only the EVP decides — not the original matrix approver.
  const routedRole =
    pr.status === "escalated_to_evp"
      ? "evp"
      : await independentApprover(pr.requested_by, pr.department_id, resolved.role);
  const isSmallValueShared =
    (routedRole === "principal" || routedRole === "procurement_officer") &&
    normalizeCategory(pr.category) === "small_value";
  const allowed =
    decision === "escalated"
      ? [routedRole, "director_admin_finance", "purchase_committee"]
      : isSmallValueShared
        ? ["principal", "procurement_officer"]
        : [routedRole];

  try {
    if (!held.includes("admin") && !allowed.some((a) => held.includes(a))) {
      throw new ForbiddenError(
        `This requisition is waiting for the ${roleLabel(routedRole)}. You don't hold that role.`,
      );
    }
    // If the approval requires HOD, ensure the caller is HOD for this PR's department
    if (!held.includes("admin") && routedRole === "hod") {
      const isHodForDept = roles.some(
        (r) => r.role === "hod" && r.department_id && r.department_id === pr.department_id,
      );
      if (!isHodForDept) {
        throw new ForbiddenError(
          "You are not the designated Head of Department (HOD) for this requisition's department.",
        );
      }
    }
  } catch (e: any) {
    return { ok: false as const, error: e.message };
  }

  if (decision === "rejected" && (!data.remarks || !data.remarks.trim())) {
    return {
      ok: false as const,
      error: "Enter a reason for rejecting this requisition.",
      code: "rejection_remarks_required",
    };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Budget (SOP Section B): re-check the balance at approval. Over budget needs the EVP —
  // an approver below the EVP sends it on instead of approving.
  let budgetUpdate: Record<string, unknown> = {};
  let sentToEvpForBudget = false;
  if (decision === "approved" && pr.budget_head_id) {
    const { prBudgetCheck, overBudgetReason } = await import("@/server/procurement/budget");
    const budget = await prBudgetCheck(supabaseAdmin as any, {
      headId: pr.budget_head_id,
      departmentId: pr.department_id,
      amount: Number(pr.estimated_value) || 0,
    });
    if (budget.ok && budget.status === "over") {
      if (routedRole === "evp" || held.includes("evp")) {
        budgetUpdate = { budget_status: "evp_approved" };
      } else {
        sentToEvpForBudget = true;
        budgetUpdate = {
          budget_status: "over",
          routing_reason: overBudgetReason(Number(budget.balance), Number(pr.estimated_value) || 0),
        };
      }
    } else if (budget.ok) {
      budgetUpdate = { budget_status: budget.status };
    }
  }
  if (sentToEvpForBudget) {
    nextStatus = "escalated_to_evp";
    decision = "escalated";
  }

  const { error: upErr } = await (supabaseAdmin as any)
    .from("purchase_requisitions")
    .update({
      status: nextStatus,
      current_approver_role: decision === "escalated" ? "evp" : pr.current_approver_role,
      ...budgetUpdate,
    })
    .eq("id", pr.id);
  if (upErr) return { ok: false as const, error: upErr.message };

  await (supabaseAdmin as any).from("pr_approvals").insert({
    pr_id: pr.id,
    stage,
    approver_role: held.find((h) => allowed.includes(h)) ?? "admin",
    approver_id: context.userId,
    decision: sentToEvpForBudget ? "approved" : decision,
    remarks: sentToEvpForBudget
      ? [data.remarks?.trim(), "Approved; over budget, so sent to the EVP."]
          .filter(Boolean)
          .join(" ")
      : (data.remarks ?? null),
  });

  // Notify requester or escalated authority via SMTP in background
  if (decision === "approved" || decision === "rejected") {
    import("@/server/email/notificationDispatcher")
      .then(({ notifyPrRequester }) =>
        notifyPrRequester({
          requesterId: pr.requested_by,
          prNumber: pr.pr_number,
          decision,
          remarks: data.remarks ?? undefined,
        }),
      )
      .catch((e) => console.warn("[Email] PR decision notification failed:", e));
  } else if (decision === "escalated") {
    import("@/server/email/notificationDispatcher")
      .then(({ notifyApproversForPr }) =>
        notifyApproversForPr({
          prNumber: pr.pr_number,
          role: "evp",
          estimatedValue: Number(pr.estimated_value) || 0,
          category: pr.category,
          departmentId: pr.department_id,
        }),
      )
      .catch((e) => console.warn("[Email] PR escalation notification failed:", e));
  }

  return {
    ok: true as const,
    status: nextStatus,
    reason: sentToEvpForBudget ? "Over budget: sent to the EVP for approval." : resolved.reason,
  };
}

export const reviewPr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: DecisionInput) => input)
  .handler(({ data, context }) =>
    decide(context, data, "director_pc_review", "reviewed", "under_review"),
  );

export const approvePr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: DecisionInput) => input)
  .handler(({ data, context }) =>
    decide(context, data, "authority_approval", "approved", "approved"),
  );

export const rejectPr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: DecisionInput) => input)
  .handler(({ data, context }) =>
    decide(context, data, "authority_approval", "rejected", "rejected"),
  );

export const escalateToEvp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: DecisionInput) => input)
  .handler(({ data, context }) =>
    decide(context, data, "evp_escalation", "escalated", "escalated_to_evp"),
  );
