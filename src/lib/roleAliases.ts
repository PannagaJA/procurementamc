/**
 * Role aliases shared by the client (auth.tsx) and the server (server/procurement/roles.ts).
 * Pure: no Supabase/React imports. The SQL `has_role()` mirrors these aliases.
 */
const ALIASES: Record<string, string> = {
  principle: "principal", // deprecated spelling (DECISIONS.md Q5)
  chairman: "evp", // Chairman and Vice Chairman hold EVP authority (DECISIONS.md Q18)
  vice_chairman: "evp",
};

export function canonicalRole(role: string): string {
  return ALIASES[role] ?? role;
}

/** The admin's view, read-only: no writes, no approvals (DECISIONS.md Q18). */
export const READ_ONLY_ROLES = ["auditor", "corporate_office"];

/** Admin, or a read-only overseer: may see everything an admin sees. */
export function canReadAll(held: string[]): boolean {
  return held.some((r) => r === "admin" || READ_ONLY_ROLES.includes(r));
}

/** Holds a read-only role and nothing that grants write access. */
export function isReadOnlyUser(held: string[]): boolean {
  return held.length > 0 && held.every((r) => READ_ONLY_ROLES.includes(r));
}
