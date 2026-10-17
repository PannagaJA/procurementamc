/**
 * Purchase Requisition server functions (SOP §8.3).
 *
 * Every write goes through here. The caller's roles are re-derived from the
 * verified session server-side; the client-sent role is never trusted.
 * The pure rule engine lives in src/server/procurement/* and is dynamically
 * imported inside the handlers so it never enters the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CreatePrInput = {
  department_id: string | null;
  category: string;
  scope: "academic" | "operational";
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
    /** SOP item group (src/lib/procurement/itemGroups.ts). */
    item_group: string;
  }[];
};

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const APPROVER_CHAIN = [
  "hod",
  "principal",
  "procurement_officer",
  "purchase_committee",
  "director_admin_finance",
  "evp",
];

/**
 * Nobody approves their own requisition: if the requester holds the routed role (an HOD for
 * their own department), route to the next authority up the chain instead.
 */
async function independentApprover(
  requesterId: string | null,
  departmentId: string | null,
  role: string,
): Promise<string> {
  if (!requesterId) return role;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getCallerRoles } = await import("@/server/procurement/roles");
  const theirs = await getCallerRoles(supabaseAdmin as any, requesterId);
  const holds = (r: string) =>
    theirs.some((x) => x.role === r && (r !== "hod" || x.department_id === departmentId));
  if (!holds(role)) return role;
  const from = APPROVER_CHAIN.indexOf(role);
  return APPROVER_CHAIN.slice(from + 1).find((r) => !holds(r)) ?? "evp";
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
  const { resolveApprover, normalizeCategory } = await import("@/lib/procurement/authorityMatrix");
  const canonicalCat = normalizeCategory(category);
  const { data: rules } = await db.from("approval_matrix_rules").select("*").eq("active", true);

  let spend = 0;
  if (departmentId) {
    const { data: rows } = await db
      .from("department_monthly_spend")
      .select("total_spent")
      .eq("department_id", departmentId)
      .eq("month", monthKey())
      .eq("category", canonicalCat);
    spend = (rows ?? []).reduce((s: number, r: any) => s + Number(r.total_spent ?? 0), 0);
  }
  return resolveApprover(category, value, spend, (rules ?? []) as any);
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

    const value = Number(data.estimated_value) || 0;
    const canonicalCat = normalizeCategory(data.category);

    if (data.is_emergency) {
      const { assertEmergencyCapNotExceeded } = await import("@/server/procurement/guards");
      try {
        await assertEmergencyCapNotExceeded(db, value);
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

    const resolved = await resolve(db, canonicalCat, data.department_id, value);
    const approverRole = await independentApprover(
      context.userId,
      data.department_id,
      resolved.role,
    );
    const routingReason =
      approverRole === resolved.role
        ? resolved.reason
        : `${resolved.reason} Routed to the ${approverRole.replace(/_/g, " ").toUpperCase()} because the requester holds the ${resolved.role.replace(/_/g, " ").toUpperCase()} role.`;

    const { data: pr, error } = await db
      .from("purchase_requisitions")
      .insert({
        department_id: data.department_id,
        requested_by: context.userId,
        category: canonicalCat,
        scope: data.scope,
        status: "submitted",
        budget_head: data.budget_head,
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
      "id, pr_number, status, category, estimated_value, department_id, current_approver_role, requested_by",
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
  const allowed =
    decision === "escalated"
      ? [routedRole, "director_admin_finance", "purchase_committee"]
      : [routedRole];

  try {
    if (!held.includes("admin") && !allowed.some((a) => held.includes(a))) {
      throw new ForbiddenError(
        `This requisition is waiting for the ${routedRole.replace(/_/g, " ").toUpperCase()}. You don't hold that role.`,
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

  const { error: upErr } = await (supabaseAdmin as any)
    .from("purchase_requisitions")
    .update({
      status: nextStatus,
      current_approver_role: decision === "escalated" ? "evp" : pr.current_approver_role,
    })
    .eq("id", pr.id);
  if (upErr) return { ok: false as const, error: upErr.message };

  await (supabaseAdmin as any).from("pr_approvals").insert({
    pr_id: pr.id,
    stage,
    approver_role: held.find((h) => allowed.includes(h)) ?? "admin",
    approver_id: context.userId,
    decision,
    remarks: data.remarks ?? null,
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

  return { ok: true as const, status: nextStatus, reason: resolved.reason };
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
