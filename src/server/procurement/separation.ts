/**
 * Server side of the "nobody approves their own work" rule (src/lib/procurement/separation.ts):
 * loads the actor's roles and everyone else's, then picks the next independent approver.
 */
import {
  APPROVER_CHAIN,
  INVOICE_APPROVER_CHAIN,
  invoiceApproverRole,
  nextIndependentRole,
} from "@/lib/procurement/separation";
import { canonicalRole, getCallerRoles } from "./roles";

export async function independentRole(
  admin: any,
  input: { actorId: string | null | undefined; departmentId: string | null; role: string },
): Promise<string> {
  if (!input.actorId) return input.role;
  const mine = await getCallerRoles(admin, input.actorId);
  const holdsIt = mine.some(
    (r) =>
      r.role === input.role && (input.role !== "hod" || r.department_id === input.departmentId),
  );
  if (!holdsIt) return input.role;
  const { data } = await admin
    .from("user_roles")
    .select("role, department_id")
    .neq("user_id", input.actorId)
    .in("role", [...APPROVER_CHAIN, "principle"]);
  const others = (data ?? []).map((r: any) => ({
    role: canonicalRole(String(r.role)),
    department_id: r.department_id ?? null,
  }));
  return nextIndependentRole(input.role, mine, others, input.departmentId);
}

/** Approver role for each invoice (`invoiceApproverRole`): one roles query and one GRN query. */
export async function invoiceApproverRoles(
  admin: any,
  invoices: { id: string; po_id: string | null; submitted_by?: string | null }[],
): Promise<Map<string, string>> {
  const poIds = [...new Set(invoices.map((i) => i.po_id).filter(Boolean))];
  const [holders, grns] = await Promise.all([
    admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", [...INVOICE_APPROVER_CHAIN]),
    poIds.length
      ? admin.from("grns").select("po_id, prepared_by").in("po_id", poIds)
      : { data: [], error: null },
  ]);
  if (holders.error) throw new Error(`Could not load invoice approvers: ${holders.error.message}`);
  if (grns.error) throw new Error(`Could not load goods receipts: ${grns.error.message}`);

  return new Map(
    invoices.map((inv) => {
      const excluded = new Set<string>(
        (grns.data ?? [])
          .filter((g: any) => g.po_id === inv.po_id && g.prepared_by)
          .map((g: any) => g.prepared_by),
      );
      if (inv.submitted_by) excluded.add(inv.submitted_by);
      return [inv.id, invoiceApproverRole(holders.data ?? [], excluded)];
    }),
  );
}
