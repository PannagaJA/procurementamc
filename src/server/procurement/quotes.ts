/**
 * The awarded vendor's quotation lines for each PO. A CS-backed PO reads them through
 * CS -> RFQ; a direct-purchase PO (no CS) through the RFQs raised on its PR.
 */
type PoRef = { id: string; cs_id?: string | null; pr_id?: string | null; vendor_id: string };

export async function quotedLinesByPo(db: any, pos: PoRef[]): Promise<Map<string, any[]>> {
  const result = new Map<string, any[]>(pos.map((p) => [p.id, []]));
  if (pos.length === 0) return result;

  const csIds = [...new Set(pos.map((p) => p.cs_id).filter(Boolean))] as string[];
  const directPrIds = [...new Set(pos.filter((p) => !p.cs_id).map((p) => p.pr_id).filter(Boolean))] as string[];

  const [{ data: css }, { data: rfqs }] = await Promise.all([
    csIds.length ? db.from("comparative_statements").select("id, rfq_id").in("id", csIds) : { data: [] },
    directPrIds.length
      ? db.from("rfqs").select("id, pr_id, created_at").in("pr_id", directPrIds).order("created_at", { ascending: false })
      : { data: [] },
  ]);
  const rfqByCs = new Map((css ?? []).map((c: any) => [c.id, c.rfq_id]));
  const rfqIds = [...new Set([...(css ?? []).map((c: any) => c.rfq_id), ...(rfqs ?? []).map((r: any) => r.id)].filter(Boolean))];
  if (rfqIds.length === 0) return result;

  const { data: lines } = await db
    .from("quotation_lines")
    .select("rfq_id, vendor_id, description, quantity, unit, unit_price, tax_amount, total_price, delivery_days, technical_remarks")
    .in("rfq_id", rfqIds);

  for (const po of pos) {
    // Candidate RFQs: the CS's RFQ, else the PR's RFQs newest first.
    const candidates = po.cs_id
      ? [rfqByCs.get(po.cs_id)]
      : (rfqs ?? []).filter((r: any) => r.pr_id === po.pr_id).map((r: any) => r.id);
    for (const rfqId of candidates) {
      const mine = (lines ?? []).filter((l: any) => l.rfq_id === rfqId && l.vendor_id === po.vendor_id);
      if (mine.length) {
        result.set(po.id, mine);
        break;
      }
    }
  }
  return result;
}
