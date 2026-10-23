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

/** Why an invoice is on hold — drives which resolution actions are offered. */
export type HoldCode = "zero_amount" | "exceeds_po" | "no_grn" | "exceeds_grn";

export type MatchResult = {
  matchStatus: "matched" | "on_hold";
  holdReason: string | null;
  holdCode: HoldCode | null;
  /** What can still legitimately be paid on this invoice: min(PO, accepted goods) − other live invoices. */
  payableCap: number;
  /** How far the total billed is over the binding limit (0 when matched). */
  gap: number;
  /** The binding limit the gap is measured against (PO total or accepted goods value). */
  limit: number;
};

/**
 * Three-way match, cumulative: this invoice plus every other live invoice on the PO must not
 * exceed what was received (accepted GRN value) or what was ordered (PO total).
 */
export function evaluateThreeWayMatch(ctx: MatchContext, invoiceAmount: number): MatchResult {
  const inv = Number(invoiceAmount) || 0;
  const billed = ctx.otherInvoiced + inv;
  const already =
    ctx.otherInvoiced > 0 ? ` (including ${inr(ctx.otherInvoiced)} already invoiced)` : "";
  const goodsLimit = ctx.serviceException ? ctx.poTotal : ctx.acceptedGrnTotal;
  const payableCap = Math.max(0, Math.min(ctx.poTotal, goodsLimit) - ctx.otherInvoiced);
  const hold = (holdCode: HoldCode, holdReason: string, limit: number): MatchResult => ({
    matchStatus: "on_hold",
    holdReason,
    holdCode,
    payableCap,
    gap: Math.max(0, billed - limit),
    limit,
  });

  if (inv <= 0) return hold("zero_amount", "Invoice amount must be greater than zero.", 0);

  if (billed > ctx.poTotal + TOLERANCE) {
    return hold(
      "exceeds_po",
      `Total billed ${inr(billed)}${already} exceeds the purchase order value of ${inr(ctx.poTotal)}.`,
      ctx.poTotal,
    );
  }
  if (!ctx.serviceException) {
    if (ctx.acceptedGrnTotal <= 0) {
      return hold("no_grn", "No accepted goods receipt (GRN) for this purchase order yet.", 0);
    }
    if (billed > ctx.acceptedGrnTotal + TOLERANCE) {
      return hold(
        "exceeds_grn",
        `Total billed ${inr(billed)}${already} exceeds the value of goods accepted so far (${inr(ctx.acceptedGrnTotal)}).`,
        ctx.acceptedGrnTotal,
      );
    }
  }
  return { matchStatus: "matched", holdReason: null, holdCode: null, payableCap, gap: 0, limit: 0 };
}

/** Tolerance for an EVP deviation, from procurement_config.match_tolerance (data, not code). */
export type MatchTolerance = { abs: number; pct: number };
export const DEFAULT_MATCH_TOLERANCE: MatchTolerance = { abs: 500, pct: 0.01 };

/**
 * A failed match can go to the EVP as a documented deviation (SOP §VII.6) only for a small
 * over-billing (rounding, tax) within the tolerance — never for missing goods (no GRN).
 */
export function deviationEligible(result: MatchResult, tolerance: MatchTolerance): boolean {
  if (result.matchStatus !== "on_hold") return false;
  if (result.holdCode !== "exceeds_po" && result.holdCode !== "exceeds_grn") return false;
  const allowed = Math.max(tolerance.abs, tolerance.pct * result.limit);
  return result.gap > 0 && result.gap <= allowed;
}

export type Deduction = { reason: string; amount: number };

/**
 * Short-payment (SOP §8.7 "necessary deductions"): Finance approves a lower payable amount.
 * The payable can't exceed what is legitimately payable, and the deductions must explain the
 * whole difference, each with a reason. Returns an error message, or null when valid.
 */
export function validateDeductions(
  invoiceAmount: number,
  payable: number,
  payableCap: number,
  deductions: Deduction[],
): string | null {
  const inv = Number(invoiceAmount) || 0;
  const pay = Number(payable) || 0;
  if (pay <= 0) return "The payable amount must be greater than zero.";
  if (pay > payableCap + TOLERANCE) {
    return `The payable amount can't be more than ${inr(payableCap)} (what the PO and accepted goods allow).`;
  }
  if (pay >= inv)
    return "The payable amount must be less than the invoice amount; otherwise approve it normally.";
  if (!deductions.length || deductions.some((d) => !d.reason?.trim() || !(Number(d.amount) > 0))) {
    return "Give a reason and an amount for every deduction.";
  }
  const total = deductions.reduce((sum, d) => sum + Number(d.amount), 0);
  if (Math.abs(total - (inv - pay)) > TOLERANCE) {
    return `Deductions add up to ${inr(total)}, but the difference to explain is ${inr(inv - pay)}.`;
  }
  return null;
}
