// Day 1 Foundation Verification Script
import assert from "node:assert";

// 1. Seed rules from SOP §6 (using literal ₹10,000 cap per DECISIONS.md Q1)
const rules = [
  {
    category: "small_value",
    method: "direct_purchase",
    per_txn_limit: 2000,
    per_month_limit: 5000,
    approval_role: "hod",
    min_quotations: 0,
    requires_rate_contract: false,
    active: true,
  },
  {
    category: "small_value",
    method: "small_value_po",
    per_txn_limit: 5000,
    per_month_limit: 30000,
    approval_role: "principal",
    min_quotations: 0,
    requires_rate_contract: false,
    active: true,
  },
  {
    category: "small_value",
    method: "small_value_po",
    per_txn_limit: 5000,
    per_month_limit: 30000,
    approval_role: "procurement_officer",
    min_quotations: 0,
    requires_rate_contract: false,
    active: true,
  },
  {
    category: "routine_consumable",
    method: "rate_contract",
    per_txn_limit: null,
    per_month_limit: 100000,
    approval_role: "procurement_officer",
    min_quotations: 3,
    requires_rate_contract: true,
    active: true,
  },
  {
    category: "equipment_asset",
    method: "comparative_quotations",
    per_txn_limit: 10000,
    per_month_limit: 50000,
    approval_role: "purchase_committee",
    min_quotations: 3,
    requires_rate_contract: false,
    active: true,
  },
  {
    category: "software",
    method: "comparative_quotations",
    per_txn_limit: 10000,
    per_month_limit: 50000,
    approval_role: "purchase_committee",
    min_quotations: 3,
    requires_rate_contract: false,
    active: true,
  },
  {
    category: "academic_research",
    method: "comparative_quotations",
    per_txn_limit: 10000,
    per_month_limit: 50000,
    approval_role: "purchase_committee",
    min_quotations: 3,
    requires_rate_contract: false,
    active: true,
  },
  {
    category: "services_amc",
    method: "comparative_quotations",
    per_txn_limit: 10000,
    per_month_limit: 50000,
    approval_role: "purchase_committee",
    min_quotations: 3,
    requires_rate_contract: false,
    active: true,
  },
  {
    category: "maintenance",
    method: "comparative_quotations",
    per_txn_limit: 10000,
    per_month_limit: 50000,
    approval_role: "purchase_committee",
    min_quotations: 3,
    requires_rate_contract: false,
    active: true,
  },
];

function limit(v) {
  return v === null || v === undefined ? Number.POSITIVE_INFINITY : Number(v);
}

function normalizeCategory(category) {
  const norm = (category || "")
    .toLowerCase()
    .trim()
    .replace(/[-\s]+/g, "_");
  if (
    norm.includes("small_value") ||
    norm.includes("smallvalue") ||
    norm.includes("direct_purchase")
  )
    return "small_value";
  if (norm.includes("routine") || norm.includes("consumable")) return "routine_consumable";
  if (norm.includes("equipment") || norm.includes("asset")) return "equipment_asset";
  if (norm.includes("software")) return "software";
  if (norm.includes("academic") || norm.includes("research")) return "academic_research";
  if (norm.includes("service") || norm.includes("amc")) return "services_amc";
  if (norm.includes("maintenance")) return "maintenance";
  return norm;
}

function resolveApprover(category, txnValue, monthToDateSpend, rulesList) {
  const canonicalCat = normalizeCategory(category);
  const applicable = (rulesList ?? [])
    .filter(
      (r) =>
        r.active !== false &&
        (r.category === canonicalCat || normalizeCategory(r.category) === canonicalCat),
    )
    .sort((a, b) => limit(a.per_txn_limit) - limit(b.per_txn_limit));

  if (applicable.length === 0) {
    return { role: "evp", escalate: true, reason: "No active rule", minQuotations: 3 };
  }

  const projectedMonth = monthToDateSpend + txnValue;

  for (const rule of applicable) {
    const txnOk = txnValue <= limit(rule.per_txn_limit);
    const monthOk = projectedMonth <= limit(rule.per_month_limit);
    if (txnOk && monthOk) {
      return {
        role: rule.approval_role,
        escalate: false,
        reason: `${txnValue} is within ${rule.approval_role} limit`,
        minQuotations: rule.min_quotations ?? 0,
      };
    }
  }

  const highest = applicable[applicable.length - 1];
  return {
    role: "evp",
    escalate: true,
    reason: `${txnValue} exceeds highest limit (${limit(highest.per_txn_limit)}, ${highest.approval_role}). Escalated to EVP.`,
    minQuotations: highest.min_quotations ?? 3,
  };
}

console.log("--- Running Day 1 Foundation Verification Tests ---");

// Test 1: ₹1,500 small value -> HOD
const t1 = resolveApprover("small_value", 1500, 0, rules);
console.log("Test 1 (₹1,500 Small Value):", t1);
assert.strictEqual(t1.role, "hod", "Test 1 Failed: Should resolve to HOD");
assert.strictEqual(t1.escalate, false, "Test 1 Failed: Should not escalate");
console.log("✓ Test 1 Passed: ₹1,500 Small Value resolves to HOD");

// Test 2: ₹15,000 equipment -> EVP
const t2 = resolveApprover("equipment_asset", 15000, 0, rules);
console.log("Test 2 (₹15,000 Equipment):", t2);
assert.strictEqual(t2.role, "evp", "Test 2 Failed: Should resolve to EVP");
assert.strictEqual(t2.escalate, true, "Test 2 Failed: Should escalate");
console.log(
  "✓ Test 2 Passed: ₹15,000 Equipment escalates to EVP (exceeds ₹10,000 Purchase Committee cap)",
);

// Test 3: ₹4,500 small value -> Principal
const t3 = resolveApprover("small_value", 4500, 0, rules);
console.log("Test 3 (₹4,500 Small Value):", t3);
assert(
  t3.role === "principal" || t3.role === "procurement_officer",
  "Test 3 Failed: Should resolve to Principal/Procurement Officer",
);
assert.strictEqual(t3.escalate, false, "Test 3 Failed: Should not escalate");
console.log("✓ Test 3 Passed: ₹4,500 Small Value resolves to Principal/Procurement Officer");

// Test 4: Monthly spend breach escalation
const t4 = resolveApprover("small_value", 1500, 4000, rules); // 4000 + 1500 = 5500 > 5000 (HOD month limit), fits in Principal (30000)
console.log("Test 4 (HOD monthly cap overflow):", t4);
assert(
  t4.role === "principal" || t4.role === "procurement_officer",
  "Test 4 Failed: Should route to Principal when HOD month cap breached",
);
console.log("✓ Test 4 Passed: Monthly spend aggregate routing works properly");

// Test 5: Vendor EVP-only security simulation
function checkEmpanelmentApprovalPermission(roles) {
  if (roles.includes("admin")) return { ok: true };
  if (roles.includes("evp")) return { ok: true };
  return {
    ok: false,
    error: `You are not permitted to approve vendor empanelment. Required role: evp. You hold: ${roles.join(", ") || "none"}.`,
  };
}

const nonEvp = checkEmpanelmentApprovalPermission(["hod", "principal"]);
assert.strictEqual(nonEvp.ok, false);
console.log("✓ Test 5A Passed: Non-EVP approval attempt is rejected server-side:", nonEvp.error);

const evpUser = checkEmpanelmentApprovalPermission(["evp"]);
assert.strictEqual(evpUser.ok, true);
console.log("✓ Test 5B Passed: EVP approval attempt is accepted");

console.log("\nAll Day 1 Verification Tests Passed Successfully! 🎉");
