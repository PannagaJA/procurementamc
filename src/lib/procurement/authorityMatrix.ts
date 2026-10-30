/**
 * Authority Matrix engine (SOP §6, §13) — PURE, table-driven, no DB dependency.
 *
 * Rules are passed in as arguments (loaded from public.approval_matrix_rules)
 * so this module is fully unit-testable and no monetary threshold is ever
 * hardcoded in TypeScript. See DECISIONS.md Q1/Q2/Q3.
 *
 * Supports Level-Aware monthly spend aggregation scopes:
 * - 'department' for departmental roles (e.g. HOD: ₹5,000/month cap per department)
 * - 'institution' for central institutional roles (e.g. Principal, Procurement Officer, Purchase Committee)
 */

export type PrCategory =
  | "small_value"
  | "routine_consumable"
  | "equipment_asset"
  | "software"
  | "academic_research"
  | "services_amc"
  | "maintenance";

export type ApprovalRole =
  | "hod"
  | "principal"
  | "procurement_officer"
  | "purchase_committee"
  | "director_admin_finance"
  | "evp";

export type AggregationScope = "department" | "institution" | "approver";

export type MonthlySpendContext =
  | number
  | {
      departmentSpend?: number;
      institutionSpend?: number;
      approverSpend?: number;
    };

export type MatrixRule = {
  id?: string;
  category: PrCategory | string;
  method: string | null;
  per_txn_limit: number | null;
  per_month_limit: number | null;
  approval_role: ApprovalRole | string;
  min_quotations: number | null;
  requires_rate_contract: boolean | null;
  active: boolean | null;
  aggregation_scope?: AggregationScope | string | null;
};

export type ResolvedApprover = {
  role: ApprovalRole | string;
  escalate: boolean;
  reason: string;
  rule: MatrixRule | null;
  minQuotations: number;
  requiresRateContract: boolean;
  appliedScope?: AggregationScope;
  appliedSpend?: number;
  scopeLabel?: string;
};

export type AuthorityMatrixTier = {
  id: string;
  procurementType: string;
  categoryKeys: string[];
  procurementMethod: string;
  txnLimit: number | null;
  txnLimitFormatted: string;
  monthLimit: number | null;
  monthLimitFormatted: string;
  approvalAuthority: string;
  approvalRole: ApprovalRole | string;
  minQuotations: number;
  requiresRateContract: boolean;
  aggregationScope: AggregationScope;
  aggregationScopeFormatted: string;
  notes?: string;
};

/** Authority Matrix definition matching SOP §VI table */
export const AUTHORITY_MATRIX_DEFINITIONS: AuthorityMatrixTier[] = [
  {
    id: "small_value_hod",
    procurementType: "Small Value Orders",
    categoryKeys: ["small_value"],
    procurementMethod: "Direct Purchase",
    txnLimit: 2000,
    txnLimitFormatted: "Up to ₹2,000",
    monthLimit: 5000,
    monthLimitFormatted: "Up to ₹5,000",
    approvalAuthority: "HOD",
    approvalRole: "hod",
    minQuotations: 0,
    requiresRateContract: false,
    aggregationScope: "department",
    aggregationScopeFormatted: "Per Department",
    notes: "Department Head direct spot purchase scoped to departmental spend.",
  },
  {
    id: "small_value_principal",
    procurementType: "Small Value Orders",
    categoryKeys: ["small_value"],
    procurementMethod: "Direct Purchase",
    txnLimit: 5000,
    txnLimitFormatted: "Up to ₹5,000",
    monthLimit: 30000,
    monthLimitFormatted: "Up to ₹30,000",
    approvalAuthority: "Principals",
    approvalRole: "principal",
    minQuotations: 0,
    requiresRateContract: false,
    aggregationScope: "institution",
    aggregationScopeFormatted: "Institution-wide",
    notes: "Institutional Principal direct authorization across academic departments.",
  },
  {
    id: "small_value_po",
    procurementType: "Small Value Orders",
    categoryKeys: ["small_value"],
    procurementMethod: "Direct Purchase",
    txnLimit: 5000,
    txnLimitFormatted: "Up to ₹5,000",
    monthLimit: 30000,
    monthLimitFormatted: "Up to ₹30,000",
    approvalAuthority: "Procurement Officer",
    approvalRole: "procurement_officer",
    minQuotations: 0,
    requiresRateContract: false,
    aggregationScope: "institution",
    aggregationScopeFormatted: "Institution-wide",
    notes: "Central Procurement direct spot purchase institution-wide.",
  },
  {
    id: "routine_consumables",
    procurementType: "Routine Consumables",
    categoryKeys: ["routine_consumable"],
    procurementMethod:
      "Rate Contract with Vendors approved by EVP/Trustees (Minimum 3 quotations at rate finalisation, Validity: 6 months)",
    txnLimit: null,
    txnLimitFormatted: "As per approved rate contract",
    monthLimit: 100000,
    monthLimitFormatted: "Up to ₹1,00,000",
    approvalAuthority: "Procurement Officer",
    approvalRole: "procurement_officer",
    minQuotations: 3,
    requiresRateContract: true,
    aggregationScope: "institution",
    aggregationScopeFormatted: "Institution-wide",
    notes: "Periodic requisitions against empanelled Rate Contracts institution-wide.",
  },
  {
    id: "equipment_assets_services",
    procurementType:
      "Equipment & Assets / Software Licenses Academic & Research / Services (AMC) / Maintenance & Repairs",
    categoryKeys: [
      "equipment_asset",
      "software",
      "academic_research",
      "services_amc",
      "maintenance",
    ],
    procurementMethod: "Comparative Quotations with Approved Vendors (Minimum 3)",
    txnLimit: 10000,
    txnLimitFormatted: "Up to ₹10,000",
    monthLimit: 50000,
    monthLimitFormatted: "Up to ₹50,000",
    approvalAuthority: "Purchase Committee",
    approvalRole: "purchase_committee",
    minQuotations: 3,
    requiresRateContract: false,
    aggregationScope: "institution",
    aggregationScopeFormatted: "Institution-wide",
    notes: "Asset procurement, software licenses, AMC agreements, and repairs (central 5-member committee limit).",
  },
  {
    id: "evp_escalation",
    procurementType: "High Value / Above Matrix Delegation / Unscheduled",
    categoryKeys: ["all"],
    procurementMethod: "Executive Sanction / Board of Trustees Approval",
    txnLimit: null,
    txnLimitFormatted: "Exceeds ₹10,000 (Assets/Services) or ₹1,00,000 (Consumables)",
    monthLimit: null,
    monthLimitFormatted: "Exceeds monthly band caps",
    approvalAuthority: "Executive Vice President (EVP) / Trustees",
    approvalRole: "evp",
    minQuotations: 3,
    requiresRateContract: false,
    aggregationScope: "institution",
    aggregationScopeFormatted: "Global Institutional Ledger",
    notes: "Requires formal Executive Vice President & Trustee countersignature.",
  },
];

/** Role used whenever no rule in the matrix can authorise the transaction. */
export const ESCALATION_ROLE: ApprovalRole = "evp";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function limit(v: number | null | undefined): number {
  return v === null || v === undefined ? Number.POSITIVE_INFINITY : Number(v);
}

export function formatRoleTitle(role: string): string {
  switch (role) {
    case "hod":
      return "HOD";
    case "principal":
      return "Principal";
    case "procurement_officer":
      return "Procurement Officer";
    case "purchase_committee":
      return "Purchase Committee";
    case "evp":
      return "Executive Vice President (EVP)";
    case "director_admin_finance":
      return "Director (Admin & Finance)";
    default:
      return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function normalizeCategory(category: string): string {
  const norm = (category || "")
    .toLowerCase()
    .trim()
    .replace(/[-\s]+/g, "_");
  if (
    norm.includes("small_value") ||
    norm.includes("smallvalue") ||
    norm.includes("direct_purchase") ||
    norm.includes("small_order")
  )
    return "small_value";
  if (norm.includes("routine") || norm.includes("consumable")) return "routine_consumable";
  if (norm.includes("equipment") || norm.includes("asset")) return "equipment_asset";
  if (norm.includes("software")) return "software";
  if (norm.includes("academic") || norm.includes("research")) return "academic_research";
  if (norm.includes("service") || norm.includes("amc")) return "services_amc";
  if (norm.includes("maintenance") || norm.includes("repair")) return "maintenance";
  return norm;
}

export function getRuleScope(rule: MatrixRule): AggregationScope {
  if (
    rule.aggregation_scope === "department" ||
    rule.aggregation_scope === "institution" ||
    rule.aggregation_scope === "approver"
  ) {
    return rule.aggregation_scope as AggregationScope;
  }
  const role = String(rule.approval_role || "").toLowerCase();
  if (role === "hod") return "department";
  return "institution";
}

export function extractSpendForScope(
  spendContext: MonthlySpendContext,
  scope: AggregationScope,
): { spend: number; label: string } {
  if (typeof spendContext === "number") {
    return {
      spend: spendContext,
      label: scope === "department" ? "department month-to-date" : "institutional month-to-date",
    };
  }

  if (scope === "department") {
    return {
      spend: Number(spendContext?.departmentSpend ?? 0),
      label: "department month-to-date",
    };
  }
  if (scope === "approver") {
    return {
      spend: Number(spendContext?.approverSpend ?? spendContext?.institutionSpend ?? 0),
      label: "approver month-to-date",
    };
  }
  return {
    spend: Number(spendContext?.institutionSpend ?? 0),
    label: "institutional month-to-date",
  };
}

export async function fetchMonthlySpendBreakdown(
  db: any,
  category: string,
  departmentId: string | null,
  monthDate = new Date(),
): Promise<{ departmentSpend: number; institutionSpend: number }> {
  const mKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-01`;
  const canonicalCat = normalizeCategory(category);

  try {
    const { data: rows, error } = await db
      .from("department_monthly_spend")
      .select("department_id, total_spent")
      .eq("month", mKey)
      .eq("category", canonicalCat);

    if (error || !rows) {
      return { departmentSpend: 0, institutionSpend: 0 };
    }

    let departmentSpend = 0;
    let institutionSpend = 0;

    for (const r of rows) {
      const amt = Number(r.total_spent ?? 0);
      institutionSpend += amt;
      if (departmentId && r.department_id === departmentId) {
        departmentSpend += amt;
      }
    }

    return { departmentSpend, institutionSpend };
  } catch {
    return { departmentSpend: 0, institutionSpend: 0 };
  }
}

/**
 * Resolve the approving role for a transaction.
 *
 * @param category        SOP procurement category
 * @param txnValue        value of this single transaction
 * @param monthToDateSpend spend already booked this month (number or level-aware MonthlySpendContext)
 * @param rules           rows from approval_matrix_rules
 */
export function resolveApprover(
  category: PrCategory | string,
  txnValue: number,
  monthToDateSpend: MonthlySpendContext,
  rules: MatrixRule[],
): ResolvedApprover {
  const canonicalCat = normalizeCategory(category);

  // Filter applicable rules matching canonical category
  const applicable = (rules ?? [])
    .filter(
      (r) =>
        r.active !== false &&
        (r.category === canonicalCat || normalizeCategory(r.category) === canonicalCat),
    )
    // cheapest authority first — first-approver-wins between overlapping roles (Q2)
    .sort((a, b) => limit(a.per_txn_limit) - limit(b.per_txn_limit));

  if (applicable.length === 0) {
    return {
      role: ESCALATION_ROLE,
      escalate: true,
      reason: `No approval limit is set up for this kind of purchase, so it goes to the Executive Vice President (EVP).`,
      rule: null,
      minQuotations: 3,
      requiresRateContract: false,
      appliedScope: "institution",
      appliedSpend: 0,
      scopeLabel: "institutional month-to-date",
    };
  }

  for (const rule of applicable) {
    const scope = getRuleScope(rule);
    const { spend: currentSpend, label: scopeLabel } = extractSpendForScope(monthToDateSpend, scope);
    const projectedMonth = currentSpend + txnValue;

    const txnOk = txnValue <= limit(rule.per_txn_limit);
    const monthOk = projectedMonth <= limit(rule.per_month_limit);

    if (txnOk && monthOk) {
      const roleDisplay = formatRoleTitle(rule.approval_role as string);
      const txnLimitStr =
        rule.per_txn_limit === null
          ? "As per approved rate contract"
          : `${inr(limit(rule.per_txn_limit))} per transaction`;

      const reason =
        rule.per_txn_limit === null
          ? `${inr(txnValue)} is within the ${roleDisplay} limit (${txnLimitStr}, up to ${inr(limit(rule.per_month_limit))} per month; ${scopeLabel} ${inr(currentSpend)}).`
          : `${inr(txnValue)} is within the ${roleDisplay} limit of ${txnLimitStr} and ${inr(limit(rule.per_month_limit))} per month (${scopeLabel} ${inr(currentSpend)}).`;

      return {
        role: rule.approval_role,
        escalate: false,
        reason,
        rule,
        minQuotations: rule.min_quotations ?? (rule.requires_rate_contract ? 3 : 0),
        requiresRateContract: rule.requires_rate_contract === true,
        appliedScope: scope,
        appliedSpend: currentSpend,
        scopeLabel,
      };
    }
  }

  // Nothing in the matrix can authorise this — escalate to EVP.
  const highest = applicable[applicable.length - 1]!;
  const highestScope = getRuleScope(highest);
  const { spend: highestSpend, label: highestScopeLabel } = extractSpendForScope(monthToDateSpend, highestScope);

  const breachedTxn = highest.per_txn_limit !== null && txnValue > limit(highest.per_txn_limit);
  const roleDisplay = formatRoleTitle(highest.approval_role as string);

  const reason = breachedTxn
    ? `${inr(txnValue)} exceeds the highest per-transaction limit for "${category}" ` +
      `(${inr(limit(highest.per_txn_limit))}, ${roleDisplay}). Escalated to Executive Vice President (EVP).`
    : `Spend of ${inr(txnValue)} (plus ${highestScopeLabel} ${inr(highestSpend)}) exceeds the ` +
      `monthly cap of ${inr(limit(highest.per_month_limit))} for "${category}" ` +
      `(${roleDisplay}). Escalated to Executive Vice President (EVP).`;

  return {
    role: ESCALATION_ROLE,
    escalate: true,
    reason,
    rule: highest,
    minQuotations: highest.min_quotations ?? 3,
    requiresRateContract: highest.requires_rate_contract === true,
    appliedScope: highestScope,
    appliedSpend: highestSpend,
    scopeLabel: highestScopeLabel,
  };
}

/** Matrix methods for small-value buying that need no Comparative Statement. */
export const DIRECT_PURCHASE_METHODS = ["direct_purchase", "small_value_po"];

/**
 * True when the resolved band is a direct / small-value purchase: the officer collects vendor
 * quotes and awards the PO directly (no CS). Driven by approval_matrix_rules.method.
 */
export function isDirectPurchase(resolved: ResolvedApprover): boolean {
  return !resolved.escalate && DIRECT_PURCHASE_METHODS.includes(resolved.rule?.method ?? "");
}
