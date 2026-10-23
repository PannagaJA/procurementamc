/**
 * Three-way match + GRN valuation checks against the real src modules (not a copy).
 * Run: node scripts/verify_three_way_match.mjs
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": new URL("../src", import.meta.url).pathname },
});
const {
  evaluateThreeWayMatch,
  normalizeInvoiceNumber,
  deviationEligible,
  validateDeductions,
  DEFAULT_MATCH_TOLERANCE,
  isOrderSettled,
} = await jiti.import("../src/lib/procurement/threeWayMatch.ts");
const { poUnitRate } = await jiti.import("../src/lib/procurement/poRates.ts");

const ctx = (o) => ({
  poTotal: 1500,
  acceptedGrnTotal: 1500,
  otherInvoiced: 0,
  serviceException: false,
  ...o,
});
const status = (c, amt) => evaluateThreeWayMatch(ctx(c), amt).matchStatus;

// Matching
assert.equal(status({}, 1500), "matched", "exact PO/GRN/invoice");
assert.equal(status({}, 1501), "matched", "within Rs. 1 tolerance");
assert.equal(status({}, 1600), "on_hold", "invoice above PO");
assert.equal(
  status({ acceptedGrnTotal: 1000 }, 1500),
  "on_hold",
  "invoice above goods accepted (partial delivery)",
);
assert.equal(status({ acceptedGrnTotal: 0 }, 1500), "on_hold", "no accepted GRN");
assert.equal(status({}, 0), "on_hold", "zero invoice");
// Cumulative: PO-2026-1018 had a second Rs. 1,500 invoice for the same Rs. 1,500 GRN
assert.equal(
  status({ otherInvoiced: 1500 }, 1500),
  "on_hold",
  "second invoice for already-billed goods",
);
assert.equal(
  status({ poTotal: 3000, acceptedGrnTotal: 3000, otherInvoiced: 1500 }, 1500),
  "matched",
  "two partial invoices",
);
// PO-2026-1002: Rs. 3,200 invoice on a PO amended down to Rs. 3,150
assert.equal(
  status({ poTotal: 3150, acceptedGrnTotal: 3200 }, 3200),
  "on_hold",
  "invoice above amended PO",
);
// Service exception skips the GRN but never the PO cap
assert.equal(
  status({ acceptedGrnTotal: 0, serviceException: true }, 1500),
  "matched",
  "service with certificate",
);
assert.equal(
  status({ acceptedGrnTotal: 0, serviceException: true }, 1600),
  "on_hold",
  "service above PO",
);

// Hold codes and what can still be paid
const r = (c, amt) => evaluateThreeWayMatch(ctx(c), amt);
assert.equal(r({ acceptedGrnTotal: 0 }, 1500).holdCode, "no_grn");
assert.equal(r({}, 2500).holdCode, "exceeds_po");
assert.equal(r({}, 2500).payableCap, 1500, "over-billed: pay up to the PO");
assert.equal(r({ acceptedGrnTotal: 1000 }, 1500).holdCode, "exceeds_grn");
assert.equal(
  r({ acceptedGrnTotal: 1000 }, 1500).payableCap,
  1000,
  "short delivery: pay what was accepted",
);
assert.equal(
  r({ poTotal: 3000, acceptedGrnTotal: 2000, otherInvoiced: 1500 }, 1500).payableCap,
  500,
  "prior invoices use up headroom",
);
assert.equal(r({}, 0).holdCode, "zero_amount");

// EVP deviation: max(Rs. 500, 1% of the limit), never for missing goods
const tol = DEFAULT_MATCH_TOLERANCE;
const big = { poTotal: 100000, acceptedGrnTotal: 100000 };
assert.equal(
  deviationEligible(r({ poTotal: 2000, acceptedGrnTotal: 2000 }, 2010), tol),
  true,
  "Rs. 10 over a Rs. 2,000 PO",
);
assert.equal(
  deviationEligible(r({ poTotal: 2000, acceptedGrnTotal: 2000 }, 2500), tol),
  true,
  "Rs. 500 is the floor",
);
assert.equal(
  deviationEligible(r({ poTotal: 2000, acceptedGrnTotal: 2000 }, 2501.5), tol),
  false,
  "Rs. 501.5 is over",
);
assert.equal(
  deviationEligible(r({ poTotal: 2000, acceptedGrnTotal: 2000 }, 2600), tol),
  false,
  "Rs. 600 over is not eligible",
);
assert.equal(deviationEligible(r(big, 101000), tol), true, "1% of Rs. 1,00,000");
assert.equal(deviationEligible(r(big, 101002), tol), false, "just over 1%");
assert.equal(
  deviationEligible(r({ acceptedGrnTotal: 0 }, 1500), tol),
  false,
  "no GRN is never a deviation",
);
assert.equal(deviationEligible(r({}, 1500), tol), false, "a matched invoice needs no deviation");

// Deductions (short-payment)
const ok = (inv, pay, cap, d) => validateDeductions(inv, pay, cap, d);
assert.equal(ok(2500, 2000, 2000, [{ reason: "Billed above PO rate", amount: 500 }]), null);
assert.equal(
  ok(2500, 2000, 2000, [
    { reason: "Rate", amount: 300 },
    { reason: "Freight not in PO", amount: 200 },
  ]),
  null,
  "split deductions",
);
assert.match(
  ok(2500, 2100, 2000, [{ reason: "x", amount: 400 }]),
  /can't be more than/,
  "payable above cap",
);
assert.match(
  ok(2500, 2000, 2000, [{ reason: "x", amount: 400 }]),
  /add up to/,
  "deductions don't explain the gap",
);
assert.match(ok(2500, 2000, 2000, [{ reason: " ", amount: 500 }]), /reason/, "reason required");
assert.match(ok(2500, 0, 2000, []), /greater than zero/);
assert.match(ok(2000, 2000, 2000, []), /less than the invoice/);

// Duplicate invoice numbers
assert.equal(
  normalizeInvoiceNumber("​INV-LEN-2026-0045"),
  normalizeInvoiceNumber("inv-len-2026-0045​ "),
);

// GRN valuation at PO rates — PO-2026-1017: 15 monitors quoted at Rs. 14,000 + Rs. 37,800 GST = Rs. 2,47,800
const po1017 = {
  total_value: 247800,
  quoted_lines: [{ description: "Monitors", quantity: 15, total_price: 247800 }],
};
assert.equal(
  poUnitRate(po1017, "Monitors") * 15,
  247800,
  "full acceptance values exactly the PO total",
);
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

// Order settlement (BUD-48/49/50): paid in full, or fully billed with every invoice paid
const paid = (amt, approved) => ({
  invoice_amount: amt,
  approved_amount: approved ?? null,
  match_status: "paid",
});
assert.equal(isOrderSettled(1500, [paid(1500)]), true, "paid in full");
assert.equal(isOrderSettled(1500, [paid(1501)]), true, "within Rs. 1");
assert.equal(isOrderSettled(5000, [paid(3000)]), false, "part delivered and paid: stays open");
assert.equal(
  isOrderSettled(5000, [paid(5000, 4500)]),
  true,
  "billed in full, paid less after a deduction: settled",
);
assert.equal(isOrderSettled(2000, [paid(2500, 2000)]), true, "over-billed, paid the PO value");
assert.equal(
  isOrderSettled(5000, [paid(3000, 2800), { invoice_amount: 2000, match_status: "approved" }]),
  false,
  "another invoice still to be paid",
);
assert.equal(
  isOrderSettled(5000, [paid(3000), { invoice_amount: 2000, match_status: "returned" }]),
  false,
);
assert.equal(isOrderSettled(5000, []), false);

console.log("three-way match: all checks passed");
