-- Chairman / Vice Chairman: EVP authority. Auditor / Corporate Office: read everything, write nothing.
-- (DECISIONS.md Q18.) Mirrors src/lib/roleAliases.ts. Requires 20261105000001_new_roles_enum.sql.
-- Apply by hand as reviewed SQL; never via `supabase db push`.
begin;

-- 1. has_role(u, 'evp') is also true for a Chairman or Vice Chairman, so every EVP policy applies.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and (
        role = _role
        or (_role = 'principal'::public.app_role and role = 'principle'::public.app_role)
        or (_role = 'principle'::public.app_role and role = 'principal'::public.app_role)
        or (_role = 'evp'::public.app_role
            and role in ('chairman'::public.app_role, 'vice_chairman'::public.app_role))
      )
  );
$$;

create or replace function public.is_procurement_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role in ('admin', 'super_admin', 'evp', 'chairman', 'vice_chairman',
                   'director_admin_finance', 'purchase_committee', 'principal', 'principle',
                   'procurement_officer', 'procurement_executive', 'finance', 'stores',
                   'auditor', 'corporate_office')
  )
$$;

-- 2. Read-only overseers.
create or replace function public.is_oversight(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('auditor', 'corporate_office')
  )
$$;

-- Holds only read-only roles (an auditor who is also, say, finance keeps finance's writes).
-- Mirrors isReadOnlyUser() in src/lib/roleAliases.ts.
create or replace function public.is_read_only(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_oversight(_user_id)
     and not exists (
       select 1 from public.user_roles
       where user_id = _user_id and role not in ('auditor', 'corporate_office')
     )
$$;

-- Per RLS table: one permissive SELECT policy (reads are OR'ed, so this only adds reads) and
-- RESTRICTIVE insert/update/delete policies (AND'ed with every existing policy), so a read-only
-- user can't write even where a table lets any signed-in user write (e.g. raising a ticket).
-- The service role bypasses RLS; server functions check isReadOnlyUser themselves.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and rowsecurity loop
    execute format('drop policy if exists oversight_read_all on public.%I', t.tablename);
    execute format(
      'create policy oversight_read_all on public.%I for select to authenticated using ((select public.is_oversight(auth.uid())))',
      t.tablename);
    execute format('drop policy if exists read_only_no_insert on public.%I', t.tablename);
    execute format(
      'create policy read_only_no_insert on public.%I as restrictive for insert to authenticated with check (not (select public.is_read_only(auth.uid())))',
      t.tablename);
    execute format('drop policy if exists read_only_no_update on public.%I', t.tablename);
    execute format(
      'create policy read_only_no_update on public.%I as restrictive for update to authenticated using (not (select public.is_read_only(auth.uid())))',
      t.tablename);
    execute format('drop policy if exists read_only_no_delete on public.%I', t.tablename);
    execute format(
      'create policy read_only_no_delete on public.%I as restrictive for delete to authenticated using (not (select public.is_read_only(auth.uid())))',
      t.tablename);
  end loop;
end $$;

-- 3. Private bucket for PO PDFs shared over WhatsApp. Only the server (service role) reads and
-- writes it; vendors get a time-limited signed URL (sharePoLink in po.functions.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('po-documents', 'po-documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

commit;
