-- Any signed-in user could insert {user_id: self, role: 'admin'} and become admin.
-- Self-insert is only needed for the default 'viewer' role at signup (src/pages/Auth.tsx);
-- every other role is assigned by an admin (UserManagement / admin users.functions via service role).
-- Apply by hand as reviewed SQL; never via `supabase db push`.
begin;
drop policy if exists user_roles_insert_own_or_admin on public.user_roles;
create policy user_roles_insert_own_or_admin on public.user_roles for insert to authenticated
  with check (
    (user_id = auth.uid() and role = 'viewer')
    or has_role(auth.uid(), 'admin')
  );
commit;
