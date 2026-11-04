-- The approval bell (src/hooks/useApprovalNotifications.ts) listens for postgres_changes on these
-- tables, but the supabase_realtime publication was empty, so no event ever arrived.
-- Realtime applies each table's SELECT RLS per subscriber; the client only refetches
-- getMyPendingApprovals on an event, so row data from the event is never trusted.
-- Apply by hand as reviewed SQL; never via `supabase db push`.
alter publication supabase_realtime add table
  public.purchase_requisitions,
  public.purchase_orders,
  public.comparative_statements,
  public.invoices,
  public.po_amendments,
  public.emergency_procurements,
  public.rate_contracts;
