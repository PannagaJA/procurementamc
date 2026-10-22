/** Plain-language labels for values stored as codes (statuses, roles, order types). */
export { categoryLabel } from "@/lib/procurement/budgetLedger";

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const STATUS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  escalated_to_evp: "With EVP",
  pending_approval: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  issued: "Issued",
  amended: "Amended",
  partially_closed: "Part paid",
  closed: "Closed",
  cancelled: "Cancelled",
  sent: "Sent to vendors",
  pending: "Pending",
  matched: "Matched",
  on_hold: "On hold",
  returned: "Returned to vendor",
  paid: "Paid",
};
export const statusLabel = (s: string | null | undefined) => (s ? (STATUS[s] ?? titleCase(s)) : "");

const ROLE: Record<string, string> = {
  admin: "Admin",
  evp: "EVP",
  director_admin_finance: "Director (Admin & Finance)",
  purchase_committee: "Purchase Committee",
  principal: "Principal",
  principle: "Principal",
  procurement_officer: "Procurement Officer",
  procurement_executive: "Procurement Executive",
  hod: "HOD",
  stores: "Stores",
  finance: "Finance",
  faculty: "Faculty",
  staff: "Staff",
};
export const roleLabel = (r: string | null | undefined) => (r ? (ROLE[r] ?? titleCase(r)) : "");

const PO_TYPE: Record<string, string> = {
  regular: "Regular order",
  rate_contract: "Rate contract",
  direct_purchase: "Direct purchase",
  emergency: "Emergency",
};
export const poTypeLabel = (t: string | null | undefined) =>
  t ? (PO_TYPE[t] ?? titleCase(t)) : "";
