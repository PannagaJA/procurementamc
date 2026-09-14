/** Server-side role resolution. Never trust a client-sent role. */
import { ForbiddenError } from './errors';

/** `principle` is a deprecated alias of `principal` (DECISIONS.md Q5). */
export function canonicalRole(role: string): string {
  return role === 'principle' ? 'principal' : role;
}

export async function getCallerRoles(
  db: { from: (t: string) => any },
  userId: string,
): Promise<{ role: string; department_id: string | null }[]> {
  const { data, error } = await db
    .from('user_roles')
    .select('role, department_id')
    .eq('user_id', userId);
  if (error) throw new ForbiddenError(`Could not verify your roles: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    role: canonicalRole(String(r.role)),
    department_id: r.department_id ?? null,
  }));
}

export function requireAnyRole(
  roles: { role: string }[],
  allowed: string[],
  action: string,
): void {
  const held = roles.map((r) => r.role);
  if (held.includes('admin')) return;
  if (!allowed.some((a) => held.includes(a))) {
    throw new ForbiddenError(
      `You are not permitted to ${action}. Required role: ${allowed.join(' or ')}.`,
    );
  }
}
