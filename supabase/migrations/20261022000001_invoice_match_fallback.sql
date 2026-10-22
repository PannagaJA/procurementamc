-- Three-way match fallback (SOP §8.7 discrepancy management, §VII.6 deviations).
-- Before this, an invoice that failed the match sat in `on_hold` forever: no re-check, no
-- return to the vendor, no short-payment, no record of how it was resolved.
-- Idempotent: safe to run twice.

-- 1. New status: returned to the vendor for a corrected invoice.
alter table public.invoices drop constraint if exists invoices_match_status_check;
alter table public.invoices add constraint invoices_match_status_check
  check (match_status in ('pending', 'matched', 'on_hold', 'approved', 'paid', 'returned'));

-- 2. Resolution data on the invoice (all nullable; existing rows unaffected).
alter table public.invoices
  add column if not exists hold_code text,                 -- exceeds_po | exceeds_grn | no_grn | zero_amount
  add column if not exists held_at timestamptz,            -- for the 2–3 working-day SLA
  add column if not exists approved_amount numeric,        -- payable after deductions (null = full amount)
  add column if not exists deductions_json jsonb,          -- [{reason, amount}]
  add column if not exists revision_of uuid references public.invoices(id),
  add column if not exists deviation_status text
    check (deviation_status is null or deviation_status in ('requested', 'approved', 'rejected')),
  add column if not exists deviation_reason text,
  add column if not exists deviation_requested_by uuid references auth.users(id),
  add column if not exists deviation_approved_by uuid references auth.users(id),
  add column if not exists deviation_approved_at timestamptz;

-- 3. Audit trail: "reasons for hold and resolution shall be documented" (§8.7).
create table if not exists public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  action text not null,           -- submitted | held | rechecked | returned | revised | deviation_requested | deviation_approved | deviation_rejected | approved | approved_with_deductions | paid
  from_status text,
  to_status text,
  amount numeric,
  notes text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists invoice_events_invoice_id_idx on public.invoice_events (invoice_id, created_at);

alter table public.invoice_events enable row level security;
-- Readable by whoever can read the invoice (the subquery is filtered by the invoices policy).
-- No insert/update/delete policies: only server functions (service role) write events.
drop policy if exists "Invoice events readable with their invoice" on public.invoice_events;
create policy "Invoice events readable with their invoice" on public.invoice_events
  for select to authenticated using (
    public.is_procurement_staff(auth.uid())
    or exists (select 1 from public.invoices i where i.id = invoice_events.invoice_id)
  );

-- 4. Deviation tolerance as data, not code: the EVP may approve a documented over-billing only
--    up to max(abs, pct × limit). Never for undelivered goods.
insert into public.procurement_config (key, value, description)
values ('match_tolerance', '{"abs": 500, "pct": 0.01}',
        'Max over-billing the EVP may approve as a deviation on a failed three-way match: max(abs rupees, pct of the limit).')
on conflict (key) do nothing;
