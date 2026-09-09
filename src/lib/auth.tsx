import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type RoleEntry = { role: string; department_id?: string | null };

export type AuthContextValue = {
  userId: string | null;
  roles: RoleEntry[];
  primaryRole: string | null;
  departmentId?: string | null;
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
      // cache in localStorage for quick access
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

  const primaryRole = roles.find(r => r.role === 'admin') ? 'admin' : roles.find(r => r.role === 'principle') ? 'principle' : roles.find(r => r.role === 'hod') ? 'hod' : roles.find(r => r.role === 'librarian') ? 'librarian' : roles.find(r => r.role === 'viewer') ? 'viewer' : null;
  const departmentId = roles.find(r => r.role === 'hod')?.department_id ?? undefined;

  return (
    <AuthContext.Provider value={{ userId, roles, primaryRole, departmentId, refresh: load }}>
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
