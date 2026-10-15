/** Pure three-way match logic (PO total vs accepted GRN value vs invoices). No DB access. */
/** Invoice statuses that count against the PO/GRN value (on_hold/pending can't be paid without re-matching). */
export const LIVE_INVOICE_STATUSES = ["matched", "approved", "paid"];
/** PR categories that are services, where a completion certificate stands in for a GRN. */
export const SERVICE_CATEGORIES = ["services_amc", "maintenance"];
const TOLERANCE = 1; // Rs. 1 rounding tolerance

/** Strip invisible characters and case so "INV-1", "inv-1" and "INV-1\u200B" are the same invoice. */
export function normalizeInvoiceNumber(n: unknown): string {
  return String(n ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toUpperCase();
}

export type MatchContext = {
  poTotal: number;
  /** Sum of accepted value across all accepted / partially accepted GRNs on the PO. */
  acceptedGrnTotal: number;
  /** Sum of the PO's other invoices that are matched, approved or paid. */
  otherInvoiced: number;
  /** True only when the PO is for services AND a completion certificate is attached. */
  serviceException: boolean;
};

const inr = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;

/**
 * Three-way match, cumulative: this invoice plus every other live invoice on the PO must not
 * exceed what was received (accepted GRN value) or what was ordered (PO total).
 */
export function evaluateThreeWayMatch(
  ctx: MatchContext,
  invoiceAmount: number,
): { matchStatus: "matched" | "on_hold"; holdReason: string | null } {
  const inv = Number(invoiceAmount) || 0;
  const billed = ctx.otherInvoiced + inv;
  const already =
    ctx.otherInvoiced > 0 ? ` (including ${inr(ctx.otherInvoiced)} already invoiced)` : "";

  if (inv <= 0)
    return { matchStatus: "on_hold", holdReason: "Invoice amount must be greater than zero." };

  if (billed > ctx.poTotal + TOLERANCE) {
    return {
      matchStatus: "on_hold",
      holdReason: `Total billed ${inr(billed)}${already} exceeds the purchase order value of ${inr(ctx.poTotal)}.`,
    };
  }
  if (ctx.serviceException) return { matchStatus: "matched", holdReason: null };

  if (ctx.acceptedGrnTotal <= 0) {
    return {
      matchStatus: "on_hold",
      holdReason: "No accepted goods receipt (GRN) for this purchase order yet.",
    };
  }
  if (billed > ctx.acceptedGrnTotal + TOLERANCE) {
    return {
      matchStatus: "on_hold",
      holdReason: `Total billed ${inr(billed)}${already} exceeds the value of goods accepted so far (${inr(ctx.acceptedGrnTotal)}).`,
    };
  }
  return { matchStatus: "matched", holdReason: null };
}
