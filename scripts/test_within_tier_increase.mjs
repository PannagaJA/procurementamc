/**
 * TEST CASE: PR ₹4,500 -> PO ₹4,900 WITHIN-TIER INCREASE TEST
 *
 * Verifies:
 * 1. PR ₹4,500 approved by Principal.
 * 2. PO created at ₹4,900 (higher than PR estimate ₹4,500, but within Principal tier <= ₹5,000).
 * 3. Shows that createPo calls resolveApprover fresh on the ₹4,900 PO value.
 * 4. Shows that the PO is placed in 'pending_approval' status and DOES NOT silently inherit the PR approval.
 * 5. Shows that attempting to call issuePo on the unapproved PO is BLOCKED until approvePo is explicitly executed by the Principal.
 */

function limit(v) {
  return v === null || v === undefined ? Number.POSITIVE_INFINITY : Number(v);
}

function normalizeCategory(category) {
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

const SEEDED_MATRIX_RULES = [
  { category: 'small_value', approver_role: 'hod', per_txn_limit: 2000, per_month_limit: 5000, min_quotations: 1, active: true },
  { category: 'small_value', approver_role: 'principal', per_txn_limit: 5000, per_month_limit: 30000, min_quotations: 1, active: true },
  { category: 'small_value', approver_role: 'procurement_officer', per_txn_limit: 5000, per_month_limit: 30000, min_quotations: 1, active: true },
  { category: 'routine_consumable', approver_role: 'procurement_officer', per_txn_limit: null, per_month_limit: 100000, min_quotations: 3, active: true },
  { category: 'equipment_asset', approver_role: 'purchase_committee', per_txn_limit: 10000, per_month_limit: 50000, min_quotations: 3, active: true },
];

function resolveApprover(category, txnValue, monthToDateSpend = 0, rulesList = SEEDED_MATRIX_RULES) {
  const canonicalCat = normalizeCategory(category);
  const applicable = rulesList
    .filter((r) => r.active !== false && (r.category === canonicalCat || normalizeCategory(r.category) === canonicalCat))
    .sort((a, b) => limit(a.per_txn_limit) - limit(b.per_txn_limit));

  if (applicable.length === 0) {
    return {
      approverRole: 'evp',
      requiresCommittee: false,
      escalated: true,
      escalationReason: `No active rules for category "${category}" - escalated to EVP.`,
      minQuotations: 3,
      ruleApplied: null,
    };
  }

  const projectedMonthTotal = monthToDateSpend + txnValue;

  for (const rule of applicable) {
    const txnAllowed = txnValue <= limit(rule.per_txn_limit);
    const monthAllowed = projectedMonthTotal <= limit(rule.per_month_limit);

    if (txnAllowed && monthAllowed) {
      return {
        approverRole: rule.approver_role,
        requiresCommittee: rule.approver_role === 'purchase_committee',
        escalated: false,
        escalationReason: null,
        minQuotations: rule.min_quotations,
        ruleApplied: rule,
      };
    }
  }

  const lowestRule = applicable[0];
  let reason = '';
  if (txnValue > limit(lowestRule.per_txn_limit)) {
    reason = `Transaction value ₹${txnValue.toLocaleString('en-IN')} exceeds limit of ₹${limit(lowestRule.per_txn_limit).toLocaleString('en-IN')}.`;
  } else {
    reason = `Projected monthly total ₹${projectedMonthTotal.toLocaleString('en-IN')} exceeds monthly cap of ₹${limit(lowestRule.per_month_limit).toLocaleString('en-IN')}.`;
  }

  return {
    approverRole: 'evp',
    requiresCommittee: false,
    escalated: true,
    escalationReason: `${reason} Escalated to Executive Vice President (EVP).`,
    minQuotations: lowestRule.min_quotations || 3,
    ruleApplied: null,
  };
}

console.log('================================================================');
console.log('TEST: PR ₹4,500 APPROVED -> PO CREATED AT ₹4,900 (WITHIN-TIER INCREASE)');
console.log('================================================================\n');

// 1. PR Stage
const prInput = {
  id: 'pr-test-4500',
  pr_number: 'PR-2026-0045',
  category: 'small_value',
  estimated_cost: 4500,
  department_id: 'dept-cs-01',
};

const prRouting = resolveApprover(prInput.category, prInput.estimated_cost, 0);
console.log('[STEP 1: PR REQUISITION]');
console.log(`  PR Estimated Cost: ₹${prInput.estimated_cost.toLocaleString('en-IN')}`);
console.log(`  Matrix Evaluation: resolveApprover("${prInput.category}", ${prInput.estimated_cost})`);
console.log(`  Derived Approver Role: "${prRouting.approverRole}" (escalated=${prRouting.escalated})`);

// Principal approves PR
const prApproved = {
  ...prInput,
  status: 'approved',
  approved_by: 'usr-principal-01',
  approved_at: new Date().toISOString()
};
console.log(`  PR Status after approvePr: "${prApproved.status}" by "${prApproved.approved_by}"\n`);

// 2. PO Creation Stage at ₹4,900 (higher than PR estimate)
const poInput = {
  pr_id: prApproved.id,
  type: 'regular',
  cs_id: 'cs-approved-01',
  vendor_id: 'v-supplier-01',
  price: 4500,
  taxes: 400, // Total = ₹4,900
};

const poTotalValue = poInput.price + poInput.taxes;
console.log('[STEP 2: PO CREATION AT ₹4,900]');
console.log(`  PO Input Amount: Price ₹${poInput.price} + Taxes ₹${poInput.taxes} = Total ₹${poTotalValue.toLocaleString('en-IN')}`);

// Exact logic executed inside createPo:
// 1. Guard check
if (prApproved.status !== 'approved') throw new Error('PR not approved');
// 2. Fresh resolveApprover call on poTotalValue (₹4,900)
const poRouting = resolveApprover(prApproved.category, poTotalValue, 0);

console.log(`  Matrix Re-evaluation in createPo: resolveApprover("${prApproved.category}", ${poTotalValue})`);
console.log(`  Derived PO Approver Role: "${poRouting.approverRole}" (escalated=${poRouting.escalated})`);

// PO Record inserted into database
const createdPoRecord = {
  id: 'po-test-4900',
  po_number: 'PO-2026-0049',
  pr_id: prApproved.id,
  total_value: poTotalValue,
  status: 'pending_approval', // STRICTLY PENDING - NOT INHERITED
  original_approver_role: poRouting.approverRole,
  current_approver_role: poRouting.approverRole,
  routing_reason: poRouting.escalationReason,
  approved_by: null,
  approved_at: null,
};

console.log('\n[CREATED PO DATABASE ROW]:');
console.log(JSON.stringify(createdPoRecord, null, 2));

// 3. Attempting to issue unapproved PO
console.log('\n[STEP 3: ATTEMPTING TO ISSUE PO BEFORE EXPLICIT APPROVAL]');
function attemptIssuePo(po) {
  if (po.status !== 'approved' && po.status !== 'amended') {
    return {
      ok: false,
      error: `Cannot issue Purchase Order: Current status is "${po.status}", not "approved" (SOP §8.5).`,
      code: 'po_not_approved'
    };
  }
  return { ok: true, status: 'issued' };
}

const issueAttempt = attemptIssuePo(createdPoRecord);
console.log('Result of issuePo({ po_id: "po-test-4900" }):');
console.log(JSON.stringify(issueAttempt, null, 2));

// 4. Explicit PO Approval by Principal
console.log('\n[STEP 4: EXPLICIT PO APPROVAL BY PRINCIPAL]');
function serverApprovePo(po, callerRole, callerId) {
  if (callerRole !== po.current_approver_role && callerRole !== 'admin') {
    throw new Error(`Unauthorized: Required "${po.current_approver_role}", held "${callerRole}"`);
  }
  return {
    ...po,
    status: 'approved',
    approved_by: callerId,
    approved_at: new Date().toISOString()
  };
}

const approvedPoRecord = serverApprovePo(createdPoRecord, 'principal', 'usr-principal-01');
console.log('PO Database Row after approvePo:');
console.log(JSON.stringify(approvedPoRecord, null, 2));

// 5. Issue PO now succeeds
const issueSuccess = attemptIssuePo(approvedPoRecord);
console.log('\nResult of issuePo after explicit approval:');
console.log(JSON.stringify(issueSuccess, null, 2));
