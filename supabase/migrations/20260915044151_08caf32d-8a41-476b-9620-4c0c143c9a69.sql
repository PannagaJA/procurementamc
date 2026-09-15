-- =========================================================================
-- Baseline schema reconstructed from application code usage
-- =========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin','principle','principal','hod','librarian','viewer','user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_status as enum (
    'pending','in-progress','waiting-for-user','resolved','completed',
    'pending_principal',
    'procure-in-progress','procure-completed','procure-approved','procure-rejected',
    'service-approved','service-rejected'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_priority as enum ('low','medium','high');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- Tables
-- =========================================================================

-- profiles: 1:1 with auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- user_roles
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  department_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- locations
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefix text,
  building text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- departments
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefix text,
  location_id uuid references public.locations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_roles
  add constraint user_roles_department_id_fkey
  foreign key (department_id) references public.departments(id) on delete set null;

-- categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefix text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name),
  unique (prefix)
);

-- inventory
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  item_code text unique,
  item_name text not null,
  category_id uuid references public.categories(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  department text,
  department_id uuid references public.departments(id) on delete set null,
  quantity_available integer not null default 1,
  cost_per_unit numeric(12,2) default 0,
  vendor_name text,
  vendor_contact text,
  vendor_address text,
  status text not null default 'in-use',
  qr_code_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- inventory_history
create table if not exists public.inventory_history (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  action text,
  details jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- quotations
create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  company_email text not null,
  description text,
  product_name text,
  quantity integer default 1,
  last_reply_date date,
  status text not null default 'sent',
  admin_status text default 'pending',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- quotation_responses (vendors respond via public link -> anon access needed)
create table if not exists public.quotation_responses (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  company_email text,
  description text,
  total_amount numeric(12,2),
  quotation_validity date,
  terms_accepted boolean default false,
  submitted_at timestamptz not null default now(),
  unique (quotation_id)
);

-- tickets
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique,
  name text,
  email text,
  contact_number text,
  department text,
  issue_category text,
  issue_description text,
  priority text not null default 'medium',
  status text not null default 'pending',
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ticket_updates
create table if not exists public.ticket_updates (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  status_from text,
  status_to text,
  admin_notes text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  meta jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- audit_logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  user_id uuid references auth.users(id) on delete set null,
  details jsonb,
  created_at timestamptz not null default now()
);

-- library_books
create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  category text,
  isbn text,
  quantity integer not null default 0,
  available integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- library_members
create table if not exists public.library_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- library_issues
create table if not exists public.library_issues (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.library_books(id) on delete cascade,
  member_id uuid not null references public.library_members(id) on delete cascade,
  issue_date date not null default current_date,
  due_date date,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- updated_at triggers
-- =========================================================================
do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','locations','departments','categories','inventory',
    'quotations','library_books','library_members'
  ])
  loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- =========================================================================
-- has_role function
-- =========================================================================
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- =========================================================================
-- RPCs
-- =========================================================================

-- Trigger to keep library_books.available in sync when an issue is deleted (returned)
create or replace function public.library_issue_return_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.library_books
    set available = available + 1
    where id = old.book_id;
  return old;
end;
$$;

drop trigger if exists library_issue_after_delete on public.library_issues;
create trigger library_issue_after_delete
  after delete on public.library_issues
  for each row execute function public.library_issue_return_trigger();

create or replace function public.library_issue_create_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.library_books
    set available = greatest(available - 1, 0)
    where id = new.book_id;
  return new;
end;
$$;

drop trigger if exists library_issue_after_insert on public.library_issues;
create trigger library_issue_after_insert
  after insert on public.library_issues
  for each row execute function public.library_issue_create_trigger();

-- generate_ticket_number(): TKT-<year>-<sequential 4 digit>
create sequence if not exists public.ticket_number_seq;

create or replace function public.generate_ticket_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_val bigint;
  ticket_number text;
begin
  next_val := nextval('public.ticket_number_seq');
  ticket_number := 'TKT-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 4, '0');
  return ticket_number;
end;
$$;

-- =========================================================================
-- Grants + RLS
-- =========================================================================

do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','user_roles','departments','categories','locations',
    'inventory','inventory_history','quotations','quotation_responses',
    'tickets','ticket_updates','notifications','audit_logs',
    'library_books','library_members','library_issues'
  ])
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all on public.%I to service_role;', t);
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- Extra anon grants for vendor quotation response flow
grant select, insert, update on public.quotation_responses to anon;
grant select on public.quotations to anon;

-- ---------------------------------------------------------------------
-- Generic policies
-- ---------------------------------------------------------------------

-- profiles
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles for update to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- user_roles
drop policy if exists "user_roles_select_all" on public.user_roles;
create policy "user_roles_select_all" on public.user_roles for select to authenticated using (true);
drop policy if exists "user_roles_insert_own_or_admin" on public.user_roles;
create policy "user_roles_insert_own_or_admin" on public.user_roles for insert to authenticated with check (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "user_roles_update_admin" on public.user_roles;
create policy "user_roles_update_admin" on public.user_roles for update to authenticated using (public.has_role(auth.uid(),'admin'));
drop policy if exists "user_roles_delete_admin" on public.user_roles;
create policy "user_roles_delete_admin" on public.user_roles for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- departments
drop policy if exists "departments_select_all" on public.departments;
create policy "departments_select_all" on public.departments for select to authenticated using (true);
drop policy if exists "departments_write_admin" on public.departments;
create policy "departments_write_admin" on public.departments for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "departments_update_admin" on public.departments;
create policy "departments_update_admin" on public.departments for update to authenticated using (public.has_role(auth.uid(),'admin'));
drop policy if exists "departments_delete_admin" on public.departments;
create policy "departments_delete_admin" on public.departments for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- categories
drop policy if exists "categories_select_all" on public.categories;
create policy "categories_select_all" on public.categories for select to authenticated using (true);
drop policy if exists "categories_write_admin" on public.categories;
create policy "categories_write_admin" on public.categories for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "categories_update_admin" on public.categories;
create policy "categories_update_admin" on public.categories for update to authenticated using (public.has_role(auth.uid(),'admin'));
drop policy if exists "categories_delete_admin" on public.categories;
create policy "categories_delete_admin" on public.categories for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- locations
drop policy if exists "locations_select_all" on public.locations;
create policy "locations_select_all" on public.locations for select to authenticated using (true);
drop policy if exists "locations_write_admin" on public.locations;
create policy "locations_write_admin" on public.locations for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "locations_update_admin" on public.locations;
create policy "locations_update_admin" on public.locations for update to authenticated using (public.has_role(auth.uid(),'admin'));
drop policy if exists "locations_delete_admin" on public.locations;
create policy "locations_delete_admin" on public.locations for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- inventory
drop policy if exists "inventory_select_all" on public.inventory;
create policy "inventory_select_all" on public.inventory for select to authenticated using (true);
drop policy if exists "inventory_insert_auth" on public.inventory;
create policy "inventory_insert_auth" on public.inventory for insert to authenticated with check (created_by = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "inventory_update_own_or_admin" on public.inventory;
create policy "inventory_update_own_or_admin" on public.inventory for update to authenticated using (created_by = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "inventory_delete_admin" on public.inventory;
create policy "inventory_delete_admin" on public.inventory for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- inventory_history
drop policy if exists "inventory_history_select_all" on public.inventory_history;
create policy "inventory_history_select_all" on public.inventory_history for select to authenticated using (true);
drop policy if exists "inventory_history_insert_auth" on public.inventory_history;
create policy "inventory_history_insert_auth" on public.inventory_history for insert to authenticated with check (changed_by = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "inventory_history_update_admin" on public.inventory_history;
create policy "inventory_history_update_admin" on public.inventory_history for update to authenticated using (public.has_role(auth.uid(),'admin'));
drop policy if exists "inventory_history_delete_admin" on public.inventory_history;
create policy "inventory_history_delete_admin" on public.inventory_history for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- quotations
drop policy if exists "quotations_select_all" on public.quotations;
create policy "quotations_select_all" on public.quotations for select to authenticated using (true);
drop policy if exists "quotations_select_anon" on public.quotations;
create policy "quotations_select_anon" on public.quotations for select to anon using (true);
drop policy if exists "quotations_insert_auth" on public.quotations;
create policy "quotations_insert_auth" on public.quotations for insert to authenticated with check (created_by = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "quotations_update_own_or_admin" on public.quotations;
create policy "quotations_update_own_or_admin" on public.quotations for update to authenticated using (created_by = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "quotations_delete_admin" on public.quotations;
create policy "quotations_delete_admin" on public.quotations for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- quotation_responses (vendors respond anonymously via link)
drop policy if exists "quotation_responses_select_all" on public.quotation_responses;
create policy "quotation_responses_select_all" on public.quotation_responses for select to authenticated using (true);
drop policy if exists "quotation_responses_select_anon" on public.quotation_responses;
create policy "quotation_responses_select_anon" on public.quotation_responses for select to anon using (true);
drop policy if exists "quotation_responses_insert_anon" on public.quotation_responses;
create policy "quotation_responses_insert_anon" on public.quotation_responses for insert to anon with check (true);
drop policy if exists "quotation_responses_insert_auth" on public.quotation_responses;
create policy "quotation_responses_insert_auth" on public.quotation_responses for insert to authenticated with check (true);
drop policy if exists "quotation_responses_update_anon" on public.quotation_responses;
create policy "quotation_responses_update_anon" on public.quotation_responses for update to anon using (true);
drop policy if exists "quotation_responses_update_admin" on public.quotation_responses;
create policy "quotation_responses_update_admin" on public.quotation_responses for update to authenticated using (public.has_role(auth.uid(),'admin'));
drop policy if exists "quotation_responses_delete_admin" on public.quotation_responses;
create policy "quotation_responses_delete_admin" on public.quotation_responses for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- tickets
drop policy if exists "tickets_select_all" on public.tickets;
create policy "tickets_select_all" on public.tickets for select to authenticated using (true);
drop policy if exists "tickets_insert_auth" on public.tickets;
create policy "tickets_insert_auth" on public.tickets for insert to authenticated with check (created_by = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "tickets_update_own_or_admin" on public.tickets;
create policy "tickets_update_own_or_admin" on public.tickets for update to authenticated using (created_by = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'principle') or public.has_role(auth.uid(),'hod'));
drop policy if exists "tickets_delete_admin" on public.tickets;
create policy "tickets_delete_admin" on public.tickets for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- ticket_updates
drop policy if exists "ticket_updates_select_all" on public.ticket_updates;
create policy "ticket_updates_select_all" on public.ticket_updates for select to authenticated using (true);
drop policy if exists "ticket_updates_insert_auth" on public.ticket_updates;
create policy "ticket_updates_insert_auth" on public.ticket_updates for insert to authenticated with check (updated_by = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "ticket_updates_update_admin" on public.ticket_updates;
create policy "ticket_updates_update_admin" on public.ticket_updates for update to authenticated using (public.has_role(auth.uid(),'admin'));
drop policy if exists "ticket_updates_delete_admin" on public.ticket_updates;
create policy "ticket_updates_delete_admin" on public.ticket_updates for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- notifications
drop policy if exists "notifications_select_own_or_admin" on public.notifications;
create policy "notifications_select_own_or_admin" on public.notifications for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "notifications_insert_auth" on public.notifications;
create policy "notifications_insert_auth" on public.notifications for insert to authenticated with check (true);
drop policy if exists "notifications_update_own_or_admin" on public.notifications;
create policy "notifications_update_own_or_admin" on public.notifications for update to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "notifications_delete_own_or_admin" on public.notifications;
create policy "notifications_delete_own_or_admin" on public.notifications for delete to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- audit_logs
drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin" on public.audit_logs for select to authenticated using (public.has_role(auth.uid(),'admin') or user_id = auth.uid());
drop policy if exists "audit_logs_insert_auth" on public.audit_logs;
create policy "audit_logs_insert_auth" on public.audit_logs for insert to authenticated with check (true);
drop policy if exists "audit_logs_update_admin" on public.audit_logs;
create policy "audit_logs_update_admin" on public.audit_logs for update to authenticated using (public.has_role(auth.uid(),'admin'));
drop policy if exists "audit_logs_delete_admin" on public.audit_logs;
create policy "audit_logs_delete_admin" on public.audit_logs for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- library_books
drop policy if exists "library_books_select_all" on public.library_books;
create policy "library_books_select_all" on public.library_books for select to authenticated using (true);
drop policy if exists "library_books_write_librarian_or_admin" on public.library_books;
create policy "library_books_write_librarian_or_admin" on public.library_books for insert to authenticated with check (public.has_role(auth.uid(),'librarian') or public.has_role(auth.uid(),'admin'));
drop policy if exists "library_books_update_librarian_or_admin" on public.library_books;
create policy "library_books_update_librarian_or_admin" on public.library_books for update to authenticated using (public.has_role(auth.uid(),'librarian') or public.has_role(auth.uid(),'admin'));
drop policy if exists "library_books_delete_librarian_or_admin" on public.library_books;
create policy "library_books_delete_librarian_or_admin" on public.library_books for delete to authenticated using (public.has_role(auth.uid(),'librarian') or public.has_role(auth.uid(),'admin'));

-- library_members
drop policy if exists "library_members_select_all" on public.library_members;
create policy "library_members_select_all" on public.library_members for select to authenticated using (true);
drop policy if exists "library_members_write_librarian_or_admin" on public.library_members;
create policy "library_members_write_librarian_or_admin" on public.library_members for insert to authenticated with check (public.has_role(auth.uid(),'librarian') or public.has_role(auth.uid(),'admin'));
drop policy if exists "library_members_update_librarian_or_admin" on public.library_members;
create policy "library_members_update_librarian_or_admin" on public.library_members for update to authenticated using (public.has_role(auth.uid(),'librarian') or public.has_role(auth.uid(),'admin'));
drop policy if exists "library_members_delete_librarian_or_admin" on public.library_members;
create policy "library_members_delete_librarian_or_admin" on public.library_members for delete to authenticated using (public.has_role(auth.uid(),'librarian') or public.has_role(auth.uid(),'admin'));

-- library_issues
drop policy if exists "library_issues_select_all" on public.library_issues;
create policy "library_issues_select_all" on public.library_issues for select to authenticated using (true);
drop policy if exists "library_issues_write_librarian_or_admin" on public.library_issues;
create policy "library_issues_write_librarian_or_admin" on public.library_issues for insert to authenticated with check (public.has_role(auth.uid(),'librarian') or public.has_role(auth.uid(),'admin'));
drop policy if exists "library_issues_update_librarian_or_admin" on public.library_issues;
create policy "library_issues_update_librarian_or_admin" on public.library_issues for update to authenticated using (public.has_role(auth.uid(),'librarian') or public.has_role(auth.uid(),'admin'));
drop policy if exists "library_issues_delete_librarian_or_admin" on public.library_issues;
create policy "library_issues_delete_librarian_or_admin" on public.library_issues for delete to authenticated using (public.has_role(auth.uid(),'librarian') or public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- Optional seed data
-- =========================================================================
insert into public.locations (name, prefix, building)
select 'Main Campus', 'MC', 'Building A'
where not exists (select 1 from public.locations);

insert into public.categories (name, prefix)
select 'General', 'GEN'
where not exists (select 1 from public.categories);