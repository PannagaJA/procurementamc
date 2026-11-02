/**
 * Vendor quote lines (src/lib/procurement/quoteLines.ts), against the real module:
 * unit price × PR quantity per line, GST split by line value (DECISIONS Q17).
 * Run: node scripts/verify_quote_lines.mjs
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": new URL("../src", import.meta.url).pathname },
});
const { buildQuoteLines, quoteLineError, prLineQty } = await jiti.import(
  "../src/lib/procurement/quoteLines.ts",
);

const laptop = { id: "l", description: "Laptop", unit: "nos", net_qty_to_procure: 1 };
const mouse = { id: "m", description: "Mouse", unit: "nos", net_qty_to_procure: 10 };
const price = (pr_line_item_id, unit_price) => ({ pr_line_item_id, unit_price });

// Each line is unit price × its own quantity; GST split by line value (not equally)
const q = buildQuoteLines([laptop, mouse], [price("l", 50000), price("m", 500)], 9900);
assert.deepEqual(
  q.rows.map((r) => [r.quantity, r.unit_price, r.amount, r.tax_amount, r.total_price]),
  [
    [1, 50000, 50000, 9000, 59000],
    [10, 500, 5000, 900, 5900],
  ],
);
assert.equal(q.subtotal, 55000);
assert.equal(q.total, 64900);

// Rounding: the remainder lands on the last line, so the taxes add up exactly
const three = ["a", "b", "c"].map((id) => ({ id, description: id, net_qty_to_procure: 1 }));
const r = buildQuoteLines(
  three,
  three.map((l) => price(l.id, 100)),
  100,
);
assert.deepEqual(
  r.rows.map((x) => x.tax_amount),
  [33.33, 33.33, 33.34],
);
assert.equal(r.total, 400);

// Quantity falls back to qty_required, then 1; prices can arrive as strings
assert.equal(prLineQty({ id: "x", description: "x", net_qty_to_procure: 0, qty_required: 4 }), 4);
assert.equal(prLineQty({ id: "x", description: "x" }), 1);
assert.equal(buildQuoteLines([mouse], [price("m", "12.5")], 0).total, 125);

// No GST is fine; a missing or zero price and negative GST are refused
assert.equal(quoteLineError([laptop, mouse], [price("l", 1), price("m", 1)], 0), null);
assert.match(quoteLineError([laptop, mouse], [price("l", 50000)], 0), /"Mouse"/);
assert.match(quoteLineError([laptop], [price("l", 0)], 0), /"Laptop"/);
assert.match(quoteLineError([laptop], [price("l", 1)], -5), /negative/);

console.log("quote lines: all checks passed");
