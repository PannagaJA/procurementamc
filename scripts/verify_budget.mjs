/**
 * Budget arithmetic (src/lib/procurement/budgetLedger.ts), against the real module.
 * Run: node scripts/verify_budget.mjs
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": new URL("../src", import.meta.url).pathname },
});
const {
  headTotals,
  isOverBudget,
  poOutstanding,
  financialYear,
  fyQuarter,
  quarterlyVariance,
  headCode,
} = await jiti.import("../src/lib/procurement/budgetLedger.ts");

const c = (amount, po = "po1", created_at) => ({
  entry_type: "commit",
  amount,
  po_id: po,
  created_at,
});
const s = (amount, po = "po1", created_at) => ({
  entry_type: "spend",
  amount,
  po_id: po,
  created_at,
});
const r = (amount, po = "po1", created_at) => ({
  entry_type: "release",
  amount,
  po_id: po,
  created_at,
});

// A head's life: PO issued 40k, amended up 5k, paid 30k, closed (rest released)
assert.deepEqual(headTotals(100000, []), {
  allocated: 100000,
  committed: 0,
  spent: 0,
  balance: 100000,
});
assert.deepEqual(headTotals(100000, [c(40000)]), {
  allocated: 100000,
  committed: 40000,
  spent: 0,
  balance: 60000,
});
assert.deepEqual(headTotals(100000, [c(40000), c(5000)]).balance, 55000, "amendment increase");
assert.deepEqual(
  headTotals(100000, [c(40000), c(5000), s(30000)]),
  { allocated: 100000, committed: 15000, spent: 30000, balance: 55000 },
  "payment moves committed to spent; balance unchanged",
);
assert.deepEqual(
  headTotals(100000, [c(40000), c(5000), s(30000), r(15000)]),
  { allocated: 100000, committed: 0, spent: 30000, balance: 70000 },
  "closing releases what wasn't paid",
);
// Short-pay with deductions (#32): approved 2,000 of a 2,500 invoice on a 2,500 PO
assert.equal(headTotals(10000, [c(2500), s(2000), r(500)]).balance, 8000);
// String amounts from Postgres numeric
assert.equal(headTotals("5000.00", [c("1200.50")]).balance, 3799.5);
// Over budget: an EVP-approved commit can push the balance negative
assert.equal(headTotals(1000, [c(1500)]).balance, -500);

// Section B "Is budget available?" (Rs. 1 tolerance)
assert.equal(isOverBudget(5000, 5000), false);
assert.equal(isOverBudget(5000, 5001), false, "within Rs. 1");
assert.equal(isOverBudget(5000, 5001.5), true);
assert.equal(isOverBudget(0, 1670), true, "no balance left");
assert.equal(isOverBudget(-500, 1), true, "already overdrawn");

// What one PO still holds (for release on close)
const entries = [c(40000, "a"), c(9000, "b"), s(30000, "a"), r(1000, "b")];
assert.equal(poOutstanding(entries, "a"), 10000);
assert.equal(poOutstanding(entries, "b"), 8000);
assert.equal(poOutstanding(entries, "none"), 0);

// Indian financial year (April–March) and quarters
assert.equal(financialYear(new Date("2026-10-22")), "2026-27");
assert.equal(financialYear(new Date("2027-03-31")), "2026-27");
assert.equal(financialYear(new Date("2027-04-01")), "2027-28");
assert.equal(financialYear(new Date("2099-12-01")), "2099-00");
assert.equal(fyQuarter(new Date("2026-04-01")), 1);
assert.equal(fyQuarter(new Date("2026-09-30")), 2);
assert.equal(fyQuarter(new Date("2026-12-31")), 3);
assert.equal(fyQuarter(new Date("2027-01-15")), 4);

// Quarterly review: committed/spent/released per quarter vs a straight-line plan
const q = quarterlyVariance(100000, [
  c(40000, "a", "2026-05-10"),
  s(30000, "a", "2026-08-01"),
  r(10000, "a", "2026-11-02"),
]);
assert.deepEqual(
  q.map((x) => [x.quarter, x.planned, x.committed, x.spent, x.released, x.net]),
  [
    [1, 25000, 40000, 0, 0, 40000],
    [2, 25000, 0, 30000, 0, 0],
    [3, 25000, 0, 0, 10000, -10000],
    [4, 25000, 0, 0, 0, 0],
  ],
);

// Head codes
assert.equal(
  headCode("Computer Science & Engineering", "equipment_asset", "2026-27"),
  "CSE-EQUIPMENTASSET-202627",
);
assert.equal(
  headCode("Electronics and Communication", "small_value", "2026-27"),
  "EC-SMALLVALUE-202627",
);
assert.equal(headCode("", "software", "2026-27"), "DEPT-SOFTWARE-202627");

console.log("budget: all checks passed");
