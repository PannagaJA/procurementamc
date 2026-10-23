/**
 * Vendor quotation link signing (src/server/quoteLinks.ts), against the real module.
 * Run: node scripts/verify_quote_links.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": new URL("../src", import.meta.url).pathname },
});
const links = await jiti.import("../src/server/quoteLinks.ts");
const {
  signQuoteToken,
  verifyQuoteToken,
  linkOrigin,
  rfqVendorLink,
  quotationVendorLink,
  linksConfigured,
} = links;

const rfq = "6f1c2a9e-1111-4c3b-9d7e-000000000001";
const vendor = "0b7d4e2f-2222-4a1b-8c6d-000000000002";
const other = "0b7d4e2f-3333-4a1b-8c6d-000000000003";

// No secret: nothing verifies, nothing can be signed
delete process.env.QUOTE_LINK_SECRET;
assert.equal(linksConfigured(), false, "sendRfq must refuse when unset");
assert.equal(verifyQuoteToken(rfq, vendor, "a".repeat(32)), false);
assert.throws(() => signQuoteToken(rfq, vendor), /QUOTE_LINK_SECRET/);
process.env.QUOTE_LINK_SECRET = "short";
assert.throws(
  () => signQuoteToken(rfq, vendor),
  /QUOTE_LINK_SECRET/,
  "secret under 32 chars rejected",
);

process.env.QUOTE_LINK_SECRET = "x".repeat(64);
assert.equal(linksConfigured(), true);
const t = signQuoteToken(rfq, vendor);
assert.match(t, /^[0-9a-f]{32}$/);
assert.equal(verifyQuoteToken(rfq, vendor, t), true, "round trip");
assert.equal(verifyQuoteToken(rfq, vendor, t.toUpperCase()), true, "case-insensitive token");
assert.equal(verifyQuoteToken(rfq.toUpperCase(), ` ${vendor} `, t), true, "ids normalised");
assert.equal(verifyQuoteToken(rfq, other, t), false, "another vendor's link");
assert.equal(verifyQuoteToken(other, vendor, t), false, "another RFQ");
assert.equal(verifyQuoteToken(rfq, vendor, t.slice(0, 31)), false, "truncated");
assert.equal(verifyQuoteToken(rfq, vendor, ""), false);

// Tokens made with the old public salt no longer open anything
const oldSalt = "amc_procurement_portal_vendor_salt_2026_sec";
const oldToken = createHash("sha256")
  .update(`${rfq}:${vendor}:${oldSalt}`)
  .digest("hex")
  .slice(0, 32);
assert.equal(verifyQuoteToken(rfq, vendor, oldToken), false, "old-salt token rejected");

// A different secret invalidates links
process.env.QUOTE_LINK_SECRET = "y".repeat(64);
assert.equal(verifyQuoteToken(rfq, vendor, t), false, "rotated secret");

// Origins
delete process.env.PUBLIC_APP_URL;
assert.equal(linkOrigin("https://procurementamc.vercel.app/"), "https://procurementamc.vercel.app");
assert.equal(linkOrigin("http://localhost:8080"), "http://localhost:8080");
for (const bad of ["", "javascript:alert(1)", "https://evil.com/path", "ftp://x.y", "https://a b"])
  assert.throws(() => linkOrigin(bad), /Invalid site address/, bad);
process.env.PUBLIC_APP_URL = "https://procurementamc.vercel.app";
assert.equal(
  linkOrigin("http://localhost:8080"),
  "https://procurementamc.vercel.app",
  "server setting wins",
);

// Link shapes
const rl = new URL(rfqVendorLink("https://procurementamc.vercel.app", rfq, vendor));
assert.equal(rl.pathname, `/quotation/${rfq}`);
assert.equal(rl.searchParams.get("vendorId"), vendor);
assert.equal(verifyQuoteToken(rfq, vendor, rl.searchParams.get("token")), true);
const ql = new URL(
  quotationVendorLink("https://procurementamc.vercel.app", rfq, "Vendor@Example.com"),
);
assert.equal(ql.searchParams.get("vendorId"), null);
assert.equal(verifyQuoteToken(rfq, "vendor@example.com", ql.searchParams.get("token")), true);

console.log("quote links: all checks passed");
