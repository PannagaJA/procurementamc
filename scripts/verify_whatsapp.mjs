/**
 * WhatsApp links (src/lib/whatsapp.ts) and role aliases (src/lib/roleAliases.ts), against the real modules.
 * Run: node scripts/verify_whatsapp.mjs
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": new URL("../src", import.meta.url).pathname },
});
const { toWaNumber, waLink } = await jiti.import("../src/lib/whatsapp.ts");
const { canonicalRole, canReadAll, isReadOnlyUser } = await jiti.import("../src/lib/roleAliases.ts");

// Phone normalisation
assert.equal(toWaNumber("98450 12345"), "919845012345");
assert.equal(toWaNumber("098450-12345"), "919845012345");
assert.equal(toWaNumber("+91 98450 12345"), "919845012345");
assert.equal(toWaNumber("919845012345"), "919845012345");
assert.equal(toWaNumber("+1 415 555 0100"), "14155550100");
assert.equal(toWaNumber("12345"), null);
assert.equal(toWaNumber(""), null);
assert.equal(toWaNumber(null), null);

// Links
assert.equal(waLink("9845012345", "PO & link: https://x/y?a=1"), "https://wa.me/919845012345?text=PO%20%26%20link%3A%20https%3A%2F%2Fx%2Fy%3Fa%3D1");
assert.equal(waLink(undefined, "hi"), "https://wa.me/?text=hi");

// Roles
assert.equal(canonicalRole("chairman"), "evp");
assert.equal(canonicalRole("vice_chairman"), "evp");
assert.equal(canonicalRole("principle"), "principal");
assert.equal(canonicalRole("auditor"), "auditor");
assert.ok(canReadAll(["auditor"]) && canReadAll(["corporate_office"]) && canReadAll(["admin"]));
assert.ok(!canReadAll(["evp"]));
assert.ok(isReadOnlyUser(["auditor"]) && isReadOnlyUser(["auditor", "corporate_office"]));
assert.ok(!isReadOnlyUser(["auditor", "finance"]) && !isReadOnlyUser([]) && !isReadOnlyUser(["viewer"]));

console.log("whatsapp + role alias checks passed");
