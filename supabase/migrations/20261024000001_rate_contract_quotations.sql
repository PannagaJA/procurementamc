-- Rate contracts need 3 quotations and EVP approval (SOP Section VI, Routine Consumables:
-- "Rate Contract with Vendors approved by EVP/Trustees (Minimum 3 quotations at the time of
-- rate finalisation), Validity: 6 months").
-- Before this, a rate contract was typed into a dialog and inserted from the browser: no
-- quotes, no approval, live at once.
-- Idempotent: safe to run twice.

-- 1. Rate finalisation RFQs: an RFQ that isn't for a purchase requisition.
alter table public.rfqs alter column pr_id drop not null;
alter table public.rfqs
  add column if not exists purpose text not null default 'purchase',
  add column if not exists title text,
  add column if not exists category text,                                 -- rate contract category
  add column if not exists rate_items_json jsonb not null default '[]'::jsonb; -- [{group, description, unit}]
alter table public.rfqs drop constraint if exists rfqs_purpose_check;
alter table public.rfqs add constraint rfqs_purpose_check
  check (purpose in ('purchase', 'rate_contract'));
alter table public.rfqs drop constraint if exists rfqs_purchase_needs_pr;
alter table public.rfqs add constraint rfqs_purchase_needs_pr
  check (purpose = 'rate_contract' or pr_id is not null);

-- 2. Which rate item a quoted line prices (0-based index into rfqs.rate_items_json).
alter table public.quotation_lines add column if not exists rate_item_no smallint;

-- 3. Rate contracts: approval status. The default also sends existing contracts to the EVP
--    (product owner, 2026-10-22): they stop covering purchases until approved.
alter table public.rate_contracts
  add column if not exists status text not null default 'pending_approval',
  add column if not exists rfq_id uuid references public.rfqs(id) on delete set null,
  add column if not exists selection_note text,          -- why a vendor other than the lowest
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists decision_remarks text;
alter table public.rate_contracts drop constraint if exists rate_contracts_status_check;
alter table public.rate_contracts add constraint rate_contracts_status_check
  check (status in ('pending_approval', 'active', 'rejected'));

-- 4. Writes only through server functions (service role, after role checks). Reads unchanged.
drop policy if exists "Rate contracts writable by procurement and admin" on public.rate_contracts;
