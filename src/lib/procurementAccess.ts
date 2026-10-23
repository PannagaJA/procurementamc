/**
 * Which procurement screens a user can open, from their roles. Shared by the sidebar
 * (Layout) and the Procurement Hub so the two never disagree. Server functions still
 * re-check roles; this only decides what to show.
 */
export type HasRole = (role: string) => boolean;

export function procurementAccess(has: HasRole) {
  const any = (roles: string[]) => roles.some(has);
  const admin = has("admin");
  const pr =
    admin ||
    any([
      "faculty",
      "user",
      "staff",
      "requester",
      "hod",
      "procurement_officer",
      "procurement_executive",
      "purchase_committee",
    ]);

  const access = {
    hub:
      admin ||
      any([
        "principal",
        "evp",
        "director_admin_finance",
        "purchase_committee",
        "procurement_officer",
        "procurement_executive",
        "finance",
        "stores",
        "viewer",
      ]),
    approvals:
      admin ||
      any([
        "hod",
        "principal",
        "evp",
        "director_admin_finance",
        "purchase_committee",
        "finance",
        "procurement_officer",
        "procurement_executive",
      ]),
    pr,
    rfqs: admin || any(["procurement_officer", "procurement_executive", "purchase_committee"]),
    cs:
      admin ||
      any([
        "purchase_committee",
        "procurement_officer",
        "procurement_executive",
        "principal",
        "evp",
        "director_admin_finance",
      ]),
    pos: admin || any(["procurement_officer", "procurement_executive", "stores", "finance"]),
    grns: admin || any(["stores", "hod", "finance"]),
    invoices: admin || any(["finance"]),
    emergency:
      pr || any(["evp", "director_admin_finance", "procurement_officer", "procurement_executive"]),
    vendorRatings:
      admin ||
      any([
        "purchase_committee",
        "procurement_officer",
        "procurement_executive",
        "evp",
        "director_admin_finance",
      ]),
    vendors: admin || any(["procurement_officer", "procurement_executive", "purchase_committee"]),
    budgets:
      admin ||
      any([
        "hod",
        "finance",
        "principal",
        "evp",
        "director_admin_finance",
        "procurement_officer",
      ]),
  };
  return { ...access, any: Object.values(access).some(Boolean) };
}

export type ProcurementAccess = ReturnType<typeof procurementAccess>;
