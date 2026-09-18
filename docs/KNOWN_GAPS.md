# Known Gaps & Future Roadmap Backlog

**Date:** 2026-09-18  
**Document Purpose:** Honest, transparent inventory of deferred secondary UI modules, background daemons, edge-case governance policies, and future reporting enhancements. All core P0/P1 statutory compliance and security gates are 100% operational.

---

## 1. Prioritized Gap Matrix & Estimation

| Priority | Feature / Module | SOP § | Description & Current State | Estimated Effort | Target Phase |
|---|---|:---:|---|:---:|:---:|
| **P2.1** | **Annual Budget Formulation & Consolidation UI** | §8.1 | **Current State:** Requisitions capture `budget_head` and `balance_available`.<br>**Gap:** Dedicated yearly Departmental Budget proposal screens (March), Finance consolidation dashboard (April), and Trustee budget sanction workflow (May). | 2–3 Days | Phase 2 |
| **P2.2** | **Automated SLA Reminder Notifications** | §8.3 E12 | **Current State:** Stage timestamps and visual in-app age badges are rendered.<br>**Gap:** Background cron job sending scheduled email/SMS escalations to approvers approaching stage SLA limits (e.g. 5 days for RFQ, 2 days for review). | 1 Day | Phase 2 |
| **P2.3** | **Value-for-Money Benchmark Surfacing** | §10 | **Current State:** Requisitions and CS evaluations capture price reasonableness and market survey notes.<br>**Gap:** Automated live widget surfacing historical PO rate trends and average unit rates for routine consumables (stationery, lab supplies, housekeeping). | 1.5 Days | Phase 2 |
| **P2.4** | **Quarterly Emergency Register Review & Anomaly Detection** | §9 J7, J8 | **Current State:** Real-time ledger running total, ₹10L hard cap, and 48h post-facto ratification are active.<br>**Gap:** Automated quarterly report generation for Director/PC and pattern detector flagging repeated emergency procurements for identical items by the same department. | 1 Day | Phase 2 |
| **P2.5** | **General Ledger Direct ERP Connector (Webhook/API)** | §8.7, §11 | **Current State:** External UTR / Cheque reference is logged on payments.<br>**Gap:** Automated bi-directional REST webhook or file export to Tally / SAP for direct accounting voucher generation upon invoice approval. | 2 Days | Phase 3 |
| **P2.6** | **PR Estimate Under-run vs PO Cost-Expansion Governance** | §6, §8.5 | **Current State:** Guard `assertNoPoSplitting` blocks POs exceeding PR budget by >5%.<br>**Gap / Edge Case:** When a PR is approved at a lower estimate (e.g., ₹8,000 under Principal) and the final RFQ PO comes in higher at ₹9,500 (still under Principal's ₹10,000 threshold but +18.75% above initial PR budget), formally mandate whether it requires an explicit PR budget variance re-approval by the HOD/Principal before PO issuance. | 0.5 Day | Phase 2 |

---

## 2. Technical Strategy for Backlog Closure

1. **Budget Module (§8.1)**:
   - Create tables `budgets`, `department_budgets`, `budget_heads` with financial year partitioning.
   - Introduce approval state machine (HOD draft → Finance consolidated → EVP approved).
   - Hook into PR submission to dynamically deduct committed amounts from `balance_available`.

2. **Automated SLA Daemon (§8.3)**:
   - Implement Supabase Edge Function triggered by a daily cron schedule.
   - Query `pr_approvals`, `rfqs`, `comparative_statements` where `status = 'pending_approval'` and `age > sla_limit_days`.
   - Dispatch alerts via email/WhatsApp templates to designated role holders.

3. **Value-for-Money Benchmark Engine (§10)**:
   - Compute moving average unit costs per category and item code from approved `purchase_orders` and `quotation_lines`.
   - Surface a comparison badge on the PR review screen: *"Requested unit price ₹X is Y% within historical 6-month benchmark of ₹Z"*.

4. **PR Estimate vs. PO Variance Re-Approval Guard (§8.5)**:
   - If `new_po_amount > pr.estimated_cost * (1 + allowed_variance_threshold)` (configurable, default 5%), require the PR to be re-sanctioned with an amended estimate rather than silently inheriting the original authorization.
