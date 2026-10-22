/**
 * Direct purchase (Small Value Orders) per the P2P SOP:
 * - §VI: small-value bands are "Direct Purchase" — no minimum quotations; the PR approver
 *   (HOD / Principal / Procurement Officer within their limits) is the authority.
 * - §VII.5: if an active rate contract covers the item group, the rate contract must be used.
 * - §8.4: check Central Stores before buying.
 * - §8.5: a PO only against an approved PR; no splitting.
 * Shared by createPo (direct PO, no quotes) and awardDirectPurchase (optional quotes).
 */
import { coveringContracts } from "@/lib/procurement/itemGroups";
import { roleLabel } from "@/lib/procurement/labels";
import {
  isDirectPurchase,
  normalizeCategory,
  resolveApprover,
} from "@/lib/procurement/authorityMatrix";
import { assertNoPoSplitting, assertVendorEmpanelled, type Db } from "./guards";
import { ProcurementRuleError } from "./errors";

/** Active rate contracts covering the given item groups, keyed by group. */
export async function rateContractCover(admin: Db, groups: string[]) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: contracts } = await admin
    .from("rate_contracts")
    .select("contract_number, valid_from, valid_to, approved_rates_json")
    .lte("valid_from", today)
    .gte("valid_to", today);
  return coveringContracts(groups, contracts ?? [], today);
}

type Failure = { ok: false; error: string; code: string };
type Passed = {
  ok: true;
  pr: { id: string; pr_number: string; department_id: string | null; category: string };
  /** Set when the anti-splitting rule escalates: the PO then needs this role's approval. */
  escalation: { escalateRole: string; reason: string } | null;
  /** Who approved the PR — the direct-purchase authority. */
  prApproval: { role: string; approverId: string | null };
};

const fail = (error: string, code: string): Failure => ({ ok: false, error, code });

export async function directPurchaseChecks(
  db: Db,
  admin: Db,
  input: { prId: string; vendorId: string; total: number; storesConfirmed: boolean },
): Promise<Failure | Passed> {
  const { data: pr } = await admin
    .from("purchase_requisitions")
    .select("id, pr_number, status, category, estimated_value, department_id")
    .eq("id", input.prId)
    .maybeSingle();
  if (!pr) return fail("Purchase requisition not found.", "pr_not_found");
  if (pr.status !== "approved")
    return fail(`${pr.pr_number} is "${pr.status}", not approved.`, "pr_not_approved");

  const { data: rules } = await admin.from("approval_matrix_rules").select("*").eq("active", true);
  if (
    !isDirectPurchase(resolveApprover(pr.category, Number(pr.estimated_value || 0), 0, rules ?? []))
  ) {
    return fail(
      `${pr.pr_number} is not a small-value direct purchase. Use a Comparative Statement or rate contract.`,
      "not_direct_purchase",
    );
  }

  // Rate contract takes precedence over direct purchase for the groups it covers.
  const { data: lines } = await admin.from("pr_line_items").select("item_group").eq("pr_id", pr.id);
  const cover = await rateContractCover(
    admin,
    (lines ?? []).map((l: any) => l.item_group).filter(Boolean),
  );
  const covered = Object.values(cover)[0];
  if (covered) {
    return fail(
      `Items on ${pr.pr_number} are covered by rate contract ${covered.contract_number}; order them under that contract.`,
      "rate_contract_applies",
    );
  }

  if (!input.storesConfirmed) {
    return fail(
      "Confirm the items are not available in Central Stores before buying.",
      "stores_check_required",
    );
  }

  const { data: existing } = await admin
    .from("purchase_orders")
    .select("po_number")
    .eq("pr_id", pr.id)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (existing)
    return fail(
      `${pr.pr_number} already has purchase order ${existing.po_number}.`,
      "pr_already_ordered",
    );

  const total = Number(input.total) || 0;
  if (total <= 0) return fail("Enter the order amount.", "invalid_amount");
  const approvedValue = Number(pr.estimated_value || 0);
  if (total > approvedValue + 1) {
    return fail(
      `The order (Rs. ${total.toLocaleString("en-IN")}) is more than the approved requisition value (Rs. ${approvedValue.toLocaleString("en-IN")}).`,
      "exceeds_pr_value",
    );
  }

  // The order amount itself must still be within a direct-purchase band (with this month's spend).
  const month = new Date();
  const { data: spendRows } = pr.department_id
    ? await admin
        .from("department_monthly_spend")
        .select("total_spent")
        .eq("department_id", pr.department_id)
        .eq("month", `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`)
        .eq("category", normalizeCategory(pr.category))
    : { data: [] };
  const spend = (spendRows ?? []).reduce((s: number, r: any) => s + Number(r.total_spent ?? 0), 0);
  if (!isDirectPurchase(resolveApprover(pr.category, total, spend, rules ?? []))) {
    return fail(
      "This amount is above the direct-purchase limit for this month. Use a Comparative Statement instead.",
      "exceeds_direct_limit",
    );
  }

  let escalation: Passed["escalation"] = null;
  try {
    await assertVendorEmpanelled(db, input.vendorId);
    escalation = await assertNoPoSplitting(db, pr.id, total, input.vendorId);
  } catch (e) {
    if (e instanceof ProcurementRuleError) return fail(e.message, e.code);
    throw e;
  }

  const { data: approval } = await admin
    .from("pr_approvals")
    .select("approver_role, approver_id")
    .eq("pr_id", pr.id)
    .eq("decision", "approved")
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ok: true,
    pr: {
      id: pr.id,
      pr_number: pr.pr_number,
      department_id: pr.department_id,
      category: pr.category,
    },
    escalation,
    prApproval: {
      role: approval?.approver_role ?? "approver",
      approverId: approval?.approver_id ?? null,
    },
  };
}

/**
 * PO status fields for a direct purchase. The PR approval is the authority (no second PO
 * approval), unless the anti-splitting rule escalated it to a higher role.
 */
export function directPurchaseApprovalFields(check: Passed) {
  const role = check.prApproval.role;
  if (check.escalation) {
    return {
      status: "pending_approval",
      original_approver_role: check.escalation.escalateRole,
      current_approver_role: check.escalation.escalateRole,
      routing_reason: check.escalation.reason,
    };
  }
  return {
    status: "approved",
    original_approver_role: role,
    current_approver_role: role,
    approved_by: check.prApproval.approverId,
    approved_at: new Date().toISOString(),
    routing_reason: `Direct purchase — authorised by the ${roleLabel(role)}'s approval of ${check.pr.pr_number}.`,
  };
}
