/**
 * Verification of Level-Aware Monthly Spend Aggregation Scopes (SOP §6, §13).
 * Run: node procurementamc/scripts/verify_spend_scope.mjs
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": new URL("../src", import.meta.url).pathname },
});

const {
  resolveApprover,
  normalizeCategory,
  AUTHORITY_MATRIX_DEFINITIONS,
  getRuleScope,
  extractSpendForScope,
} = await jiti.import("../src/lib/procurement/authorityMatrix.ts");

console.log("=== Running Level-Aware Spend Scope Verification ===");

// Baseline matrix rules mimicking DB seeded values
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
    aggregation_scope: "department",
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
    aggregation_scope: "institution",
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
    aggregation_scope: "institution",
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
    aggregation_scope: "institution",
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
    aggregation_scope: "institution",
  },
];

// Test 1: HOD tier is scoped to Department
// Scenario: High college-wide spend (₹25,000), but Department spend is low (₹1,000).
// Order value ₹1,500 should be approved by HOD because Dept spend (1000 + 1500 = 2500 <= 5000).
{
  const res = resolveApprover(
    "small_value",
    1500,
    { departmentSpend: 1000, institutionSpend: 25000 },
    rules
  );
  assert.equal(res.role, "hod", "Should route to HOD");
  assert.equal(res.escalate, false, "Should not escalate");
  assert.equal(res.appliedScope, "department", "Scope should be department");
  assert.equal(res.appliedSpend, 1000, "Applied spend should be department spend");
  console.log("✓ Test 1 Passed: HOD is scoped to department (college spend does not block dept)");
}

// Test 2: HOD tier breaches department limit
// Scenario: Order value ₹1,500, Department spend is already ₹4,000 (projected 5500 > 5000).
// Should escalate past HOD to Principal (within Principal's ₹5,000 txn and ₹30,000 month limit).
{
  const res = resolveApprover(
    "small_value",
    1500,
    { departmentSpend: 4000, institutionSpend: 10000 },
    rules
  );
  assert.equal(res.role, "principal", "Should escalate to Principal when HOD dept monthly cap is breached");
  assert.equal(res.escalate, false, "Within Principal limits");
  assert.equal(res.appliedScope, "institution", "Principal scope is institution");
  console.log("✓ Test 2 Passed: HOD department breach correctly escalates to Principal");
}

// Test 3: Central Procurement Officer is scoped to Institution-Wide spend
// Scenario: Routine Consumables PO order of ₹20,000.
// Department spend is only ₹2,000, but Institution MTD spend is ₹85,000 (projected 105,000 > 100,000).
// Should escalate to EVP because institutional cap of ₹1,00,000 is breached!
{
  const res = resolveApprover(
    "routine_consumable",
    20000,
    { departmentSpend: 2000, institutionSpend: 85000 },
    rules
  );
  assert.equal(res.role, "evp", "Should escalate to EVP on institutional monthly cap breach");
  assert.equal(res.escalate, true, "Escalate flag must be true");
  assert.match(res.reason, /exceeds the monthly cap of ₹1,00,000/);
  console.log("✓ Test 3 Passed: Central PO respects institution-wide cap across all departments");
}

// Test 4: Purchase Committee Equipment / Asset is scoped to Institution-Wide spend
// Scenario: Equipment PR of ₹8,000.
// Institution spend is ₹45,000 (projected 53,000 > 50,000).
// Should escalate to EVP.
{
  const res = resolveApprover(
    "equipment_asset",
    8000,
    { departmentSpend: 500, institutionSpend: 45000 },
    rules
  );
  assert.equal(res.role, "evp", "Should escalate to EVP when Purchase Committee monthly cap is breached");
  assert.equal(res.escalate, true, "Escalate flag must be true");
  console.log("✓ Test 4 Passed: Purchase Committee central cap enforced institution-wide");
}

// Test 5: Backward compatibility with raw number
{
  const res = resolveApprover("small_value", 1500, 1000, rules);
  assert.equal(res.role, "hod");
  assert.equal(res.escalate, false);
  console.log("✓ Test 5 Passed: Backward compatibility with numeric spend preserved");
}

// Test 6: Authority Matrix Tier Definitions contain scope metadata
{
  const hodTier = AUTHORITY_MATRIX_DEFINITIONS.find((t) => t.id === "small_value_hod");
  assert.equal(hodTier.aggregationScope, "department");
  assert.equal(hodTier.aggregationScopeFormatted, "Per Department");

  const poTier = AUTHORITY_MATRIX_DEFINITIONS.find((t) => t.id === "routine_consumables");
  assert.equal(poTier.aggregationScope, "institution");
  assert.equal(poTier.aggregationScopeFormatted, "Institution-wide");
  console.log("✓ Test 6 Passed: AUTHORITY_MATRIX_DEFINITIONS holds UI aggregation scopes");
}

console.log("\nALL LEVEL-AWARE SPEND SCOPE TESTS PASSED (6/6)!\n");
