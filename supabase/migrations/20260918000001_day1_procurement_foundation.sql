-- =========================================================================
-- DAY 1 — Procurement Foundation Migration (SOP §6, §8.2, §8.3, §13)
-- =========================================================================

-- 1. Extend app_role enum
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'evp';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'director_admin_finance';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'purchase_committee';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'procurement_officer';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'procurement_executive';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'stores';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend user_roles columns & normalize 'principle' -> 'principal'
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_notes text;

-- Canonicalize legacy 'principle' role records in user_roles to 'principal'
UPDATE public.user_roles
SET role = 'principal'::public.app_role
WHERE role = 'principle'::public.app_role;

-- 3. Vendors (§8.2)
CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  registered_address text,
  gst_number text,
  pan_number text,
  bank_details_json jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'under_review', 'empanelled', 'suspended', 'debarred', 'rejected')),
  empanelled_on date,
  empanelment_expiry date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  technical_capability numeric CHECK (technical_capability >= 0 AND technical_capability <= 100),
  experience_past_performance numeric CHECK (experience_past_performance >= 0 AND experience_past_performance <= 100),
  service_support numeric CHECK (service_support >= 0 AND service_support <= 100),
  financial_reasonableness numeric CHECK (financial_reasonableness >= 0 AND financial_reasonableness <= 100),
  decision text NOT NULL CHECK (decision IN ('recommend', 'not_recommend')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS public.vendor_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  reason text NOT NULL,
  blacklisted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  blacklisted_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Purchase Requisitions (§8.3)
CREATE SEQUENCE IF NOT EXISTS public.pr_number_seq START 1001;

CREATE OR REPLACE FUNCTION public.generate_pr_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr text;
  seq_val bigint;
BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('public.pr_number_seq');
  RETURN 'PR-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.purchase_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number text UNIQUE DEFAULT public.generate_pr_number(),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN (
    'routine_consumable',
    'equipment_asset',
    'software',
    'academic_research',
    'services_amc',
    'maintenance',
    'small_value'
  )),
  scope text NOT NULL CHECK (scope IN ('academic', 'operational')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'escalated_to_evp',
    'archived'
  )),
  budget_head text,
  estimated_value numeric(14,2) NOT NULL DEFAULT 0,
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_frequency text,
  is_emergency boolean NOT NULL DEFAULT false,
  justification text,
  market_survey_notes text,
  current_approver_role text,
  routing_reason text,
  source text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pr_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  description text NOT NULL,
  unit text,
  qty_required numeric(12,2) NOT NULL DEFAULT 1,
  qty_in_stock numeric(12,2) NOT NULL DEFAULT 0,
  net_qty_to_procure numeric(12,2) NOT NULL DEFAULT 1,
  est_unit_price numeric(14,2) NOT NULL DEFAULT 0,
  est_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pr_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  stage text NOT NULL,
  approver_role text NOT NULL,
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision text NOT NULL,
  remarks text,
  decided_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Authority Matrix Engine (§6)
CREATE TABLE IF NOT EXISTS public.approval_matrix_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  method text,
  per_txn_limit numeric(14,2),
  per_month_limit numeric(14,2),
  approval_role text NOT NULL,
  min_quotations integer NOT NULL DEFAULT 0,
  requires_rate_contract boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.department_monthly_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  month date NOT NULL,
  category text NOT NULL,
  total_spent numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, month, category)
);

CREATE TABLE IF NOT EXISTS public.deviation_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  po_id uuid,
  justification text NOT NULL,
  risk_assessment text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procurement_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text
);

-- Seed configuration
INSERT INTO public.procurement_config (key, value, description)
VALUES ('monthly_aggregation_dimension', 'department', 'Aggregation scope for monthly spend limits (department | institution)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Seed Authority Matrix Rules (SOP §6, using literal ₹10,000 cap per DECISIONS.md Q1)
INSERT INTO public.approval_matrix_rules (category, method, per_txn_limit, per_month_limit, approval_role, min_quotations, requires_rate_contract, active)
VALUES
  -- Small value / direct purchase
  ('small_value', 'direct_purchase', 2000, 5000, 'hod', 0, false, true),
  ('small_value', 'small_value_po', 5000, 30000, 'principal', 0, false, true),
  ('small_value', 'small_value_po', 5000, 30000, 'procurement_officer', 0, false, true),
  -- Routine consumables on rate contract
  ('routine_consumable', 'rate_contract', NULL, 100000, 'procurement_officer', 3, true, true),
  -- Equipment, Software, Academic/Research, Services/AMC, Maintenance
  ('equipment_asset', 'comparative_quotations', 10000, 50000, 'purchase_committee', 3, false, true),
  ('software', 'comparative_quotations', 10000, 50000, 'purchase_committee', 3, false, true),
  ('academic_research', 'comparative_quotations', 10000, 50000, 'purchase_committee', 3, false, true),
  ('services_amc', 'comparative_quotations', 10000, 50000, 'purchase_committee', 3, false, true),
  ('maintenance', 'comparative_quotations', 10000, 50000, 'purchase_committee', 3, false, true);

-- 6. Trigger for updated_at on new tables
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'vendors',
    'purchase_requisitions',
    'department_monthly_spend'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I;', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t);
  END LOOP;
END $$;

-- 7. Update has_role helper to treat principle/principal interchangeably
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'principal'::public.app_role AND role = 'principle'::public.app_role)
        OR (_role = 'principle'::public.app_role AND role = 'principal'::public.app_role)
      )
  );
$$;

-- 8. Migrate legacy procure tickets per DECISIONS.md Q6
INSERT INTO public.purchase_requisitions (
  pr_number,
  department_id,
  requested_by,
  category,
  scope,
  status,
  justification,
  source,
  created_at
)
SELECT
  coalesce(t.ticket_number, 'LEGACY-' || t.id::text),
  t.department::uuid, -- handles if department was stored as uuid or null
  t.created_by,
  'small_value',
  'operational',
  'archived',
  coalesce(t.issue_description, 'Migrated legacy procurement ticket'),
  'legacy_ticket',
  t.created_at
FROM public.tickets t
WHERE t.issue_category = 'procure'
ON CONFLICT (pr_number) DO NOTHING;

-- 9. Row Level Security Policies (DEFAULT DENY, EXPLICIT GRANT)
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_matrix_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_monthly_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deviation_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_config ENABLE ROW LEVEL SECURITY;

-- Vendors policies
DROP POLICY IF EXISTS "Vendors readable by authenticated users" ON public.vendors;
CREATE POLICY "Vendors readable by authenticated users"
  ON public.vendors FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Vendors insertable by authenticated users" ON public.vendors;
CREATE POLICY "Vendors insertable by authenticated users"
  ON public.vendors FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Vendors updatable by procurement and evp and admin" ON public.vendors;
CREATE POLICY "Vendors updatable by procurement and evp and admin"
  ON public.vendors FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
  );

-- Vendor documents policies
DROP POLICY IF EXISTS "Vendor docs readable by authenticated users" ON public.vendor_documents;
CREATE POLICY "Vendor docs readable by authenticated users"
  ON public.vendor_documents FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Vendor docs insertable by authenticated users" ON public.vendor_documents;
CREATE POLICY "Vendor docs insertable by authenticated users"
  ON public.vendor_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Vendor evaluations policies
DROP POLICY IF EXISTS "Vendor evaluations readable by procurement and evp" ON public.vendor_evaluations;
CREATE POLICY "Vendor evaluations readable by procurement and evp"
  ON public.vendor_evaluations FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
  );

DROP POLICY IF EXISTS "Vendor evaluations insertable by procurement committee" ON public.vendor_evaluations;
CREATE POLICY "Vendor evaluations insertable by procurement committee"
  ON public.vendor_evaluations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
  );

-- Vendor blacklist policies
DROP POLICY IF EXISTS "Vendor blacklist readable by authenticated" ON public.vendor_blacklist;
CREATE POLICY "Vendor blacklist readable by authenticated"
  ON public.vendor_blacklist FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Vendor blacklist writable by evp and admin" ON public.vendor_blacklist;
CREATE POLICY "Vendor blacklist writable by evp and admin"
  ON public.vendor_blacklist FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- Purchase Requisitions policies
DROP POLICY IF EXISTS "PR readable by creator or procurement roles" ON public.purchase_requisitions;
CREATE POLICY "PR readable by creator or procurement roles"
  ON public.purchase_requisitions FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hod'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

DROP POLICY IF EXISTS "PR insertable by authenticated users" ON public.purchase_requisitions;
CREATE POLICY "PR insertable by authenticated users"
  ON public.purchase_requisitions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "PR updatable by approver roles or requester" ON public.purchase_requisitions;
CREATE POLICY "PR updatable by approver roles or requester"
  ON public.purchase_requisitions FOR UPDATE
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hod'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- PR Line items policies
DROP POLICY IF EXISTS "PR items readable by authenticated" ON public.pr_line_items;
CREATE POLICY "PR items readable by authenticated"
  ON public.pr_line_items FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "PR items insertable by authenticated" ON public.pr_line_items;
CREATE POLICY "PR items insertable by authenticated"
  ON public.pr_line_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- PR Approvals log policies
DROP POLICY IF EXISTS "PR approvals readable by authenticated" ON public.pr_approvals;
CREATE POLICY "PR approvals readable by authenticated"
  ON public.pr_approvals FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "PR approvals insertable by authenticated" ON public.pr_approvals;
CREATE POLICY "PR approvals insertable by authenticated"
  ON public.pr_approvals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Approval Matrix rules policies (read-only to users, editable by admin)
DROP POLICY IF EXISTS "Matrix rules readable by authenticated" ON public.approval_matrix_rules;
CREATE POLICY "Matrix rules readable by authenticated"
  ON public.approval_matrix_rules FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Matrix rules editable by admin" ON public.approval_matrix_rules;
CREATE POLICY "Matrix rules editable by admin"
  ON public.approval_matrix_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Department monthly spend policies
DROP POLICY IF EXISTS "Monthly spend readable by authenticated" ON public.department_monthly_spend;
CREATE POLICY "Monthly spend readable by authenticated"
  ON public.department_monthly_spend FOR SELECT
  TO authenticated
  USING (true);

-- Deviation approvals policies
DROP POLICY IF EXISTS "Deviations readable by authenticated" ON public.deviation_approvals;
CREATE POLICY "Deviations readable by authenticated"
  ON public.deviation_approvals FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Deviations writable by evp and admin" ON public.deviation_approvals;
CREATE POLICY "Deviations writable by evp and admin"
  ON public.deviation_approvals FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- Procurement config policies
DROP POLICY IF EXISTS "Config readable by authenticated" ON public.procurement_config;
CREATE POLICY "Config readable by authenticated"
  ON public.procurement_config FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Config editable by admin" ON public.procurement_config;
CREATE POLICY "Config editable by admin"
  ON public.procurement_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
