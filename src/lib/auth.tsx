import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type RoleEntry = { role: string; department_id?: string | null };

export type AuthContextValue = {
  userId: string | null;
  roles: RoleEntry[];
  primaryRole: string | null;
  departmentId?: string | null;
  hasRole: (role: string) => boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleEntry[]>([]);

  const load = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      if (!user) {
        setRoles([]);
        return;
      }

      const { data: roleData } = await supabase.from('user_roles').select('role,department_id').eq('user_id', user.id);
      setRoles((roleData as RoleEntry[]) || []);
      try { localStorage.setItem('amc_roles', JSON.stringify(roleData || [])); } catch (e) { }
    } catch (err) {
      console.error('AuthProvider load failed', err);
    }
  };

  useEffect(() => {
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) {
        setUserId(null);
        setRoles([]);
        try { localStorage.removeItem('amc_roles'); } catch (e) {}
      } else {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const hasRole = (role: string) => {
    const target = role === 'principle' ? 'principal' : role;
    return roles.some(r => {
      const canonical = r.role === 'principle' ? 'principal' : r.role;
      return canonical === target;
    });
  };

  const primaryRole =
    roles.find(r => r.role === 'admin')?.role ||
    roles.find(r => r.role === 'evp')?.role ||
    roles.find(r => r.role === 'director_admin_finance')?.role ||
    roles.find(r => r.role === 'purchase_committee')?.role ||
    roles.find(r => r.role === 'principal' || r.role === 'principle')?.role ||
    roles.find(r => r.role === 'procurement_officer')?.role ||
    roles.find(r => r.role === 'procurement_executive')?.role ||
    roles.find(r => r.role === 'hod')?.role ||
    roles.find(r => r.role === 'stores')?.role ||
    roles.find(r => r.role === 'finance')?.role ||
    roles.find(r => r.role === 'librarian')?.role ||
    roles.find(r => r.role === 'viewer')?.role ||
    null;

  const departmentId = roles.find(r => r.role === 'hod')?.department_id ?? undefined;

  return (
    <AuthContext.Provider value={{ userId, roles, primaryRole, departmentId, hasRole, refresh: load }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
