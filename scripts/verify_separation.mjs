/**
 * "Nobody approves their own work" routing (src/lib/procurement/separation.ts), real module.
 * Run: node scripts/verify_separation.mjs
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": new URL("../src", import.meta.url).pathname },
});
const { nextIndependentRole, atLeastRole, invoiceApproverRole, canApproveInvoiceAs } =
  await jiti.import("../src/lib/procurement/separation.ts");

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

// Invoice approval escalates within Finance: another Finance user, else Director, else EVP
const U = (user_id, role) => ({ user_id, role });
const priya = U("priya", "finance");
const evpUser = U("rajesh", "evp");
// INV-878676: Priya is the only Finance user and entered it, nobody is Director → EVP
assert.equal(invoiceApproverRole([priya, evpUser], new Set(["priya"])), "evp");
// A second Finance user takes it
assert.equal(
  invoiceApproverRole([priya, U("anil", "finance"), evpUser], new Set(["priya"])),
  "finance",
);
// No other Finance user but a Director → Director
assert.equal(
  invoiceApproverRole([priya, U("dir", "director_admin_finance"), evpUser], new Set(["priya"])),
  "director_admin_finance",
);
// The person who received the goods is excluded too
assert.equal(invoiceApproverRole([priya, U("anil", "finance")], new Set(["anil"])), "finance");
assert.equal(invoiceApproverRole([priya, U("anil", "finance")], new Set(["anil", "priya"])), "evp");
// Nobody at all → EVP
assert.equal(invoiceApproverRole([], new Set()), "evp");

assert.equal(canApproveInvoiceAs(["evp"], "evp"), true);
assert.equal(canApproveInvoiceAs(["finance"], "evp"), false);
assert.equal(canApproveInvoiceAs(["evp"], "finance"), true, "higher in the chain may approve");
assert.equal(canApproveInvoiceAs(["director_admin_finance"], "director_admin_finance"), true);
assert.equal(
  canApproveInvoiceAs(["procurement_officer"], "finance"),
  false,
  "not an invoice approver",
);
assert.equal(canApproveInvoiceAs(["admin"], "evp"), true);

console.log("separation of duties: all checks passed");
