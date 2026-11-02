/**
 * Vendor quotation lines for a PR-based RFQ: a unit price per PR line (before GST), times the PR's
 * quantity, plus one GST amount spread over the lines in proportion to their value (DECISIONS Q17).
 * Pure — shared by the vendor page (live total) and the server (authoritative).
 */
export type QuotePrLine = {
  id: string;
  description: string;
  unit?: string | null;
  net_qty_to_procure?: number | string | null;
  qty_required?: number | string | null;
};
export type QuotePrice = { pr_line_item_id: string; unit_price: number | string | null };

const paise = (n: number) => Math.round(n * 100) / 100;
export const prLineQty = (l: QuotePrLine) =>
  Number(l.net_qty_to_procure) || Number(l.qty_required) || 1;

const priceFor = (prices: QuotePrice[], id: string) =>
  Number(prices.find((p) => p.pr_line_item_id === id)?.unit_price) || 0;

/** Why these prices can't be submitted, or null. */
export function quoteLineError(
  prLines: QuotePrLine[],
  prices: QuotePrice[],
  gst: number | string | null | undefined,
): string | null {
  const missing = prLines.find((l) => !(priceFor(prices, l.id) > 0));
  if (missing) return `Enter a unit price greater than 0 for "${missing.description}".`;
  if (!(Number(gst ?? 0) >= 0)) return "GST / taxes can't be negative.";
  return null;
}

/** One row per PR line; GST split by line value, the rounding remainder on the last line. */
export function buildQuoteLines(
  prLines: QuotePrLine[],
  prices: QuotePrice[],
  gst: number | string | null | undefined,
) {
  const base = prLines.map((l) => {
    const quantity = prLineQty(l);
    const unit_price = priceFor(prices, l.id);
    return {
      pr_line_item_id: l.id,
      description: l.description,
      unit: l.unit ?? null,
      quantity,
      unit_price,
      amount: paise(quantity * unit_price),
    };
  });
  const subtotal = paise(base.reduce((s, r) => s + r.amount, 0));
  const tax = paise(Math.max(0, Number(gst) || 0));
  let allocated = 0;
  const rows = base.map((r, i) => {
    const tax_amount =
      i === base.length - 1
        ? paise(tax - allocated)
        : subtotal
          ? paise((tax * r.amount) / subtotal)
          : 0;
    allocated = paise(allocated + tax_amount);
    return { ...r, tax_amount, total_price: paise(r.amount + tax_amount) };
  });
  return { rows, subtotal, gst: tax, total: paise(subtotal + tax) };
}
