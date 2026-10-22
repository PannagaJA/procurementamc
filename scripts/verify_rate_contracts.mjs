/**
 * Rate contract rules (src/lib/procurement/rateContracts.ts), real module.
 * Run: node scripts/verify_rate_contracts.mjs
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": new URL("../src", import.meta.url).pathname },
});
const { rankRateQuotes, rateContractValidity, isActiveRateContract, contractRates } =
  await jiti.import("../src/lib/procurement/rateContracts.ts");

const items = [
  { group: "stationery", description: "A4 paper", unit: "ream" },
  { group: "printing", description: "Toner 88A", unit: "nos" },
];
const q = (vendor_id, rate_item_no, unit_price) => ({ vendor_id, rate_item_no, unit_price });
const full = [
  q("apex", 0, 230),
  q("apex", 1, 1800),
  q("bharat", 0, 245),
  q("bharat", 1, 1750),
  q("classic", 0, 260),
  q("classic", 1, 1900),
];

// Three complete quotes: ranked cheapest first by total of unit rates
let r = rankRateQuotes(items, full);
assert.equal(r.ok, true);
assert.deepEqual(
  r.ranked.map((x) => [x.vendor_id, x.total]),
  [
    ["bharat", 1995],
    ["apex", 2030],
    ["classic", 2160],
  ],
);
assert.deepEqual(r.ranked[0].rates, [245, 1750]);

// Only two vendors → blocked
r = rankRateQuotes(items, full.filter((l) => l.vendor_id !== "classic"));
assert.equal(r.ok, false);
assert.match(r.error, /at least 3 complete quotations/);

// A vendor who skipped an item doesn't count
r = rankRateQuotes(items, [...full.filter((l) => !(l.vendor_id === "classic" && l.rate_item_no === 1))]);
assert.equal(r.ok, false);
// ...nor does a zero rate, or a line with no item number
r = rankRateQuotes(items, [
  ...full.filter((l) => l.vendor_id !== "classic"),
  q("classic", 0, 260),
  q("classic", 1, 0),
  q("delta", null, 100),
]);
assert.equal(r.ok, false);
// Four complete quotes is fine
r = rankRateQuotes(items, [...full, q("delta", 0, 200), q("delta", 1, 1700)]);
assert.equal(r.ok, true);
assert.equal(r.ranked[0].vendor_id, "delta");
// No items → error
assert.equal(rankRateQuotes([], full).ok, false);

// Validity: after start, at most six months
assert.equal(rateContractValidity("2026-10-22", "2027-04-22"), null);
assert.match(rateContractValidity("2026-10-22", "2027-04-23"), /six months/);
assert.match(rateContractValidity("2026-10-22", "2026-10-22"), /end after it starts/);
assert.match(rateContractValidity("2026-10-22", ""), /end after it starts/);

// Only approved contracts inside their window are active
const rc = { valid_from: "2026-10-01", valid_to: "2027-03-31" };
assert.equal(isActiveRateContract({ ...rc, status: "active" }, "2026-11-15"), true);
assert.equal(isActiveRateContract({ ...rc, status: "pending_approval" }, "2026-11-15"), false);
assert.equal(isActiveRateContract({ ...rc, status: "rejected" }, "2026-11-15"), false);
assert.equal(isActiveRateContract({ ...rc, status: "active" }, "2027-04-01"), false, "expired");
assert.equal(isActiveRateContract({ ...rc, status: null }, "2026-11-15"), false);

// Contract rate lines keep the group so coveringContracts can match them
assert.deepEqual(contractRates(items, [245, 1750]), [
  { group: "stationery", description: "A4 paper", unit: "ream", rate: 245 },
  { group: "printing", description: "Toner 88A", unit: "nos", rate: 1750 },
]);

console.log("rate contracts: all checks passed");
