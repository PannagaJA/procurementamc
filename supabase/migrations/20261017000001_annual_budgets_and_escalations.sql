-- SOP §8.1 Annual Departmental Budget Formulation & Consolidation
-- SOP §8.3 E12, §8.4 F5, §8.5 G12 SLA Reminders & Escalations

CREATE TABLE IF NOT EXISTS public.annual_budget_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted_to_finance', 'under_consolidation', 'submitted_to_evp', 'sanctioned', 'rework_requested')),
  total_proposed numeric(14,2) NOT NULL DEFAULT 0,
  category_allocations jsonb NOT NULL DEFAULT '{}'::jsonb,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  hod_remarks text,
  finance_remarks text,
  evp_remarks text,
  sanctioned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.department_budget_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  allocated_amount numeric(14,2) NOT NULL DEFAULT 0,
  committed_amount numeric(14,2) NOT NULL DEFAULT 0,
  spent_amount numeric(14,2) NOT NULL DEFAULT 0,
  balance_available numeric(14,2) GENERATED ALWAYS AS (allocated_amount - (committed_amount + spent_amount)) STORED,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.budget_spend_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_head_id uuid REFERENCES public.department_budget_heads(id) ON DELETE CASCADE,
  pr_id uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('commit', 'release', 'disburse')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sla_escalation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL CHECK (stage IN ('pr_review', 'rfq_quote', 'po_issuance', 'grn_inspection', 'invoice_processing')),
  entity_id text NOT NULL,
  entity_number text,
  elapsed_working_days numeric(5,2) NOT NULL,
  sla_limit_days integer NOT NULL,
  current_holder_role text,
  escalated_to_role text,
  action_taken text,
  notified_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE public.annual_budget_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_budget_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_spend_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_escalation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on annual_budget_proposals"
  ON public.annual_budget_proposals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated manage on annual_budget_proposals"
  ON public.annual_budget_proposals FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read on department_budget_heads"
  ON public.department_budget_heads FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated manage on department_budget_heads"
  ON public.department_budget_heads FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read on budget_spend_transactions"
  ON public.budget_spend_transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated manage on budget_spend_transactions"
  ON public.budget_spend_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read on sla_escalation_logs"
  ON public.sla_escalation_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert on sla_escalation_logs"
  ON public.sla_escalation_logs FOR INSERT TO authenticated WITH CHECK (true);
