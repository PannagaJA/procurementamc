-- =========================================================================
-- Baseline schema reconstructed from application code usage
-- =========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum (
    'admin',
    'principle',
    'principal',
    'hod',
    'librarian',
    'viewer',
    'user',
    'evp',
    'director_admin_finance',
    'purchase_committee',
    'procurement_officer',
    'procurement_executive',
    'stores',
    'finance',
    'faculty',
    'staff',
    'student',
    'super_admin',
    'initiator',
    'requisitioner',
    'auditor'
  );
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
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS sl_no bigserial,
  ADD COLUMN IF NOT EXISTS specifications text,
  ADD COLUMN IF NOT EXISTS asset_type text,
  ADD COLUMN IF NOT EXISTS room_no text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS invoice_no text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS approval_letter_ref text,
  ADD COLUMN IF NOT EXISTS approval_letter_date date,
  ADD COLUMN IF NOT EXISTS item_photo_url text,
  ADD COLUMN IF NOT EXISTS invoice_photo_url text,
  ADD COLUMN IF NOT EXISTS approval_letter_photo_url text,
  ADD COLUMN IF NOT EXISTS gps_latitude numeric(10,6),
  ADD COLUMN IF NOT EXISTS gps_longitude numeric(10,6),
  ADD COLUMN IF NOT EXISTS total_cost numeric(14,2)
    GENERATED ALWAYS AS (coalesce(cost_per_unit,0) * coalesce(quantity_available,0)) STORED;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS category text;

-- Security hardening
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.library_issue_return_trigger() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.library_issue_create_trigger() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_ticket_number() FROM anon, public;-- =========================================================================
-- DAY 1 — Procurement Foundation Migration (SOP §6, §8.2, §8.3, §13)
-- =========================================================================

-- 1. app_role enum defined at top of schema

-- 2. Extend user_roles columns & normalize 'principle' -> 'principal'
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_notes text;

-- Canonicalize legacy 'principle' role records in user_roles to 'principal'
UPDATE public.user_roles
SET role = 'principal'::public.app_role
WHERE role = 'principle'::public.app_role;

-- 3. Vendors (§8.2)
CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  registered_address text,
  gst_number text,
  pan_number text,
  bank_details_json jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'under_review', 'empanelled', 'suspended', 'debarred', 'rejected')),
  empanelled_on date,
  empanelment_expiry date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  technical_capability numeric CHECK (technical_capability >= 0 AND technical_capability <= 100),
  experience_past_performance numeric CHECK (experience_past_performance >= 0 AND experience_past_performance <= 100),
  service_support numeric CHECK (service_support >= 0 AND service_support <= 100),
  financial_reasonableness numeric CHECK (financial_reasonableness >= 0 AND financial_reasonableness <= 100),
  decision text NOT NULL CHECK (decision IN ('recommend', 'not_recommend')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS public.vendor_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  reason text NOT NULL,
  blacklisted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  blacklisted_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Purchase Requisitions (§8.3)
CREATE SEQUENCE IF NOT EXISTS public.pr_number_seq START 1001;

CREATE OR REPLACE FUNCTION public.generate_pr_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr text;
  seq_val bigint;
BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('public.pr_number_seq');
  RETURN 'PR-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.purchase_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number text UNIQUE DEFAULT public.generate_pr_number(),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN (
    'routine_consumable',
    'equipment_asset',
    'software',
    'academic_research',
    'services_amc',
    'maintenance',
    'small_value'
  )),
  scope text NOT NULL CHECK (scope IN ('academic', 'operational')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'escalated_to_evp',
    'archived'
  )),
  budget_head text,
  estimated_value numeric(14,2) NOT NULL DEFAULT 0,
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_frequency text,
  is_emergency boolean NOT NULL DEFAULT false,
  justification text,
  market_survey_notes text,
  current_approver_role text,
  routing_reason text,
  source text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pr_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  description text NOT NULL,
  unit text,
  qty_required numeric(12,2) NOT NULL DEFAULT 1,
  qty_in_stock numeric(12,2) NOT NULL DEFAULT 0,
  net_qty_to_procure numeric(12,2) NOT NULL DEFAULT 1,
  est_unit_price numeric(14,2) NOT NULL DEFAULT 0,
  est_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pr_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  stage text NOT NULL,
  approver_role text NOT NULL,
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision text NOT NULL,
  remarks text,
  decided_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Authority Matrix Engine (§6)
CREATE TABLE IF NOT EXISTS public.approval_matrix_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  method text,
  per_txn_limit numeric(14,2),
  per_month_limit numeric(14,2),
  approval_role text NOT NULL,
  min_quotations integer NOT NULL DEFAULT 0,
  requires_rate_contract boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.department_monthly_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  month date NOT NULL,
  category text NOT NULL,
  total_spent numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, month, category)
);

CREATE TABLE IF NOT EXISTS public.deviation_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  po_id uuid,
  justification text NOT NULL,
  risk_assessment text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procurement_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text
);

-- Seed configuration
INSERT INTO public.procurement_config (key, value, description)
VALUES ('monthly_aggregation_dimension', 'department', 'Aggregation scope for monthly spend limits (department | institution)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Seed Authority Matrix Rules (SOP §6, using literal ₹10,000 cap per DECISIONS.md Q1)
INSERT INTO public.approval_matrix_rules (category, method, per_txn_limit, per_month_limit, approval_role, min_quotations, requires_rate_contract, active)
VALUES
  -- Small value / direct purchase
  ('small_value', 'direct_purchase', 2000, 5000, 'hod', 0, false, true),
  ('small_value', 'small_value_po', 5000, 30000, 'principal', 0, false, true),
  ('small_value', 'small_value_po', 5000, 30000, 'procurement_officer', 0, false, true),
  -- Routine consumables on rate contract
  ('routine_consumable', 'rate_contract', NULL, 100000, 'procurement_officer', 3, true, true),
  -- Equipment, Software, Academic/Research, Services/AMC, Maintenance
  ('equipment_asset', 'comparative_quotations', 10000, 50000, 'purchase_committee', 3, false, true),
  ('software', 'comparative_quotations', 10000, 50000, 'purchase_committee', 3, false, true),
  ('academic_research', 'comparative_quotations', 10000, 50000, 'purchase_committee', 3, false, true),
  ('services_amc', 'comparative_quotations', 10000, 50000, 'purchase_committee', 3, false, true),
  ('maintenance', 'comparative_quotations', 10000, 50000, 'purchase_committee', 3, false, true);

-- 6. Trigger for updated_at on new tables
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'vendors',
    'purchase_requisitions',
    'department_monthly_spend'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I;', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t);
  END LOOP;
END $$;

-- 7. Update has_role helper to treat principle/principal interchangeably
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'principal'::public.app_role AND role = 'principle'::public.app_role)
        OR (_role = 'principle'::public.app_role AND role = 'principal'::public.app_role)
      )
  );
$$;

-- 8. Migrate legacy procure tickets per DECISIONS.md Q6
INSERT INTO public.purchase_requisitions (
  pr_number,
  department_id,
  requested_by,
  category,
  scope,
  status,
  justification,
  source,
  created_at
)
SELECT
  coalesce(t.ticket_number, 'LEGACY-' || t.id::text),
  t.department::uuid, -- handles if department was stored as uuid or null
  t.created_by,
  'small_value',
  'operational',
  'archived',
  coalesce(t.issue_description, 'Migrated legacy procurement ticket'),
  'legacy_ticket',
  t.created_at
FROM public.tickets t
WHERE t.issue_category = 'procure'
ON CONFLICT (pr_number) DO NOTHING;

-- 9. Row Level Security Policies (DEFAULT DENY, EXPLICIT GRANT)
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_matrix_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_monthly_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deviation_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_config ENABLE ROW LEVEL SECURITY;

-- Vendors policies
DROP POLICY IF EXISTS "Vendors readable by authenticated users" ON public.vendors;
CREATE POLICY "Vendors readable by authenticated users"
  ON public.vendors FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Vendors insertable by authenticated users" ON public.vendors;
CREATE POLICY "Vendors insertable by authenticated users"
  ON public.vendors FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Vendors updatable by procurement and evp and admin" ON public.vendors;
CREATE POLICY "Vendors updatable by procurement and evp and admin"
  ON public.vendors FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
  );

-- Vendor documents policies
DROP POLICY IF EXISTS "Vendor docs readable by authenticated users" ON public.vendor_documents;
CREATE POLICY "Vendor docs readable by authenticated users"
  ON public.vendor_documents FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Vendor docs insertable by authenticated users" ON public.vendor_documents;
CREATE POLICY "Vendor docs insertable by authenticated users"
  ON public.vendor_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Vendor evaluations policies
DROP POLICY IF EXISTS "Vendor evaluations readable by procurement and evp" ON public.vendor_evaluations;
CREATE POLICY "Vendor evaluations readable by procurement and evp"
  ON public.vendor_evaluations FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
  );

DROP POLICY IF EXISTS "Vendor evaluations insertable by procurement committee" ON public.vendor_evaluations;
CREATE POLICY "Vendor evaluations insertable by procurement committee"
  ON public.vendor_evaluations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
  );

-- Vendor blacklist policies
DROP POLICY IF EXISTS "Vendor blacklist readable by authenticated" ON public.vendor_blacklist;
CREATE POLICY "Vendor blacklist readable by authenticated"
  ON public.vendor_blacklist FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Vendor blacklist writable by evp and admin" ON public.vendor_blacklist;
CREATE POLICY "Vendor blacklist writable by evp and admin"
  ON public.vendor_blacklist FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- Purchase Requisitions policies
DROP POLICY IF EXISTS "PR readable by creator or procurement roles" ON public.purchase_requisitions;
CREATE POLICY "PR readable by creator or procurement roles"
  ON public.purchase_requisitions FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hod'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

DROP POLICY IF EXISTS "PR insertable by authenticated users" ON public.purchase_requisitions;
CREATE POLICY "PR insertable by authenticated users"
  ON public.purchase_requisitions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "PR updatable by approver roles or requester" ON public.purchase_requisitions;
CREATE POLICY "PR updatable by approver roles or requester"
  ON public.purchase_requisitions FOR UPDATE
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hod'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- PR Line items policies
DROP POLICY IF EXISTS "PR items readable by authenticated" ON public.pr_line_items;
CREATE POLICY "PR items readable by authenticated"
  ON public.pr_line_items FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "PR items insertable by authenticated" ON public.pr_line_items;
CREATE POLICY "PR items insertable by authenticated"
  ON public.pr_line_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- PR Approvals log policies
DROP POLICY IF EXISTS "PR approvals readable by authenticated" ON public.pr_approvals;
CREATE POLICY "PR approvals readable by authenticated"
  ON public.pr_approvals FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "PR approvals insertable by authenticated" ON public.pr_approvals;
CREATE POLICY "PR approvals insertable by authenticated"
  ON public.pr_approvals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Approval Matrix rules policies (read-only to users, editable by admin)
DROP POLICY IF EXISTS "Matrix rules readable by authenticated" ON public.approval_matrix_rules;
CREATE POLICY "Matrix rules readable by authenticated"
  ON public.approval_matrix_rules FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Matrix rules editable by admin" ON public.approval_matrix_rules;
CREATE POLICY "Matrix rules editable by admin"
  ON public.approval_matrix_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Department monthly spend policies
DROP POLICY IF EXISTS "Monthly spend readable by authenticated" ON public.department_monthly_spend;
CREATE POLICY "Monthly spend readable by authenticated"
  ON public.department_monthly_spend FOR SELECT
  TO authenticated
  USING (true);

-- Deviation approvals policies
DROP POLICY IF EXISTS "Deviations readable by authenticated" ON public.deviation_approvals;
CREATE POLICY "Deviations readable by authenticated"
  ON public.deviation_approvals FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Deviations writable by evp and admin" ON public.deviation_approvals;
CREATE POLICY "Deviations writable by evp and admin"
  ON public.deviation_approvals FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- Procurement config policies
DROP POLICY IF EXISTS "Config readable by authenticated" ON public.procurement_config;
CREATE POLICY "Config readable by authenticated"
  ON public.procurement_config FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Config editable by admin" ON public.procurement_config;
CREATE POLICY "Config editable by admin"
  ON public.procurement_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
-- =========================================================================
-- DAY 2 — RFQ, Vendor Evaluation, and Purchase Orders Migration (SOP §8.4, §8.5)
-- =========================================================================

-- 1. Sequences & Number Generators
CREATE SEQUENCE IF NOT EXISTS public.rfq_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.cs_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.po_number_seq START 1001;

CREATE OR REPLACE FUNCTION public.generate_rfq_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr text;
  seq_val bigint;
BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('public.rfq_number_seq');
  RETURN 'RFQ-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_cs_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr text;
  seq_val bigint;
BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('public.cs_number_seq');
  RETURN 'CS-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr text;
  seq_val bigint;
BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('public.po_number_seq');
  RETURN 'PO-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

-- 2. Rate Contracts Table (§8.2, §8.4, §8.5 — 6-month validity per Q8)
CREATE TABLE IF NOT EXISTS public.rate_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number text UNIQUE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  approved_rates_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. RFQs Table (§8.4)
CREATE TABLE IF NOT EXISTS public.rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number text UNIQUE DEFAULT public.generate_rfq_number(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  required_min_quotations integer NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'closed', 'cancelled')),
  response_deadline timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. RFQ Vendors Mapping (Empanelled vendors invited)
CREATE TABLE IF NOT EXISTS public.rfq_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  sent_at timestamptz,
  response_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rfq_id, vendor_id)
);

-- 5. Quotation Lines Table (Line-item quotation capture with technical compliance)
CREATE TABLE IF NOT EXISTS public.quotation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  pr_line_item_id uuid REFERENCES public.pr_line_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit text,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_price numeric(14,2) NOT NULL DEFAULT 0,
  delivery_days integer DEFAULT 7,
  warranty_months integer DEFAULT 12,
  meets_technical_spec boolean NOT NULL DEFAULT true,
  technical_remarks text,
  quotation_ref text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Comparative Statements Table (§8.4)
CREATE TABLE IF NOT EXISTS public.comparative_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cs_number text UNIQUE DEFAULT public.generate_cs_number(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  pr_id uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  prepared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  negotiation_notes text,
  price_reasonableness_notes text,
  recommended_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  recommended_total numeric(14,2),
  is_lowest_price boolean NOT NULL DEFAULT true,
  non_lowest_rationale text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  current_approver_role text,
  routing_reason text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. CS Line Scores Table (Price, Technical, Delivery, Warranty)
CREATE TABLE IF NOT EXISTS public.cs_line_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cs_id uuid NOT NULL REFERENCES public.comparative_statements(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  quoted_total numeric(14,2) NOT NULL DEFAULT 0,
  price_score numeric(5,2) DEFAULT 0,
  technical_score numeric(5,2) DEFAULT 0,
  delivery_score numeric(5,2) DEFAULT 0,
  warranty_score numeric(5,2) DEFAULT 0,
  total_score numeric(5,2) DEFAULT 0,
  rank integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Purchase Orders Table (§8.5)
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE DEFAULT public.generate_po_number(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE RESTRICT,
  cs_id uuid REFERENCES public.comparative_statements(id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('regular', 'rate_contract')),
  rate_contract_id uuid REFERENCES public.rate_contracts(id) ON DELETE SET NULL,
  scope_of_supply text,
  price numeric(14,2) NOT NULL DEFAULT 0,
  taxes numeric(14,2) NOT NULL DEFAULT 0,
  total_value numeric(14,2) GENERATED ALWAYS AS (price + taxes) STORED,
  delivery_timeline text,
  payment_terms text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'pending_approval',
    'approved',
    'issued',
    'amended',
    'closed',
    'partially_closed',
    'cancelled'
  )),
  original_approver_role text,
  current_approver_role text,
  routing_reason text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  issued_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. PO Amendments Table (§8.5 - tracks value and re-approval triggers)
CREATE TABLE IF NOT EXISTS public.po_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  changed_fields_json jsonb DEFAULT '{}'::jsonb,
  old_value_total numeric(14,2) NOT NULL,
  new_value_total numeric(14,2) NOT NULL,
  reason text NOT NULL,
  requires_reapproval boolean NOT NULL DEFAULT false,
  original_approver_role text,
  new_approver_role text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Triggers for updated_at
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'rate_contracts',
    'rfqs',
    'comparative_statements',
    'purchase_orders'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I;', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t);
  END LOOP;
END $$;

-- 11. Row Level Security Policies (DEFAULT DENY, EXPLICIT GRANTS)
ALTER TABLE public.rate_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comparative_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_line_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_amendments ENABLE ROW LEVEL SECURITY;

-- Rate Contracts RLS
DROP POLICY IF EXISTS "Rate contracts readable by authenticated" ON public.rate_contracts;
CREATE POLICY "Rate contracts readable by authenticated"
  ON public.rate_contracts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Rate contracts writable by procurement and admin" ON public.rate_contracts;
CREATE POLICY "Rate contracts writable by procurement and admin"
  ON public.rate_contracts FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- RFQs RLS
DROP POLICY IF EXISTS "RFQs readable by authenticated" ON public.rfqs;
CREATE POLICY "RFQs readable by authenticated"
  ON public.rfqs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "RFQs writable by procurement and admin" ON public.rfqs;
CREATE POLICY "RFQs writable by procurement and admin"
  ON public.rfqs FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
  );

-- RFQ Vendors RLS
DROP POLICY IF EXISTS "RFQ Vendors readable by authenticated" ON public.rfq_vendors;
CREATE POLICY "RFQ Vendors readable by authenticated"
  ON public.rfq_vendors FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "RFQ Vendors writable by procurement and admin" ON public.rfq_vendors;
CREATE POLICY "RFQ Vendors writable by procurement and admin"
  ON public.rfq_vendors FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
  );

-- Quotation Lines RLS
DROP POLICY IF EXISTS "Quotation lines readable by authenticated" ON public.quotation_lines;
CREATE POLICY "Quotation lines readable by authenticated"
  ON public.quotation_lines FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Quotation lines insertable by authenticated" ON public.quotation_lines;
CREATE POLICY "Quotation lines insertable by authenticated"
  ON public.quotation_lines FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
  );

-- Comparative Statements RLS
DROP POLICY IF EXISTS "CS readable by authenticated" ON public.comparative_statements;
CREATE POLICY "CS readable by authenticated"
  ON public.comparative_statements FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "CS writable by procurement and approvers" ON public.comparative_statements;
CREATE POLICY "CS writable by procurement and approvers"
  ON public.comparative_statements FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- CS Line Scores RLS
DROP POLICY IF EXISTS "CS line scores readable by authenticated" ON public.cs_line_scores;
CREATE POLICY "CS line scores readable by authenticated"
  ON public.cs_line_scores FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "CS line scores writable by committee" ON public.cs_line_scores;
CREATE POLICY "CS line scores writable by committee"
  ON public.cs_line_scores FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
  );

-- Purchase Orders RLS
DROP POLICY IF EXISTS "POs readable by authenticated" ON public.purchase_orders;
CREATE POLICY "POs readable by authenticated"
  ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "POs writable by procurement and approvers" ON public.purchase_orders;
CREATE POLICY "POs writable by procurement and approvers"
  ON public.purchase_orders FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- PO Amendments RLS
DROP POLICY IF EXISTS "Amendments readable by authenticated" ON public.po_amendments;
CREATE POLICY "Amendments readable by authenticated"
  ON public.po_amendments FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Amendments writable by procurement and approvers" ON public.po_amendments;
CREATE POLICY "Amendments writable by procurement and approvers"
  ON public.po_amendments FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );
-- =========================================================================
-- DAY 3 — Fulfilment, Payment Gate, Emergency Procurement, Vendor Rating
-- SOP §8.6 (GRN), §8.7 (Three-Way Match & Payment), §9 (Emergency), Annexure 4
-- =========================================================================

-- 1. Sequences & Generators
CREATE SEQUENCE IF NOT EXISTS public.challan_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.grn_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.payment_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.emergency_number_seq START 1001;

CREATE OR REPLACE FUNCTION public.generate_challan_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE yr text; seq_val bigint; BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('public.challan_number_seq');
  RETURN 'DC-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_grn_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE yr text; seq_val bigint; BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('public.grn_number_seq');
  RETURN 'GRN-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_emergency_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE yr text; seq_val bigint; BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('public.emergency_number_seq');
  RETURN 'EP-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

-- 2. Delivery Challans Table (§8.6)
CREATE TABLE IF NOT EXISTS public.delivery_challans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number text UNIQUE DEFAULT public.generate_challan_number(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  packages_count integer DEFAULT 1,
  carrier_details text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Goods Receipt Notes (GRN) Table (§8.6)
CREATE TABLE IF NOT EXISTS public.grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number text UNIQUE DEFAULT public.generate_grn_number(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  delivery_challan_id uuid NOT NULL REFERENCES public.delivery_challans(id) ON DELETE RESTRICT,
  security_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  security_verified_at timestamptz,
  technical_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  technical_verified_at timestamptz,
  requires_technical_inspection boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'partially_accepted')),
  rejection_reason text,
  accepted_value numeric(14,2) NOT NULL DEFAULT 0,
  prepared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. GRN Line Items Table (§8.6)
CREATE TABLE IF NOT EXISTS public.grn_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid NOT NULL REFERENCES public.grns(id) ON DELETE CASCADE,
  description text NOT NULL,
  unit text,
  qty_delivered numeric(12,2) NOT NULL DEFAULT 0,
  qty_accepted numeric(12,2) NOT NULL DEFAULT 0,
  qty_rejected numeric(12,2) GENERATED ALWAYS AS (qty_delivered - qty_accepted) STORED,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  accepted_total numeric(14,2) GENERATED ALWAYS AS (qty_accepted * unit_price) STORED,
  inspection_remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Invoices Table (§8.7 Three-Way Match)
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  grn_id uuid REFERENCES public.grns(id) ON DELETE SET NULL,
  invoice_amount numeric(14,2) NOT NULL,
  gst_details_json jsonb DEFAULT '{}'::jsonb,
  is_duplicate_check_passed boolean NOT NULL DEFAULT true,
  match_status text NOT NULL DEFAULT 'pending' CHECK (match_status IN (
    'pending',
    'matched',
    'on_hold',
    'approved',
    'paid'
  )),
  hold_reason text,
  is_service_po boolean NOT NULL DEFAULT false,
  service_completion_cert_url text,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, invoice_number)
);

-- 6. Payments Table (§8.7)
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  payment_terms_ref text,
  external_ref text,
  payment_mode text NOT NULL DEFAULT 'bank_transfer' CHECK (payment_mode IN ('bank_transfer', 'neft', 'rtgs', 'cheque', 'upi')),
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Emergency Annual Ledger (SOP §9 Hard Cap ₹10,00,000)
CREATE TABLE IF NOT EXISTS public.emergency_annual_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text UNIQUE NOT NULL, -- e.g. '2026-27'
  running_total numeric(14,2) NOT NULL DEFAULT 0,
  cap_limit numeric(14,2) NOT NULL DEFAULT 1000000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Emergency Procurements Register (SOP §9)
CREATE TABLE IF NOT EXISTS public.emergency_procurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_number text UNIQUE DEFAULT public.generate_emergency_number(),
  pr_id uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  description text NOT NULL,
  estimated_cost numeric(14,2) NOT NULL,
  reason_standard_process_failed text NOT NULL,
  is_post_facto boolean NOT NULL DEFAULT false,
  register_entry_at timestamptz NOT NULL DEFAULT now(),
  evp_approval_status text NOT NULL DEFAULT 'pending' CHECK (evp_approval_status IN ('pending', 'approved', 'rejected')),
  evp_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evp_approved_at timestamptz,
  rejection_remarks text,
  quotations_obtained_count integer DEFAULT 1,
  price_reasonableness_note text,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  financial_year text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Vendor Performance Ratings Table (Annexure 4)
CREATE TABLE IF NOT EXISTS public.vendor_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  review_period text NOT NULL, -- e.g. 'FY2026-Q2' or 'Annual 2026'
  section_a_score numeric(5,2) NOT NULL, -- Quality & Specification (25%)
  section_b_score numeric(5,2) NOT NULL, -- Delivery & Timeline (20%)
  section_c_score numeric(5,2) NOT NULL, -- Price & Commercial (15%)
  section_d_score numeric(5,2) NOT NULL, -- Service & Technical Support (20%)
  section_e_score numeric(5,2),          -- Compliance & Safety (10% or null)
  section_f_score numeric(5,2) NOT NULL, -- Commercial Relations & Responsiveness (10%)
  weighted_score numeric(5,2) NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('preferred', 'active', 'active_notice', 'suspended', 'debarred')),
  notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  countersigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evp_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Triggers for updated_at
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'delivery_challans',
    'grns',
    'invoices',
    'emergency_annual_ledger',
    'emergency_procurements',
    'vendor_ratings'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I;', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t);
  END LOOP;
END $$;

-- 11. Row Level Security Policies (DEFAULT DENY, EXPLICIT GRANTS)
ALTER TABLE public.delivery_challans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_annual_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_procurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_ratings ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "Challans readable by authenticated" ON public.delivery_challans FOR SELECT TO authenticated USING (true);
CREATE POLICY "GRNs readable by authenticated" ON public.grns FOR SELECT TO authenticated USING (true);
CREATE POLICY "GRN lines readable by authenticated" ON public.grn_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Invoices readable by authenticated" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Payments readable by authenticated" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Emergency ledger readable by authenticated" ON public.emergency_annual_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "Emergency procurements readable by authenticated" ON public.emergency_procurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Vendor ratings readable by authenticated" ON public.vendor_ratings FOR SELECT TO authenticated USING (true);

-- Writable policies for Stores / Procurement / Finance / EVP / Admin
CREATE POLICY "Challans writable by stores and procurement" ON public.delivery_challans FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
  );

CREATE POLICY "GRNs writable by stores and procurement" ON public.grns FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
  );

CREATE POLICY "GRN lines writable by stores and procurement" ON public.grn_lines FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
  );

CREATE POLICY "Invoices writable by finance and admin" ON public.invoices FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
  );

CREATE POLICY "Payments writable by finance and admin" ON public.payments FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
  );

CREATE POLICY "Emergency procurements writable by users and EVP" ON public.emergency_procurements FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
    OR public.has_role(auth.uid(), 'hod'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
  );

CREATE POLICY "Emergency ledger writable by EVP and admin" ON public.emergency_annual_ledger FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
  );

CREATE POLICY "Vendor ratings writable by committee and EVP" ON public.vendor_ratings FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );
-- ==============================================================================
-- MIGRATION 20260918000004: FIX RLS DIRECT MUTATION BYPASS
--
-- Revokes broad direct UPDATE/ALL permissions from `authenticated` on all
-- status, approval, and amount-bearing procurement tables.
-- All state transitions, threshold validations, and approval sign-offs must
-- route exclusively through the server domain tier (service_role / server functions).
-- ==============================================================================

-- 1. PURCHASE ORDERS
DROP POLICY IF EXISTS "POs writable by procurement and approvers" ON public.purchase_orders;
-- Deny direct client UPDATE/DELETE. SELECT remains permitted for authenticated users.
CREATE POLICY "POs direct client updates denied"
  ON public.purchase_orders FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "POs direct client deletes denied"
  ON public.purchase_orders FOR DELETE
  TO authenticated
  USING (false);


-- 2. EMERGENCY PROCUREMENTS
DROP POLICY IF EXISTS "Emergency procurements writable by users and EVP" ON public.emergency_procurements;
-- Allow INSERT of draft requests by authenticated users with pending status only
CREATE POLICY "Emergency procurements insertable as pending only"
  ON public.emergency_procurements FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND evp_approval_status = 'pending'
    AND evp_approved_by IS NULL
    AND evp_approved_at IS NULL
  );

-- Deny direct client UPDATE/DELETE on approval fields
CREATE POLICY "Emergency procurements direct updates denied"
  ON public.emergency_procurements FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Emergency procurements direct deletes denied"
  ON public.emergency_procurements FOR DELETE
  TO authenticated
  USING (false);


-- 3. VENDORS & VENDOR BLACKLIST
DROP POLICY IF EXISTS "Vendors updatable by procurement and evp and admin" ON public.vendors;
DROP POLICY IF EXISTS "Vendor blacklist writable by evp and admin" ON public.vendor_blacklist;

-- Deny direct client status/empanelment updates
CREATE POLICY "Vendors direct status updates denied"
  ON public.vendors FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Vendor blacklist direct writes denied"
  ON public.vendor_blacklist FOR ALL
  TO authenticated
  USING (false);


-- 4. INVOICES & PAYMENTS
DROP POLICY IF EXISTS "Invoices writable by finance and admin" ON public.invoices;
DROP POLICY IF EXISTS "Payments writable by finance and admin" ON public.payments;

-- Deny direct client UPDATE/DELETE on invoices (matching and approvals restricted to server functions)
CREATE POLICY "Invoices direct client updates denied"
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Invoices direct client deletes denied"
  ON public.invoices FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "Payments direct client writes denied"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Payments direct client updates denied"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (false);


-- 5. PURCHASE REQUISITIONS
DROP POLICY IF EXISTS "PR updatable by approver roles or requester" ON public.purchase_requisitions;

-- Requesters can update their OWN PR ONLY when still in 'draft' status, and CANNOT change approval/status fields
CREATE POLICY "PR updatable by requester in draft only"
  ON public.purchase_requisitions FOR UPDATE
  TO authenticated
  USING (
    requested_by = auth.uid()
    AND status = 'draft'
  )
  WITH CHECK (
    requested_by = auth.uid()
    AND status = 'draft'
    AND current_approver_role IS NULL
    AND is_emergency = false
  );

CREATE POLICY "PR direct approvals or deletes denied"
  ON public.purchase_requisitions FOR DELETE
  TO authenticated
  USING (false);


-- 6. COMPARATIVE STATEMENTS & SCORES
DROP POLICY IF EXISTS "CS writable by procurement and approvers" ON public.comparative_statements;
DROP POLICY IF EXISTS "CS line scores writable by committee" ON public.cs_line_scores;

CREATE POLICY "CS direct updates denied"
  ON public.comparative_statements FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "CS line scores direct updates denied"
  ON public.cs_line_scores FOR UPDATE
  TO authenticated
  USING (false);


-- 7. VENDOR RATINGS
DROP POLICY IF EXISTS "Vendor ratings writable by committee and EVP" ON public.vendor_ratings;

CREATE POLICY "Vendor ratings direct writes denied"
  ON public.vendor_ratings FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Vendor ratings direct updates denied"
  ON public.vendor_ratings FOR UPDATE
  TO authenticated
  USING (false);


-- 8. GOODS RECEIPT NOTES (GRN) & CHALLANS
DROP POLICY IF EXISTS "GRNs writable by stores and procurement" ON public.grns;
DROP POLICY IF EXISTS "GRN lines writable by stores and procurement" ON public.grn_lines;
DROP POLICY IF EXISTS "Challans writable by stores and procurement" ON public.delivery_challans;

CREATE POLICY "GRNs direct updates denied"
  ON public.grns FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "GRN lines direct updates denied"
  ON public.grn_lines FOR UPDATE
  TO authenticated
  USING (false);


-- 9. EMERGENCY ANNUAL LEDGER (TAMPER-PROOF)
DROP POLICY IF EXISTS "Emergency ledger writable by EVP and admin" ON public.emergency_annual_ledger;

CREATE POLICY "Emergency ledger direct writes denied"
  ON public.emergency_annual_ledger FOR ALL
  TO authenticated
  USING (false);


-- 10. MATRIX RULES & DEVIATIONS
DROP POLICY IF EXISTS "Matrix rules editable by admin" ON public.approval_matrix_rules;
DROP POLICY IF EXISTS "Deviations writable by evp and admin" ON public.deviation_approvals;

CREATE POLICY "Matrix rules direct writes denied"
  ON public.approval_matrix_rules FOR ALL
  TO authenticated
  USING (false);

CREATE POLICY "Deviations direct writes denied"
  ON public.deviation_approvals FOR ALL
  TO authenticated
  USING (false);
