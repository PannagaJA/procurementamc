/**
 * "Nobody approves their own work" routing (src/lib/procurement/separation.ts), real module.
 * Run: node scripts/verify_separation.mjs
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": new URL("../src", import.meta.url).pathname },
});
const { nextIndependentRole, atLeastRole } = await jiti.import(
  "../src/lib/procurement/separation.ts",
);

const R = (role, department_id = null) => ({ role, department_id });
const CSE = "dept-cse";
const MECH = "dept-mech";
// Everyone else in the institution (one person per role, HODs per department)
const staff = [
  R("hod", CSE),
  R("hod", MECH),
  R("principal"),
  R("procurement_officer"),
  R("purchase_committee"),
  R("director_admin_finance"),
  R("evp"),
];

// CS-2026-1014 / PO-2026-1020: the Procurement Officer prepared it, the matrix says Procurement Officer
assert.equal(
  nextIndependentRole("procurement_officer", [R("procurement_officer")], staff, CSE),
  "purchase_committee",
);
// Someone else's work: unchanged
assert.equal(
  nextIndependentRole("procurement_officer", [R("faculty", CSE)], staff, CSE),
  "procurement_officer",
);
// Actor holds two roles in a row: skip both
assert.equal(
  nextIndependentRole(
    "procurement_officer",
    [R("procurement_officer"), R("purchase_committee")],
    staff,
    CSE,
  ),
  "director_admin_finance",
);
// HOD of the PR's own department → Principal; an HOD of another department is independent
assert.equal(nextIndependentRole("hod", [R("hod", CSE)], staff, CSE), "principal");
assert.equal(nextIndependentRole("hod", [R("hod", MECH)], staff, CSE), "hod");
// Never route to a role nobody else holds: no Purchase Committee member → Director
const noCommittee = staff.filter((r) => r.role !== "purchase_committee");
assert.equal(
  nextIndependentRole("procurement_officer", [R("procurement_officer")], noCommittee, CSE),
  "director_admin_finance",
);
// Top of the chain / nobody left → EVP
assert.equal(nextIndependentRole("evp", [R("evp")], staff, CSE), "evp");
assert.equal(
  nextIndependentRole("procurement_officer", [R("procurement_officer")], [], CSE),
  "evp",
);
// A role outside the chain that the actor holds → EVP
assert.equal(nextIndependentRole("finance", [R("finance")], staff, CSE), "evp");

// Comparative statements are evaluated by at least the Purchase Committee (SOP §8.4)
assert.equal(atLeastRole("procurement_officer", "purchase_committee"), "purchase_committee");
assert.equal(atLeastRole("hod", "purchase_committee"), "purchase_committee");
assert.equal(atLeastRole("purchase_committee", "purchase_committee"), "purchase_committee");
assert.equal(atLeastRole("evp", "purchase_committee"), "evp");
assert.equal(atLeastRole("director_admin_finance", "purchase_committee"), "director_admin_finance");

console.log("separation of duties: all checks passed");
