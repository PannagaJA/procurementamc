/**
 * Three-way match + GRN valuation checks against the real src modules (not a copy).
 * Run: node scripts/verify_three_way_match.mjs
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": new URL("../src", import.meta.url).pathname } });
const { evaluateThreeWayMatch, normalizeInvoiceNumber } = await jiti.import("../src/lib/procurement/threeWayMatch.ts");
const { poUnitRate } = await jiti.import("../src/lib/procurement/poRates.ts");

const ctx = (o) => ({ poTotal: 1500, acceptedGrnTotal: 1500, otherInvoiced: 0, serviceException: false, ...o });
const status = (c, amt) => evaluateThreeWayMatch(ctx(c), amt).matchStatus;

// Matching
assert.equal(status({}, 1500), "matched", "exact PO/GRN/invoice");
assert.equal(status({}, 1501), "matched", "within Rs. 1 tolerance");
assert.equal(status({}, 1600), "on_hold", "invoice above PO");
assert.equal(status({ acceptedGrnTotal: 1000 }, 1500), "on_hold", "invoice above goods accepted (partial delivery)");
assert.equal(status({ acceptedGrnTotal: 0 }, 1500), "on_hold", "no accepted GRN");
assert.equal(status({}, 0), "on_hold", "zero invoice");
// Cumulative: PO-2026-1018 had a second Rs. 1,500 invoice for the same Rs. 1,500 GRN
assert.equal(status({ otherInvoiced: 1500 }, 1500), "on_hold", "second invoice for already-billed goods");
assert.equal(status({ poTotal: 3000, acceptedGrnTotal: 3000, otherInvoiced: 1500 }, 1500), "matched", "two partial invoices");
// PO-2026-1002: Rs. 3,200 invoice on a PO amended down to Rs. 3,150
assert.equal(status({ poTotal: 3150, acceptedGrnTotal: 3200 }, 3200), "on_hold", "invoice above amended PO");
// Service exception skips the GRN but never the PO cap
assert.equal(status({ acceptedGrnTotal: 0, serviceException: true }, 1500), "matched", "service with certificate");
assert.equal(status({ acceptedGrnTotal: 0, serviceException: true }, 1600), "on_hold", "service above PO");

// Duplicate invoice numbers
assert.equal(normalizeInvoiceNumber("​INV-LEN-2026-0045"), normalizeInvoiceNumber("inv-len-2026-0045​ "));

// GRN valuation at PO rates — PO-2026-1017: 15 monitors quoted at Rs. 14,000 + Rs. 37,800 GST = Rs. 2,47,800
const po1017 = { total_value: 247800, quoted_lines: [{ description: "Monitors", quantity: 15, total_price: 247800 }] };
assert.equal(poUnitRate(po1017, "Monitors") * 15, 247800, "full acceptance values exactly the PO total");
assert.equal(poUnitRate(po1017, "Monitors"), 16520, "rate includes the line's tax share");
// PR-line fallback scaled to the PO total — PO-2026-1020: books 10 x 120 + paper 1000 x 0.5 = 1,700
const po1020 = {
  total_value: 1700,
  purchase_requisitions: {
    pr_line_items: [
      { description: "books", net_qty_to_procure: 10, est_unit_price: 120 },
      { description: "paper", net_qty_to_procure: 1000, est_unit_price: 0.5 },
    ],
  },
};
assert.equal(poUnitRate(po1020, "books") * 10 + poUnitRate(po1020, "paper") * 1000, 1700);
// PO priced above the PR estimate: rates scale up so the GRN still reaches the PO total
assert.equal(poUnitRate({ ...po1020, total_value: 3400 }, "books"), 240);

console.log("three-way match: all checks passed");
