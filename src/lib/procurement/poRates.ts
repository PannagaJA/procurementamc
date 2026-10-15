/**
 * Per-unit rates used to value goods received against a PO (GRN accepted value).
 * Rates come from the PO itself (vendor's quoted lines, else PR lines) and are scaled so
 * that accepting every ordered unit values exactly the PO total — taxes included. This keeps
 * the three-way match comparing like with like. Pure: shared by the GRN page and server.
 */
const norm = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();

export function poUnitRate(po: any, description: string): number {
  const total = Number(po?.total_value || 0);
  const quoted: any[] = po?.quoted_lines ?? [];
  const prLines: any[] = po?.purchase_requisitions?.pr_line_items ?? [];

  // [description, base unit rate, quantity] for each PO line.
  const lines: [string, number, number][] = quoted.length
    ? quoted.map((l) => [
        l.description,
        Number(l.total_price) / Number(l.quantity || 1),
        Number(l.quantity || 0),
      ])
    : prLines.map((l) => {
        const qty = Number(l.net_qty_to_procure || l.qty_required || 0);
        const est = Number(l.est_unit_price) || (qty ? Number(l.est_total || 0) / qty : 0);
        return [l.description, est, qty];
      });

  const totalQty = lines.reduce((s, [, , q]) => s + q, 0);
  const baseTotal = lines.reduce((s, [, r, q]) => s + r * q, 0);
  if (!totalQty) return 0;
  // No usable prices on the lines: spread the PO total evenly across ordered units.
  if (!baseTotal) return total / totalQty;

  const match =
    lines.find(([d]) => norm(d) === norm(description)) ?? (lines.length === 1 ? lines[0] : null);
  const base = match ? match[1] : baseTotal / totalQty;
  return base * (total / baseTotal);
}
