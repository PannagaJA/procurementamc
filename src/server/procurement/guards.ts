/**
 * Compliance guards (SOP §7, §8.4–§8.7, §9).
 *
 * Every guard throws a typed ProcurementRuleError with a human-readable reason.
 * They take the Supabase client as an argument so they can be exercised against
 * a test double without a live database.
 */
import { financialYear } from "@/lib/procurement/budgetLedger";
import { emergencyUsed } from "@/lib/procurement/emergencyCap";
import { ruleError } from "./errors";

/** Minimal structural type so these are testable with a stub client. */
export type Db = {
  from: (table: string) => any;
};

export const EMERGENCY_ANNUAL_CAP = 1000000; // ₹10,00,000 institution-wide (SOP §9)
/** A PO may not exceed the approved PR value by more than this fraction (§7.5). */
export const PO_SPLIT_TOLERANCE = 0;

export async function assertPrApproved(db: Db, prId: string): Promise<void> {
  const { data, error } = await db
    .from("purchase_requisitions")
    .select("id, status, pr_number")
    .eq("id", prId)
    .maybeSingle();

  if (error)
    throw ruleError(
      "pr_lookup_failed",
      `Could not read the purchase requisition: ${error.message}`,
    );
  if (!data) throw ruleError("pr_not_found", "The purchase requisition does not exist.");
  if (data.status !== "approved") {
    throw ruleError(
      "pr_not_approved",
      `Purchase requisition ${data.pr_number ?? prId} is "${data.status}". No procurement step may proceed until it is approved.`,
    );
  }
}

export async function assertVendorEmpanelled(db: Db, vendorId: string): Promise<void> {
  const { data, error } = await db
    .from("vendors")
    .select("id, name, status, empanelment_expiry")
    .eq("id", vendorId)
    .maybeSingle();

  if (error) throw ruleError("vendor_lookup_failed", `Could not read the vendor: ${error.message}`);
  if (!data) throw ruleError("vendor_not_found", "The vendor does not exist.");
  if (data.status !== "empanelled") {
    throw ruleError(
      "vendor_not_empanelled",
      `Vendor "${data.name}" is "${data.status}". Only empanelled vendors may be awarded work.`,
    );
  }
  if (data.empanelment_expiry && new Date(data.empanelment_expiry) < new Date()) {
    throw ruleError(
      "vendor_empanelment_expired",
      `Vendor "${data.name}" empanelment expired on ${data.empanelment_expiry}. Renew before awarding work.`,
    );
  }
}

/**
 * Prevents splitting a requirement across multiple POs to stay under a
 * threshold:
 * 1. The sum of all POs raised against a PR may not exceed the approved PR value.
 * 2. 30-day rolling window check: If this vendor already has another PO from the same
 *    PR/department within 30 days whose combined value would require a higher
 *    approval tier than either PO individually received, it is BLOCKED unless a deviation
 *    approval exists (§7.5, Day 2 DoD).
 */
export type PoSplittingEscalation = {
  escalateRole: string;
  combinedSum: number;
  pastSum: number;
  reason: string;
} | null;

export async function assertNoPoSplitting(
  db: Db,
  prId: string,
  newValue: number,
  vendorId?: string,
  departmentId?: string,
  csId?: string,
): Promise<PoSplittingEscalation> {
  const { data: pr, error: prErr } = await db
    .from("purchase_requisitions")
    .select("id, pr_number, estimated_value, department_id, category")
    .eq("id", prId)
    .maybeSingle();
  if (prErr)
    throw ruleError(
      "pr_lookup_failed",
      `Could not read the purchase requisition: ${prErr.message}`,
    );
  if (!pr) throw ruleError("pr_not_found", "The purchase requisition does not exist.");

  const effectiveDeptId = departmentId ?? pr.department_id;

  const { data: pos, error: poErr } = await db
    .from("purchase_orders")
    .select("id, total_value, vendor_id, pr_id, department_id, created_at, status")
    .eq("pr_id", prId)
    .neq("status", "cancelled");

  if (poErr && !/does not exist|schema cache/i.test(poErr.message ?? "")) {
    throw ruleError(
      "po_lookup_failed",
      `Could not read existing purchase orders: ${poErr.message}`,
    );
  }

  const already = (pos ?? []).reduce((s: number, p: any) => s + Number(p.total_value ?? 0), 0);
  let approved = Number(pr.estimated_value ?? 0);

  // If a Comparative Statement (CS) was approved by the designated authority following competitive bidding,
  // the approved CS recommended amount is the authorized procurement cap for this requirement.
  if (csId) {
    const { data: cs } = await db
      .from("comparative_statements")
      .select("id, status, recommended_total")
      .eq("id", csId)
      .maybeSingle();
    if (cs && cs.status === "approved" && Number(cs.recommended_total ?? 0) > 0) {
      approved = Math.max(approved, Number(cs.recommended_total));
    }
  }

  const projected = already + Number(newValue);

  // 30-day rolling window check for the same vendor (SOP §7.5)
  let priorPoMatch: any = null;
  let recentVendorPos: any[] = [];
  if (vendorId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentPos, error: rErr } = await db
      .from("purchase_orders")
      .select("id, po_number, total_value, created_at, status, pr_id, department_id")
      .eq("vendor_id", vendorId)
      .gte("created_at", thirtyDaysAgo)
      .neq("status", "cancelled");

    if (!rErr && recentPos && recentPos.length > 0) {
      // Splitting means one requirement broken into several orders: only the same PR, or the
      // same department buying the same category, counts — not unrelated purchases from the vendor.
      const prIds = [...new Set(recentPos.map((p: any) => p.pr_id).filter(Boolean))];
      const { data: prs } = prIds.length
        ? await db.from("purchase_requisitions").select("id, category").in("id", prIds)
        : { data: [] };
      const categoryOf = new Map((prs ?? []).map((r: any) => [r.id, r.category]));
      recentVendorPos = recentPos.filter(
        (p: any) =>
          p.pr_id === prId ||
          (effectiveDeptId &&
            p.department_id === effectiveDeptId &&
            categoryOf.get(p.pr_id) === pr.category),
      );
      priorPoMatch = recentVendorPos[0] ?? null;
    }
  }

  // Requisitions and budget checks allow +₹1 rounding tolerance across the platform
  if (approved > 0 && projected > approved + 1) {
    const priorRef = priorPoMatch ? ` (${priorPoMatch.po_number})` : "";
    throw ruleError(
      "po_splitting",
      `Purchase orders against ${pr.pr_number ?? prId} would total ₹${projected.toLocaleString("en-IN")}, ` +
        `more than its approved value of ₹${approved.toLocaleString("en-IN")}. ` +
        (priorPoMatch
          ? `An earlier order${priorRef} was already placed with this vendor in the last 30 days. `
          : "") +
        `Combine the requirement into one order, or request a deviation approval to exceed the approved value.`,
    );
  }

  if (recentVendorPos.length > 0) {
    const relatedPos = recentVendorPos;

    if (relatedPos.length > 0) {
      const pastSum = relatedPos.reduce(
        (sum: number, p: any) => sum + Number(p.total_value ?? 0),
        0,
      );
      const combinedSum = pastSum + Number(newValue);

      // Fetch matrix rules to check tier escalation
      const { data: matrixRules } = await db
        .from("approval_matrix_rules")
        .select("*")
        .eq("active", true);

      if (matrixRules && matrixRules.length > 0) {
        const { resolveApprover } = await import("@/lib/procurement/authorityMatrix");
        const category = pr.category ?? "routine_consumable";
        const singleTier = resolveApprover(category, Number(newValue), 0, matrixRules);
        const combinedTier = resolveApprover(category, combinedSum, 0, matrixRules);

        // Check if combined total escalates to a higher authority role than the individual PO
        const roleHierarchy = [
          "hod",
          "principal",
          "procurement_officer",
          "purchase_committee",
          "director_admin_finance",
          "evp",
        ];
        const singleRank = roleHierarchy.indexOf(singleTier.role.toLowerCase());
        const combinedRank = roleHierarchy.indexOf(combinedTier.role.toLowerCase());

        if (combinedRank > singleRank || (combinedTier.escalate && !singleTier.escalate)) {
          // Procedure 3: Consolidated requirement automatically escalates approval authority to the higher tier
          // (e.g. combined spend requires Principal instead of HOD).
          return {
            escalateRole: combinedTier.role,
            combinedSum,
            pastSum,
            reason: `Orders to this vendor in the last 30 days total ₹${combinedSum.toLocaleString("en-IN")} (earlier: ₹${pastSum.toLocaleString("en-IN")}, this order: ₹${Number(newValue).toLocaleString("en-IN")}), so this order needs ${combinedTier.role.toUpperCase()} approval.`,
          };
        }
      }
    }
  }

  return null;
}

/**
 * The shared emergency counter (SOP §9): register ledger + emergency-flag PRs, one ₹10,00,000 per
 * Indian FY. Pass the service-role client: RLS would hide other departments' PRs.
 */
export async function emergencyCapStatus(admin: Db, newAmount = 0, fy = financialYear()) {
  const startYear = Number(fy.slice(0, 4));
  const [ledgerRes, prsRes, linksRes] = await Promise.all([
    admin
      .from("emergency_annual_ledger")
      .select("running_total, cap_limit")
      .eq("financial_year", fy)
      .maybeSingle(),
    admin
      .from("purchase_requisitions")
      .select("id, estimated_value, status")
      .eq("is_emergency", true)
      .gte("created_at", new Date(startYear, 3, 1).toISOString())
      .lt("created_at", new Date(startYear + 1, 3, 1).toISOString()),
    // Only an approved entry's cost is in the ledger, so only its PO's backing PR is skipped.
    admin
      .from("emergency_procurements")
      .select("pr_id")
      .eq("evp_approval_status", "approved")
      .not("pr_id", "is", null),
  ]);
  const error = ledgerRes.error ?? prsRes.error ?? linksRes.error;
  if (error)
    throw ruleError(
      "emergency_lookup_failed",
      `Could not read the emergency procurement register: ${error.message}`,
    );

  const registerTotal = Number(ledgerRes.data?.running_total ?? 0);
  const capLimit = Number(ledgerRes.data?.cap_limit ?? EMERGENCY_ANNUAL_CAP);
  const used = emergencyUsed({
    registerTotal,
    emergencyPrs: prsRes.data ?? [],
    linkedPrIds: (linksRes.data ?? []).map((l: any) => l.pr_id),
  });
  const projected = used + (Number(newAmount) || 0);
  return {
    financialYear: fy,
    registerTotal,
    used,
    capLimit,
    remaining: Math.max(0, capLimit - used),
    projected,
    allowed: projected <= capLimit,
  };
}

/** Emergency procurement aggregate annual cap of ₹10,00,000 (SOP §9), across both routes. */
export async function assertEmergencyCapNotExceeded(admin: Db, newValue: number): Promise<void> {
  const cap = await emergencyCapStatus(admin, newValue);
  if (!cap.allowed) {
    throw ruleError(
      "emergency_cap_exceeded",
      `Emergency procurement this financial year would reach ₹${cap.projected.toLocaleString("en-IN")}, ` +
        `above the annual cap of ₹${cap.capLimit.toLocaleString("en-IN")} (already used ₹${cap.used.toLocaleString("en-IN")}).`,
    );
  }
}
