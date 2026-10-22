/**
 * Server side of the "nobody approves their own work" rule (src/lib/procurement/separation.ts):
 * loads the actor's roles and everyone else's, then picks the next independent approver.
 */
import { APPROVER_CHAIN, nextIndependentRole } from "@/lib/procurement/separation";
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
