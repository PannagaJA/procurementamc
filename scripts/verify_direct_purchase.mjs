/**
 * Direct purchase (SOP) checks against the real src modules: rate-contract coverage by item
 * group, and role access used by the sidebar / Procurement Hub.
 * Run: node scripts/verify_direct_purchase.mjs
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": new URL("../src", import.meta.url).pathname } });
const { coveringContracts, ITEM_GROUPS } = await jiti.import("../src/lib/procurement/itemGroups.ts");
const { procurementAccess } = await jiti.import("../src/lib/procurementAccess.ts");

const today = "2026-10-16";
const rc = (n, from, to, groups) => ({
  contract_number: n,
  valid_from: from,
  valid_to: to,
  approved_rates_json: groups.map((group) => ({ description: "x", unit: "pcs", rate: 1, group })),
});
const contracts = [
  rc("RC-ACTIVE", "2026-10-01", "2027-03-31", ["stationery", "printing"]),
  rc("RC-EXPIRED", "2026-01-01", "2026-06-30", ["housekeeping"]),
  rc("RC-FUTURE", "2026-11-01", "2027-04-30", ["pantry"]),
  { contract_number: "RC-LEGACY", valid_from: "2026-01-01", valid_to: "2030-01-01", approved_rates_json: [{ description: "books" }] },
];

// Coverage: only an active contract that lists the group covers it.
assert.equal(coveringContracts(["stationery"], contracts, today).stationery?.contract_number, "RC-ACTIVE");
assert.deepEqual(coveringContracts(["housekeeping"], contracts, today), {}, "expired contract doesn't cover");
assert.deepEqual(coveringContracts(["pantry"], contracts, today), {}, "not-yet-valid contract doesn't cover");
assert.deepEqual(coveringContracts(["it_electrical"], contracts, today), {}, "no contract for the group → direct purchase allowed");
assert.deepEqual(coveringContracts(["not_consumable", ""], contracts, today), {}, "non-consumables never covered");
assert.deepEqual(Object.keys(coveringContracts(["printing", "lab", "stationery"], contracts, today)).sort(), ["printing", "stationery"]);
assert.deepEqual(coveringContracts(["academic"], contracts, today), {}, "untagged legacy rate lines don't block");
assert.equal(coveringContracts(["stationery"], contracts, "2027-03-31").stationery?.contract_number, "RC-ACTIVE", "valid through its last day");
assert.equal(ITEM_GROUPS.length, 10, "9 SOP consumable groups + not_consumable");

// Access: purchase committee can reach My Approvals (approves CS); stores can open the Hub.
const access = (...roles) => procurementAccess((r) => roles.includes(r));
assert.equal(access("purchase_committee").approvals, true);
assert.equal(access("stores").hub, true);
assert.equal(access("finance").rfqs, false, "finance doesn't see RFQs");
assert.equal(access("librarian").any, false, "non-procurement role sees no procurement section");

console.log("direct purchase: all checks passed");
