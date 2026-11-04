-- Tickets hardening (verified by scripts/verify_tickets.mjs).
-- Apply by hand as reviewed SQL; never via `supabase db push` (see CLAUDE.md).
begin;

-- 1. updated_at was never maintained (reports' resolution time was always ~0h).
drop trigger if exists tickets_set_updated_at on public.tickets;
create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

-- 2. Status and number are decided by the server, not the client.
create or replace function public.tickets_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role / backend jobs
  new.status := case when public.has_role(new.created_by, 'hod') then 'pending_principal' else 'pending' end;
  if new.ticket_number is null then new.ticket_number := public.generate_ticket_number(); end if;
  return new;
end $$;

drop trigger if exists tickets_before_insert on public.tickets;
create trigger tickets_before_insert
  before insert on public.tickets
  for each row execute function public.tickets_before_insert();

-- 3. Status transitions:
--    pending_principal -> *-approved / *-rejected : Principal only, never the requester
--    *-approved / *-rejected are only reachable that way; *-rejected is final
--    everything else                               : admin only
create or replace function public.tickets_guard_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  decision constant text[] := array['procure-approved','procure-rejected','service-approved','service-rejected'];
begin
  if uid is null or new.status is not distinct from old.status then return new; end if;

  if old.status = 'pending_principal' or new.status = any(decision) then
    if old.status = 'pending_principal' and new.status = any(decision)
       and public.has_role(uid, 'principal') and uid is distinct from old.created_by then
      return new;
    end if;
    raise exception 'Only the Principal can approve or reject a pending request (and not their own)'
      using errcode = '42501';
  end if;

  if old.status in ('procure-rejected','service-rejected') then
    raise exception 'A rejected request cannot be reopened' using errcode = '42501';
  end if;
  if new.status = 'pending_principal' or not public.has_role(uid, 'admin') then
    raise exception 'Only an admin can change ticket status' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists tickets_guard_status on public.tickets;
create trigger tickets_guard_status
  before update of status on public.tickets
  for each row execute function public.tickets_guard_status();

-- 4. Row access. HODs no longer edit every ticket; reads are scoped.
drop policy if exists tickets_update_own_or_admin on public.tickets;
create policy tickets_update_own_or_admin on public.tickets for update to authenticated
  using (created_by = auth.uid() or has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'principal'))
  with check (created_by = auth.uid() or has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'principal'));

drop policy if exists tickets_select_all on public.tickets;
drop policy if exists tickets_select_scoped on public.tickets;
create policy tickets_select_scoped on public.tickets for select to authenticated
  using (
    created_by = auth.uid()
    or has_role(auth.uid(), 'admin')
    or has_role(auth.uid(), 'principal')
    or has_role(auth.uid(), 'viewer')
    or exists (
      select 1 from public.user_roles ur
      join public.departments d on d.id = ur.department_id
      where ur.user_id = auth.uid() and ur.role = 'hod' and d.name = tickets.department
    )
  );

-- History follows ticket visibility (the subquery runs under the caller's tickets policy).
drop policy if exists ticket_updates_select_all on public.ticket_updates;
drop policy if exists ticket_updates_select_scoped on public.ticket_updates;
create policy ticket_updates_select_scoped on public.ticket_updates for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_updates.ticket_id));

-- Only the people who act on tickets write history, as themselves.
drop policy if exists ticket_updates_insert_auth on public.ticket_updates;
create policy ticket_updates_insert_auth on public.ticket_updates for insert to authenticated
  with check (
    updated_by = auth.uid()
    and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'principal'))
    and exists (select 1 from public.tickets t where t.id = ticket_updates.ticket_id)
  );

commit;
