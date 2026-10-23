-- Vendor quotation links are now signed and checked on the server (src/server/quoteLinks.ts),
-- and vendors read/submit legacy quotation requests through server functions
-- (src/lib/quotations.functions.ts). The anonymous policies let anyone holding the public anon
-- key read every quotation and response and overwrite responses, so they go.
-- Signed-in staff policies are unchanged. Idempotent.
drop policy if exists "quotations_select_anon" on public.quotations;
drop policy if exists "quotation_responses_select_anon" on public.quotation_responses;
drop policy if exists "quotation_responses_insert_anon" on public.quotation_responses;
drop policy if exists "quotation_responses_update_anon" on public.quotation_responses;
