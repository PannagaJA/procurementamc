-- How each vendor was invited to an RFQ: 'email' (bulk, server-sent) or 'whatsapp' (one chat per
-- vendor, opened by the officer). Reminders and retries reuse it; the officer can switch it.
-- Apply by hand as reviewed SQL; never via `supabase db push`. Apply before deploying the app code.
alter table public.rfq_vendors
  add column if not exists invite_channel text not null default 'email'
  check (invite_channel in ('email', 'whatsapp'));
