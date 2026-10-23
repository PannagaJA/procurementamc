# QA reset

`reset_p2p_data.sql` wipes every Procure-to-Pay transaction and all budgets so a test cycle can
start from zero. It keeps vendors, users, departments, the authority matrix, `procurement_config`
and the non-P2P modules (inventory, library, tickets). Number sequences restart at 1001
(PR-2026-1001, PO-2026-1001, …) and the emergency annual ledger at Rs. 0.

It is destructive. Get the product owner's OK, check which project the CLI is linked to
(`supabase projects list`), and back up first.

## 1. Back up (read-only)

```sh
python3 -c "
t='invoice_events payments budget_ledger invoices grn_lines grns delivery_challans po_amendments purchase_orders cs_line_scores comparative_statements quotation_lines rfq_vendors rfqs rate_contracts deviation_approvals emergency_procurements pr_approvals pr_line_items purchase_requisitions department_monthly_spend budget_heads budget_proposals vendor_ratings quotation_responses quotations audit_logs notifications emergency_annual_ledger'.split()
print('select json_build_object(' + ', '.join(f\"'{x}', (select coalesce(json_agg(r), '[]'::json) from public.{x} r)\" for x in t) + ') as backup')" > /tmp/p2p_backup.sql
supabase db query --linked -f /tmp/p2p_backup.sql > ~/procurementamc-backups/p2p-$(date +%F).json
```

Keep backups out of git: they contain vendor bank details.

## 2. Dry run (changes nothing)

Replace the final `commit;` with `rollback;` in a copy of the script and run it. Every statement
must succeed; a foreign key from a kept table to a wiped one makes `truncate` fail, which is the
safety net.

## 3. Reset

```sh
supabase db query --linked -f scripts/qa/reset_p2p_data.sql
```

Check afterwards: `select count(*) from purchase_requisitions` → 0, vendors and user_roles unchanged.

The test cases that follow a reset are kept locally in `local/testing/atomic/` (start with `00_README.md`).
