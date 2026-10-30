/**
 * Emergency procurement (SOP §IX). Pure — shared by the server and tests.
 *
 * One ₹10,00,000 counter per Indian FY covers both routes: the emergency register (counted in
 * emergency_annual_ledger when the EVP authorises an entry) and emergency-flag PRs raised through
 * Raise PR. A register entry's own PO is backed by an emergency PR linked through
 * emergency_procurements.pr_id; that PR is already in the ledger, so it isn't counted again.
 */
export type EmergencyPr = { id: string; estimated_value: number | string | null; status: string };

const round = (n: number) => Math.round(n * 100) / 100;

/** Emergency spend used this FY: the register's ledger total plus unlinked emergency PRs. */
export function emergencyUsed(input: {
  registerTotal: number | string | null | undefined;
  emergencyPrs: EmergencyPr[];
  linkedPrIds: Iterable<string>;
}): number {
  const linked = new Set(input.linkedPrIds);
  const prs = input.emergencyPrs
    .filter((p) => !linked.has(p.id) && p.status !== "rejected" && p.status !== "archived")
    .reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0);
  return round((Number(input.registerTotal) || 0) + prs);
}

const inr = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;

/** Why an emergency PO total can't be used, or null. The EVP approved a fixed cost (₹1 tolerance). */
export function emergencyPoTotalError(approvedCost: number, total: number): string | null {
  if (!(total > 0)) return "Enter the order lines with a quantity and price.";
  if (total > approvedCost + 1)
    return `The order total (${inr(total)}) is more than the EVP approved for this emergency (${inr(approvedCost)}).`;
  return null;
}
