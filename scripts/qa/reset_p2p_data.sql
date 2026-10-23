-- ⚠️ DESTRUCTIVE. QA reset: wipe all Procure-to-Pay transactions and budgets; keep vendors,
-- users and configuration. Back up first (scripts/qa/README.md). Run only with the product
-- owner's OK against the project you mean to reset:
--   supabase db query --linked -f scripts/qa/reset_p2p_data.sql
-- Single transaction: all or nothing.
--
-- KEPT:  vendors, vendor_evaluations, vendor_blacklist, vendor_documents (vendor record, debarment)
--        profiles, user_roles (users)
--        departments, approval_matrix_rules, procurement_config, categories (configuration)
--        inventory, locations, library_*, tickets, ticket_updates (non-P2P modules)
-- WIPED: the tables below. Number sequences restart at 1001; the emergency ledger at Rs. 0.
begin;

truncate table
  public.invoice_events,
  public.payments,
  public.budget_ledger,
  public.invoices,
  public.grn_lines,
  public.grns,
  public.delivery_challans,
  public.po_amendments,
  public.purchase_orders,
  public.cs_line_scores,
  public.comparative_statements,
  public.quotation_lines,
  public.rfq_vendors,
  public.rfqs,
  public.rate_contracts,
  public.deviation_approvals,
  public.emergency_procurements,
  public.pr_approvals,
  public.pr_line_items,
  public.purchase_requisitions,
  public.department_monthly_spend,
  public.budget_heads,
  public.budget_proposals,
  public.vendor_ratings,
  public.quotation_responses,
  public.quotations,
  public.audit_logs,
  public.notifications
restart identity;

update public.emergency_annual_ledger set running_total = 0, updated_at = now();

select setval('public.pr_number_seq', 1001, false),
       setval('public.rfq_number_seq', 1001, false),
       setval('public.cs_number_seq', 1001, false),
       setval('public.po_number_seq', 1001, false),
       setval('public.challan_number_seq', 1001, false),
       setval('public.grn_number_seq', 1001, false),
       setval('public.invoice_number_seq', 1001, false),
       setval('public.payment_number_seq', 1001, false),
       setval('public.emergency_number_seq', 1001, false);

commit;
