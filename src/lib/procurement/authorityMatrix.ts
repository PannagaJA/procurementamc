/**
 * Authority Matrix engine (SOP §6) — PURE, table-driven, no DB dependency.
 *
 * Rules are passed in as arguments (loaded from public.approval_matrix_rules)
 * so this module is fully unit-testable and no monetary threshold is ever
 * hardcoded in TypeScript. See DECISIONS.md Q1/Q2/Q3.
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
};

export type ResolvedApprover = {
  role: ApprovalRole | string;
  escalate: boolean;
  reason: string;
  rule: MatrixRule | null;
  minQuotations: number;
  requiresRateContract: boolean;
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
    notes: "Department Head direct spot purchase.",
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
    notes: "Institutional Principal direct authorization.",
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
    notes: "Central Procurement direct spot purchase.",
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
    notes: "Periodic requisitions against empanelled Rate Contracts.",
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
    notes: "Asset procurement, software licenses, AMC agreements, and repairs.",
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

/**
 * Resolve the approving role for a transaction.
 *
 * @param category        SOP procurement category
 * @param txnValue        value of this single transaction
 * @param monthToDateSpend spend already booked this month on the aggregation
 *                        dimension (per DECISIONS.md Q3: the requesting department)
 * @param rules           rows from approval_matrix_rules
 */
export function resolveApprover(
  category: PrCategory | string,
  txnValue: number,
  monthToDateSpend: number,
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
      reason: `No active authority-matrix rule exists for category "${category}". Escalated to Executive Vice President (EVP).`,
      rule: null,
      minQuotations: 3,
      requiresRateContract: false,
    };
  }

  const projectedMonth = monthToDateSpend + txnValue;

  for (const rule of applicable) {
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
          ? `${inr(txnValue)} is within the ${roleDisplay} limit (${txnLimitStr}, up to ${inr(limit(rule.per_month_limit))} per month; month-to-date ${inr(monthToDateSpend)}).`
          : `${inr(txnValue)} is within the ${roleDisplay} limit of ${txnLimitStr} and ${inr(limit(rule.per_month_limit))} per month (month-to-date ${inr(monthToDateSpend)}).`;

      return {
        role: rule.approval_role,
        escalate: false,
        reason,
        rule,
        minQuotations: rule.min_quotations ?? (rule.requires_rate_contract ? 3 : 0),
        requiresRateContract: rule.requires_rate_contract === true,
      };
    }
  }

  // Nothing in the matrix can authorise this — escalate to EVP.
  const highest = applicable[applicable.length - 1]!;
  const breachedTxn = highest.per_txn_limit !== null && txnValue > limit(highest.per_txn_limit);
  const roleDisplay = formatRoleTitle(highest.approval_role as string);

  const reason = breachedTxn
    ? `${inr(txnValue)} exceeds the highest per-transaction limit for "${category}" ` +
      `(${inr(limit(highest.per_txn_limit))}, ${roleDisplay}). Escalated to Executive Vice President (EVP).`
    : `Spend of ${inr(txnValue)} (plus month-to-date ${inr(monthToDateSpend)}) exceeds the ` +
      `monthly cap of ${inr(limit(highest.per_month_limit))} for "${category}" ` +
      `(${roleDisplay}). Escalated to Executive Vice President (EVP).`;

  return {
    role: ESCALATION_ROLE,
    escalate: true,
    reason,
    rule: highest,
    minQuotations: highest.min_quotations ?? 3,
    requiresRateContract: highest.requires_rate_contract === true,
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
