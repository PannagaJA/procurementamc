/**
 * Cryptographic helper to generate and verify vendor-specific quotation access tokens.
 * Guarantees that public quotation links are isolated per vendor so no vendor can
 * view, access, or tamper with another vendor's quotation or pricing.
 */

const AMC_VENDOR_TOKEN_SALT = "amc_procurement_portal_vendor_salt_2026_sec";

export async function computeVendorAccessToken(
  recordId: string,
  vendorIdentifier: string,
): Promise<string> {
  const payload = `${recordId.trim().toLowerCase()}:${vendorIdentifier.trim().toLowerCase()}:${AMC_VENDOR_TOKEN_SALT}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 32);
}

export async function verifyVendorAccessToken(
  recordId: string,
  vendorIdentifier: string,
  providedToken: string,
): Promise<boolean> {
  if (!recordId || !vendorIdentifier || !providedToken) return false;
  try {
    const expected = await computeVendorAccessToken(recordId, vendorIdentifier);
    return expected.toLowerCase() === providedToken.trim().toLowerCase();
  } catch (err) {
    console.error("Token verification error:", err);
    return false;
  }
}

export function buildVendorQuotationLink(
  origin: string,
  recordId: string,
  token: string,
  extraParams?: Record<string, string>,
): string {
  const base = origin.replace(/\/$/, "");
  const url = new URL(`${base}/quotation/${recordId}`);
  url.searchParams.set("token", token);
  if (extraParams) {
    Object.entries(extraParams).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  return url.toString();
}
