/**
 * Private vendor quotation links (server-only).
 *
 * Each link carries an HMAC of (record id, vendor key) signed with QUOTE_LINK_SECRET, so a link
 * only opens the one RFQ/quotation it was made for, for the one vendor. The secret never reaches
 * the browser: links are created and checked only in server functions.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string | null {
  const s = process.env.QUOTE_LINK_SECRET;
  return s && s.length >= 32 ? s : null;
}

const payload = (recordId: string, vendorKey: string) =>
  `${recordId.trim().toLowerCase()}:${vendorKey.trim().toLowerCase()}`;

export function signQuoteToken(recordId: string, vendorKey: string): string {
  const s = secret();
  if (!s) throw new Error("Vendor links aren't configured: set QUOTE_LINK_SECRET on the server.");
  return createHmac("sha256", s).update(payload(recordId, vendorKey)).digest("hex").slice(0, 32);
}

export function verifyQuoteToken(
  recordId: string,
  vendorKey: string,
  token: string | null | undefined,
): boolean {
  if (!recordId || !vendorKey || !token || !secret()) return false;
  const expected = Buffer.from(signQuoteToken(recordId, vendorKey));
  const given = Buffer.from(String(token).trim().toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** PUBLIC_APP_URL when set, otherwise the caller's origin (validated). */
export function linkOrigin(clientOrigin?: string | null): string {
  const origin = String(process.env.PUBLIC_APP_URL || clientOrigin || "").replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/?#]+$/i.test(origin))
    throw new Error("Invalid site address for the link.");
  return origin;
}

/** RFQ link: /quotation/<rfq>?vendorId=<vendor>&token=… */
export function rfqVendorLink(origin: string, rfqId: string, vendorId: string): string {
  const url = new URL(`${origin}/quotation/${rfqId}`);
  url.searchParams.set("vendorId", vendorId);
  url.searchParams.set("token", signQuoteToken(rfqId, vendorId));
  return url.toString();
}

/** Legacy quotation link (keyed by the vendor's email): /quotation/<quotation>?token=… */
export function quotationVendorLink(origin: string, quotationId: string, email: string): string {
  const url = new URL(`${origin}/quotation/${quotationId}`);
  url.searchParams.set("token", signQuoteToken(quotationId, email));
  return url.toString();
}
