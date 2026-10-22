/**
 * Separation of duties: nobody approves their own work. Pure — shared by the server and tests.
 *
 * When the routed approver role is one the actor (requester / preparer / creator) holds, the
 * approval moves up the chain to the first role the actor doesn't hold and someone else does.
 */

/** Approval authority, lowest first (authority matrix + SOP §8.3–§8.5). */
export const APPROVER_CHAIN = [
  "hod",
  "principal",
  "procurement_officer",
  "purchase_committee",
  "director_admin_finance",
  "evp",
] as const;

export type HeldRole = { role: string; department_id: string | null };

const holds = (list: HeldRole[], role: string, departmentId: string | null) =>
  list.some((x) => x.role === role && (role !== "hod" || x.department_id === departmentId));

/**
 * @param role        the role the matrix routed to
 * @param actorRoles  roles of the person whose work is being approved
 * @param otherRoles  roles held by everyone else (so we never route to a role nobody holds)
 * @param departmentId the item's department (an HOD only counts for their own department)
 */
export function nextIndependentRole(
  role: string,
  actorRoles: HeldRole[],
  otherRoles: HeldRole[],
  departmentId: string | null,
): string {
  if (!holds(actorRoles, role, departmentId)) return role;
  const from = APPROVER_CHAIN.indexOf(role as (typeof APPROVER_CHAIN)[number]);
  const higher = from < 0 ? [] : APPROVER_CHAIN.slice(from + 1);
  return (
    higher.find((r) => !holds(actorRoles, r, departmentId) && holds(otherRoles, r, departmentId)) ??
    "evp"
  );
}

/** The higher of two roles in the chain (roles outside the chain are kept as they are). */
export function atLeastRole(role: string, floor: string): string {
  const a = APPROVER_CHAIN.indexOf(role as (typeof APPROVER_CHAIN)[number]);
  const b = APPROVER_CHAIN.indexOf(floor as (typeof APPROVER_CHAIN)[number]);
  return a >= 0 && b >= 0 && a < b ? floor : role;
}

/** Who approves an invoice for payment, lowest first (product owner, 2026-10-22). */
export const INVOICE_APPROVER_CHAIN = ["finance", "director_admin_finance", "evp"] as const;

/**
 * The first invoice-approver role someone independent holds. `excluded` are the people who
 * entered the invoice or received the goods (SOP §8.7); nobody independent at all → EVP.
 */
export function invoiceApproverRole(
  holders: { user_id: string; role: string }[],
  excluded: Set<string>,
): string {
  return (
    INVOICE_APPROVER_CHAIN.find((role) =>
      holders.some((h) => h.role === role && !excluded.has(h.user_id)),
    ) ?? "evp"
  );
}

/** Admin, or the invoice's approver role or one above it in the chain. */
export function canApproveInvoiceAs(callerRoles: string[], role: string): boolean {
  if (callerRoles.includes("admin")) return true;
  const from = INVOICE_APPROVER_CHAIN.indexOf(role as (typeof INVOICE_APPROVER_CHAIN)[number]);
  return INVOICE_APPROVER_CHAIN.slice(Math.max(from, 0)).some((r) => callerRoles.includes(r));
}
