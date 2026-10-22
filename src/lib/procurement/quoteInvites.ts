import { dispatchRfqEmail } from "@/lib/procurement/email.functions";
import { publicAppOrigin } from "@/lib/quotationAuth";

/**
 * After sendRfq succeeds: email each vendor their private quotation link.
 * Returns how many emails went out and a notice for anything that didn't.
 */
export async function emailQuoteInvites(
  rfqId: string,
  vendors: { id: string; name: string; bank_details_json?: any }[],
): Promise<{ sent: number; notice: string }> {
  let sent = 0;
  let notice = "";
  const noEmail: string[] = [];

  for (const v of vendors) {
    if (!(v.bank_details_json as any)?.email) {
      noEmail.push(v.name);
      continue;
    }
    try {
      const res = await (dispatchRfqEmail as any)({
        data: { rfq_id: rfqId, vendor_id: v.id, origin: publicAppOrigin() },
      });
      if (res?.ok) sent++;
      else notice = res?.error || "Email delivery failed";
    } catch (e: any) {
      notice = e?.message;
    }
  }

  if (noEmail.length) {
    const missing = `No email on file for: ${noEmail.join(", ")}`;
    notice = notice ? `${notice}. ${missing}` : missing;
  }
  return { sent, notice };
}
