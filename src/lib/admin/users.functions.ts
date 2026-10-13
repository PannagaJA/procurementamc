import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"] | "faculty" | "requester";

export interface CreateAdminUserInput {
  email: string;
  password?: string;
  full_name: string;
  role: AppRole;
  department_id?: string | null;
}

export const createAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateAdminUserInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    if (!held.includes("admin")) {
      return {
        ok: false as const,
        error: "Forbidden: Only administrators can create users.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = data.email.trim().toLowerCase();
    const fullName = data.full_name.trim();
    const password = data.password && data.password.trim().length >= 6 ? data.password.trim() : "Password@123";

    // 1. Create or invite user via Supabase Auth Admin API
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (authError) {
      return {
        ok: false as const,
        error: authError.message,
      };
    }

    const newUserId = authUser.user.id;

    // 2. Ensure profile exists in public.profiles table
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: newUserId,
      email,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      console.warn("Profile upsert warning:", profileError.message);
    }

    // 3. Assign role and optional department in public.user_roles
    const roleInsertPayload: {
      user_id: string;
      role: AppRole;
      department_id?: string | null;
    } = {
      user_id: newUserId,
      role: data.role,
      department_id: data.department_id || null,
    };

    const { error: roleError } = await (supabaseAdmin.from("user_roles") as any).insert(roleInsertPayload);

    if (roleError) {
      console.error("Role insertion failed:", roleError.message);
      return {
        ok: true as const,
        warning: `User created, but role assignment had an issue: ${roleError.message}`,
        userId: newUserId,
      };
    }

    return {
      ok: true as const,
      userId: newUserId,
      email,
      full_name: fullName,
      role: data.role,
      department_id: data.department_id || null,
    };
  });
