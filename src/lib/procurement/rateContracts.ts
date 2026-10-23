/**
 * Rate contracts (SOP Section VI, Routine Consumables): rates are finalised from at least three
 * quotations, approved by the EVP, and valid for at most six months. Pure — server and tests.
 */
export const RATE_CONTRACT_MIN_QUOTES = 3;

export const RATE_CONTRACT_CATEGORIES = [
  { id: "routine_consumable", label: "Routine Consumables" },
  { id: "services_amc", label: "Services / AMC" },
  { id: "maintenance", label: "Maintenance" },
] as const;

export const rateCategoryLabel = (id?: string | null) =>
  RATE_CONTRACT_CATEGORIES.find((c) => c.id === id)?.label ?? "Routine Consumables";

/** An item a rate-finalisation RFQ asks vendors to price. */
export type RateItem = { group: string; description: string; unit: string };
/** A vendor's quoted unit rate for one item (`rate_item_no` indexes the RFQ's items). */
export type QuotedRate = { vendor_id: string; rate_item_no: number | null; unit_price: number };
export type RankedQuote = { vendor_id: string; rates: number[]; total: number };

/**
 * Vendors who priced every item, cheapest first. Fewer than `minQuotes` such vendors → error.
 * ponytail: "cheapest" is the sum of unit rates (no quantities on a rate contract); weight by
 * expected consumption if the client wants that.
 */
export function rankRateQuotes(
  items: RateItem[],
  lines: QuotedRate[],
  minQuotes = RATE_CONTRACT_MIN_QUOTES,
): { ok: true; ranked: RankedQuote[] } | { ok: false; error: string } {
  if (!items.length) return { ok: false, error: "This RFQ has no items to price." };
  const byVendor = new Map<string, number[]>();
  for (const l of lines) {
    const i = l.rate_item_no;
    if (i == null || i < 0 || i >= items.length || !(Number(l.unit_price) > 0)) continue;
    const rates = byVendor.get(l.vendor_id) ?? new Array(items.length).fill(0);
    rates[i] = Number(l.unit_price);
    byVendor.set(l.vendor_id, rates);
  }
  const ranked = [...byVendor]
    .filter(([, rates]) => rates.every((r) => r > 0))
    .map(([vendor_id, rates]) => ({ vendor_id, rates, total: rates.reduce((s, r) => s + r, 0) }))
    .sort((a, b) => a.total - b.total);
  if (ranked.length < minQuotes) {
    return {
      ok: false,
      error: `Rates need at least ${minQuotes} complete quotations (every item priced); ${ranked.length} received.`,
    };
  }
  return { ok: true, ranked };
}

/** Validity window: ends after it starts, and lasts at most six months. Null when fine. */
export function rateContractValidity(from: string, to: string): string | null {
  if (!from || !to || to <= from) return "The contract must end after it starts.";
  const limit = new Date(`${from}T00:00:00Z`);
  limit.setUTCMonth(limit.getUTCMonth() + 6);
  return to > limit.toISOString().slice(0, 10)
    ? "A rate contract is valid for at most six months (SOP Section VI)."
    : null;
}

/** Only an EVP-approved contract inside its validity window covers purchases. */
export function isActiveRateContract(
  rc: { status?: string | null; valid_from: string; valid_to: string },
  today: string,
): boolean {
  return rc.status === "active" && rc.valid_from <= today && rc.valid_to >= today;
}

/** The contract's rate lines, in the shape POs and `coveringContracts` read. */
export function contractRates(items: RateItem[], rates: number[]) {
  return items.map((it, i) => ({
    group: it.group,
    description: it.description,
    unit: it.unit,
    rate: rates[i],
  }));
}
