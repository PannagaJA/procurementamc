/**
 * Emergency procurement rules (src/lib/procurement/emergencyCap.ts), against the real module.
 * One ₹10,00,000 counter for the register and emergency PRs; emergency PO total ≤ EVP approval.
 * Run: node scripts/verify_emergency.mjs
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": new URL("../src", import.meta.url).pathname },
});
const { emergencyUsed, emergencyPoTotalError } = await jiti.import(
  "../src/lib/procurement/emergencyCap.ts",
);

const CAP = 1000000;
const pr = (id, estimated_value, status = "approved") => ({ id, estimated_value, status });

// Register total plus emergency PRs raised through Raise PR
assert.equal(
  emergencyUsed({
    registerTotal: 120000,
    emergencyPrs: [pr("a", 8000), pr("b", "2000.50")],
    linkedPrIds: [],
  }),
  130000.5,
);

// A register entry's backing PR is already in the ledger: not counted twice
assert.equal(
  emergencyUsed({
    registerTotal: 50000,
    emergencyPrs: [pr("backing", 50000)],
    linkedPrIds: ["backing"],
  }),
  50000,
);

// Rejected and archived PRs don't use the limit; submitted ones do
assert.equal(
  emergencyUsed({
    registerTotal: 0,
    emergencyPrs: [
      pr("r", 9000, "rejected"),
      pr("x", 9000, "archived"),
      pr("s", 4000, "submitted"),
    ],
    linkedPrIds: new Set(),
  }),
  4000,
);

// Empty year, missing ledger row
assert.equal(emergencyUsed({ registerTotal: null, emergencyPrs: [], linkedPrIds: [] }), 0);

// Exactly the cap is allowed; one rupee over is not (callers compare used + new ≤ cap)
const used = emergencyUsed({ registerTotal: 990000, emergencyPrs: [], linkedPrIds: [] });
assert.ok(used + 10000 <= CAP);
assert.ok(!(used + 10001 <= CAP));

// Emergency PO total against the EVP-approved cost (₹1 tolerance, as elsewhere)
assert.equal(emergencyPoTotalError(10000, 10000), null);
assert.equal(emergencyPoTotalError(10000, 10001), null);
assert.match(emergencyPoTotalError(10000, 10001.01), /more than the EVP approved/);
assert.match(emergencyPoTotalError(10000, 0), /quantity and price/);
assert.equal(emergencyPoTotalError(10000, 4500), null);

console.log("verify_emergency: all checks passed");
