/**
 * Authority Matrix engine (SOP §6) — PURE, table-driven, no DB dependency.
 *
 * Rules are passed in as arguments (loaded from public.approval_matrix_rules)
 * so this module is fully unit-testable and no monetary threshold is ever
 * hardcoded in TypeScript. See DECISIONS.md Q1/Q2/Q3.
 */

export type PrCategory =
  | 'routine_consumable'
  | 'equipment_asset'
  | 'software'
  | 'academic_research'
  | 'services_amc'
  | 'maintenance'
  | 'small_value';

export type ApprovalRole =
  | 'hod'
  | 'principal'
  | 'procurement_officer'
  | 'purchase_committee'
  | 'director_admin_finance'
  | 'evp';

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

/** Role used whenever no rule in the matrix can authorise the transaction. */
export const ESCALATION_ROLE: ApprovalRole = 'evp';

const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function limit(v: number | null | undefined): number {
  return v === null || v === undefined ? Number.POSITIVE_INFINITY : Number(v);
}

export function normalizeCategory(category: string): string {
  const norm = (category || '').toLowerCase().trim().replace(/[-\s]+/g, '_');
  if (norm.includes('small_value') || norm.includes('smallvalue') || norm.includes('direct_purchase')) return 'small_value';
  if (norm.includes('routine') || norm.includes('consumable')) return 'routine_consumable';
  if (norm.includes('equipment') || norm.includes('asset')) return 'equipment_asset';
  if (norm.includes('software')) return 'software';
  if (norm.includes('academic') || norm.includes('research')) return 'academic_research';
  if (norm.includes('service') || norm.includes('amc')) return 'services_amc';
  if (norm.includes('maintenance')) return 'maintenance';
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
  const applicable = (rules ?? [])
    .filter((r) => r.active !== false && (r.category === canonicalCat || normalizeCategory(r.category) === canonicalCat))
    // cheapest authority first — first-approver-wins between overlapping roles (Q2)
    .sort((a, b) => limit(a.per_txn_limit) - limit(b.per_txn_limit));

  if (applicable.length === 0) {
    return {
      role: ESCALATION_ROLE,
      escalate: true,
      reason: `No active authority-matrix rule exists for category "${category}". Escalated to EVP.`,
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
      return {
        role: rule.approval_role,
        escalate: false,
        reason:
          `${inr(txnValue)} is within the ${rule.approval_role} limit of ` +
          `${inr(limit(rule.per_txn_limit))} per transaction and ` +
          `${inr(limit(rule.per_month_limit))} per month ` +
          `(month-to-date ${inr(monthToDateSpend)}).`,
        rule,
        minQuotations: rule.min_quotations ?? 0,
        requiresRateContract: rule.requires_rate_contract === true,
      };
    }
  }

  // Nothing in the matrix can authorise this — escalate.
  const highest = applicable[applicable.length - 1]!;
  const breachedTxn = txnValue > limit(highest.per_txn_limit);
  const reason = breachedTxn
    ? `${inr(txnValue)} exceeds the highest per-transaction limit for "${category}" ` +
      `(${inr(limit(highest.per_txn_limit))}, ${highest.approval_role}). Escalated to EVP.`
    : `Month-to-date spend ${inr(monthToDateSpend)} plus ${inr(txnValue)} exceeds the ` +
      `monthly cap of ${inr(limit(highest.per_month_limit))} for "${category}" ` +
      `(${highest.approval_role}). Escalated to EVP.`;

  return {
    role: ESCALATION_ROLE,
    escalate: true,
    reason,
    rule: highest,
    minQuotations: highest.min_quotations ?? 3,
    requiresRateContract: highest.requires_rate_contract === true,
  };
}
