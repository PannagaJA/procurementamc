import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RoleEntry = { role: string; department_id?: string | null };

export type AuthContextValue = {
  userId: string | null;
  user?: any;
  roles: RoleEntry[];
  primaryRole: string | null;
  departmentId?: string | null;
  loading: boolean;
  hasRole: (role: string) => boolean;
  refresh: () => Promise<void>;
};

export function computePrimaryRole(roles: RoleEntry[]): string | null {
  return (
    roles.find((r) => r.role === "admin")?.role ||
    roles.find((r) => r.role === "evp")?.role ||
    roles.find((r) => r.role === "director_admin_finance")?.role ||
    roles.find((r) => r.role === "purchase_committee")?.role ||
    roles.find((r) => r.role === "principal" || r.role === "principle")?.role ||
    roles.find((r) => r.role === "procurement_officer")?.role ||
    roles.find((r) => r.role === "procurement_executive")?.role ||
    roles.find((r) => r.role === "hod")?.role ||
    roles.find((r) => r.role === "stores")?.role ||
    roles.find((r) => r.role === "finance")?.role ||
    roles.find((r) => r.role === "librarian")?.role ||
    roles.find((r) => r.role === "viewer")?.role ||
    roles.find((r) => r.role === "faculty")?.role ||
    roles.find((r) => r.role === "user" || r.role === "staff")?.role ||
    null
  );
}

export function getRoleDefaultPath(role: string | null): string {
  switch (role) {
    case "hod":
      return "/hod";
    case "principle":
    case "principal":
      return "/principal";
    case "procurement_officer":
    case "procurement_executive":
      return "/procurement";
    case "stores":
      return "/procurement/grns";
    case "finance":
      return "/procurement/invoices";
    case "purchase_committee":
    case "evp":
    case "director_admin_finance":
      return "/procurement/approvals";
    case "librarian":
      return "/librarian";
    case "viewer":
      return "/viewer";
    case "admin":
      return "/";
    default:
      return "/";
  }
}

/** Roles whose work is all procurement: their Dashboard is the Procurement Hub. */
const PROCUREMENT_DASHBOARD_ROLES = [
  "procurement_officer",
  "procurement_executive",
  "finance",
  "stores",
  "evp",
  "director_admin_finance",
  "purchase_committee",
];

/**
 * Where the sidebar's "Dashboard" button goes. For procurement roles this is the Hub,
 * not their landing work page (invoices, GRNs, approvals…), which already has its own
 * sidebar item. Login still lands on getRoleDefaultPath().
 */
export function getRoleDashboardPath(role: string | null): string {
  return role && PROCUREMENT_DASHBOARD_ROLES.includes(role) ? "/procurement" : getRoleDefaultPath(role);
}

const getCachedRoles = (): RoleEntry[] => {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem("amc_roles");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const getCachedUserId = (): string | null => {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("amc_user_id") || null;
  } catch (e) {
    return null;
  }
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userId, setUserId] = useState<string | null>(getCachedUserId);
  const [user, setUser] = useState<any>(null);
  const [roles, setRoles] = useState<RoleEntry[]>(getCachedRoles);
  const [loading, setLoading] = useState<boolean>(() => {
    // If we have cached roles, initial render is already pre-resolved
    return !getCachedUserId();
  });

  const load = async () => {
    try {
      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();
      // Network trouble (offline, waking from sleep): keep the cached user and roles.
      if (userError && userError.name !== "AuthSessionMissingError") return;
      setUserId(authUser?.id ?? null);
      setUser(authUser ?? null);
      if (!authUser) {
        setRoles([]);
        try {
          localStorage.removeItem("amc_roles");
          localStorage.removeItem("amc_user_id");
        } catch (e) { }
        return;
      }

      try {
        localStorage.setItem("amc_user_id", authUser.id);
      } catch (e) { }

      const { data: roleData, error } = await supabase
        .from("user_roles")
        .select("role,department_id")
        .eq("user_id", authUser.id);

      if (error) {
        console.error("Failed to fetch user roles", error);
      } else {
        const fetchedRoles = (roleData as RoleEntry[]) || [];
        setRoles(fetchedRoles);
        try {
          localStorage.setItem("amc_roles", JSON.stringify(fetchedRoles));
        } catch (e) { }
      }
    } catch (err) {
      console.error("AuthProvider load failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Only a real sign-out clears the user; a failed refresh while offline doesn't.
      if (!session && event !== "SIGNED_OUT") return;
      if (!session) {
        setUserId(null);
        setUser(null);
        setRoles([]);
        try {
          localStorage.removeItem("amc_roles");
          localStorage.removeItem("amc_user_id");
        } catch (e) { }
        setLoading(false);
      } else {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const hasRole = (role: string) => {
    const target = role === "principle" ? "principal" : role;
    return roles.some((r) => {
      const canonical = r.role === "principle" ? "principal" : r.role;
      return canonical === target;
    });
  };

  const primaryRole = computePrimaryRole(roles);

  const departmentId =
    roles.find((r) => r.role === "hod" && r.department_id)?.department_id ||
    roles.find((r) => r.role === "faculty" && r.department_id)?.department_id ||
    roles.find((r) => r.department_id)?.department_id ||
    undefined;

  return (
    <AuthContext.Provider
      value={{ userId, user, roles, primaryRole, departmentId, loading, hasRole, refresh: load }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export default AuthContext;
