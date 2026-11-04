import { dispatchRfqEmail } from "@/lib/procurement/email.functions";
import { publicAppOrigin } from "@/lib/quotationAuth";

/**
 * Email each vendor their private quotation link (the server looks up the address and signs the
 * link). Returns how many went out and one sentence per distinct problem.
 */
export async function emailQuoteInvites(
  rfqId: string,
  vendors: { id: string; name?: string }[],
): Promise<{
  sent: number;
  notice: string;
  results: { id: string; ok: boolean; error?: string }[];
}> {
  let sent = 0;
  const problems = new Set<string>();
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const v of vendors) {
    let error: string | undefined;
    try {
      const res = await (dispatchRfqEmail as any)({
        data: { rfq_id: rfqId, vendor_id: v.id, origin: publicAppOrigin() },
      });
      if (res?.ok) sent++;
      else error = res?.error || `Email to ${v.name ?? "a vendor"} failed`;
    } catch (e: any) {
      error = e?.message || `Email to ${v.name ?? "a vendor"} failed`;
    }
    if (error) problems.add(error);
    results.push({ id: v.id, ok: !error, error: error && friendly(error) });
  }

  // One sentence per problem, each ending in exactly one full stop.
  const notice = [...new Set([...problems].map(friendly))].join(" ");

  return { sent, notice, results };
}

function friendly(p: string): string {
  if (
    p.includes("535") ||
    p.includes("BadCredentials") ||
    p.includes("Username and Password not accepted")
  ) {
    return "Automatic email dispatch failed due to invalid mail server credentials in .env.";
  }
  return p.trim().replace(/\.*$/, ".");
}
