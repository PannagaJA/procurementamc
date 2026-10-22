import { dispatchRfqEmail } from "@/lib/procurement/email.functions";
import { publicAppOrigin } from "@/lib/quotationAuth";

/**
 * Email each vendor their private quotation link (the server looks up the address and signs the
 * link). Returns how many went out and one sentence per distinct problem.
 */
export async function emailQuoteInvites(
  rfqId: string,
  vendors: { id: string; name?: string }[],
): Promise<{ sent: number; notice: string }> {
  let sent = 0;
  const problems = new Set<string>();

  for (const v of vendors) {
    try {
      const res = await (dispatchRfqEmail as any)({
        data: { rfq_id: rfqId, vendor_id: v.id, origin: publicAppOrigin() },
      });
      if (res?.ok) sent++;
      else problems.add(res?.error || `Email to ${v.name ?? "a vendor"} failed`);
    } catch (e: any) {
      problems.add(e?.message || `Email to ${v.name ?? "a vendor"} failed`);
    }
  }

  // One sentence per problem, each ending in exactly one full stop.
  const notice = [...problems].map((p) => p.trim().replace(/\.*$/, ".")).join(" ");
  return { sent, notice };
}
