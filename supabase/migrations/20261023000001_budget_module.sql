-- Budget module (SOP §8.1 + PR form Section B). Replaces the never-applied
-- 20261017000001_annual_budgets_and_escalations.sql budget tables, whose policies let any
-- signed-in user write. Here users can only read; server functions (service role) write.
--
-- Money model (see src/lib/procurement/budgetLedger.ts):
--   commit  — PO issued (or amended up): committed += amount
--   spend   — invoice paid: committed -= amount, spent += amount
--   release — PO cancelled / closed under value / amended down: committed -= amount
--   balance = allocated − Σcommit + Σrelease          (spent is part of what was committed)
-- Idempotent: safe to run twice.

-- 1. Annual proposals: HOD (March) → Finance consolidates (April) → EVP decides (May/June).
create table if not exists public.budget_proposals (
  id uuid primary key default gen_random_uuid(),
  financial_year text not null,                      -- '2026-27'
  department_id uuid not null references public.departments(id),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'consolidated', 'with_evp', 'sanctioned', 'rework')),
  category_allocations jsonb not null default '{}'::jsonb,   -- { "<pr category>": amount }
  line_items jsonb not null default '[]'::jsonb,              -- [{category, description, justification, qty, unit_cost, q1..q4}]
  total_proposed numeric(14,2) not null default 0,
  hod_remarks text,
  finance_remarks text,
  evp_remarks text,
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  consolidated_by uuid references auth.users(id),
  consolidated_at timestamptz,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (financial_year, department_id)
);

-- 2. Budget heads: what each department may spend per PR category in a financial year.
create table if not exists public.budget_heads (
  id uuid primary key default gen_random_uuid(),
  financial_year text not null,
  department_id uuid not null references public.departments(id),
  category text not null,                            -- same keys as purchase_requisitions.category
  code text not null unique,
  title text not null,
  allocated_amount numeric(14,2) not null check (allocated_amount >= 0),
  source text not null default 'sanctioned' check (source in ('sanctioned', 'opening')),
  proposal_id uuid references public.budget_proposals(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (financial_year, department_id, category)
);

-- 3. Ledger: every movement against a head, linked to what caused it.
create table if not exists public.budget_ledger (
  id uuid primary key default gen_random_uuid(),
  budget_head_id uuid not null references public.budget_heads(id) on delete restrict,
  entry_type text not null check (entry_type in ('commit', 'spend', 'release')),
  amount numeric(14,2) not null check (amount > 0),
  pr_id uuid references public.purchase_requisitions(id) on delete set null,
  po_id uuid references public.purchase_orders(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  notes text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists budget_ledger_head_idx on public.budget_ledger (budget_head_id);
create index if not exists budget_ledger_po_idx on public.budget_ledger (po_id);

-- 4. PR Section B and the over-budget route.
alter table public.purchase_requisitions
  add column if not exists budget_head_id uuid references public.budget_heads(id),
  add column if not exists budget_status text
    check (budget_status is null or budget_status in ('within', 'over', 'evp_approved', 'none')),
  add column if not exists budget_justification text,
  add column if not exists reappropriation_ref text;

-- PO issued over the balance without an EVP-approved PR goes to the EVP first.
alter table public.purchase_orders
  add column if not exists budget_status text
    check (budget_status is null or budget_status in ('within', 'over_pending_evp', 'evp_approved', 'none'));

-- 5. Commit atomically: lock the head, check the balance, write the entry.
--    Returns the balance after the commit, or null when it would go over and allow_over is false.
create or replace function public.budget_commit(
  _head_id uuid, _amount numeric, _po_id uuid, _pr_id uuid, _actor uuid, _notes text, _allow_over boolean
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  _allocated numeric;
  _balance numeric;
begin
  select allocated_amount into _allocated from budget_heads where id = _head_id for update;
  if _allocated is null then raise exception 'budget head % not found', _head_id; end if;
  select _allocated
         - coalesce(sum(amount) filter (where entry_type = 'commit'), 0)
         + coalesce(sum(amount) filter (where entry_type = 'release'), 0)
    into _balance
    from budget_ledger where budget_head_id = _head_id;
  if _amount > _balance + 1 and not _allow_over then return null; end if;
  insert into budget_ledger (budget_head_id, entry_type, amount, po_id, pr_id, actor_id, notes)
  values (_head_id, 'commit', _amount, _po_id, _pr_id, _actor, _notes);
  return _balance - _amount;
end $$;
revoke all on function public.budget_commit(uuid, numeric, uuid, uuid, uuid, text, boolean) from public, anon, authenticated;

-- 6. Month-to-date spend for the authority matrix's monthly caps (was never written).
create unique index if not exists department_monthly_spend_key
  on public.department_monthly_spend (department_id, month, category);
create or replace function public.add_department_monthly_spend(
  _department_id uuid, _month date, _category text, _amount numeric
) returns void
language sql security definer set search_path = public as $$
  insert into department_monthly_spend (department_id, month, category, total_spent)
  values (_department_id, _month, _category, _amount)
  on conflict (department_id, month, category)
  do update set total_spent = department_monthly_spend.total_spent + excluded.total_spent,
                updated_at = now();
$$;
revoke all on function public.add_department_monthly_spend(uuid, date, text, numeric) from public, anon, authenticated;

-- 7. Read-only access: procurement staff see everything; others see their own department.
alter table public.budget_proposals enable row level security;
alter table public.budget_heads enable row level security;
alter table public.budget_ledger enable row level security;

drop policy if exists "Budget proposals readable by staff or own department HOD" on public.budget_proposals;
create policy "Budget proposals readable by staff or own department HOD" on public.budget_proposals
  for select to authenticated
  using (public.is_procurement_staff(auth.uid()) or public.is_hod_of(auth.uid(), department_id));

drop policy if exists "Budget heads readable by staff or own department" on public.budget_heads;
create policy "Budget heads readable by staff or own department" on public.budget_heads
  for select to authenticated
  using (
    public.is_procurement_staff(auth.uid())
    or exists (select 1 from public.user_roles ur
               where ur.user_id = auth.uid() and ur.department_id = budget_heads.department_id)
  );

drop policy if exists "Budget ledger readable by staff or own department HOD" on public.budget_ledger;
create policy "Budget ledger readable by staff or own department HOD" on public.budget_ledger
  for select to authenticated
  using (
    public.is_procurement_staff(auth.uid())
    or exists (select 1 from public.budget_heads h
               where h.id = budget_ledger.budget_head_id and public.is_hod_of(auth.uid(), h.department_id))
  );
