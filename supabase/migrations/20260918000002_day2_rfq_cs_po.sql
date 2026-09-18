-- =========================================================================
-- DAY 2 — RFQ, Vendor Evaluation, and Purchase Orders Migration (SOP §8.4, §8.5)
-- =========================================================================

-- 1. Sequences & Number Generators
CREATE SEQUENCE IF NOT EXISTS public.rfq_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.cs_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.po_number_seq START 1001;

CREATE OR REPLACE FUNCTION public.generate_rfq_number()
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
  seq_val := nextval('public.rfq_number_seq');
  RETURN 'RFQ-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_cs_number()
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
  seq_val := nextval('public.cs_number_seq');
  RETURN 'CS-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_po_number()
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
  seq_val := nextval('public.po_number_seq');
  RETURN 'PO-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

-- 2. Rate Contracts Table (§8.2, §8.4, §8.5 — 6-month validity per Q8)
CREATE TABLE IF NOT EXISTS public.rate_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number text UNIQUE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  approved_rates_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. RFQs Table (§8.4)
CREATE TABLE IF NOT EXISTS public.rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number text UNIQUE DEFAULT public.generate_rfq_number(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  required_min_quotations integer NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'closed', 'cancelled')),
  response_deadline timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. RFQ Vendors Mapping (Empanelled vendors invited)
CREATE TABLE IF NOT EXISTS public.rfq_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  sent_at timestamptz,
  response_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rfq_id, vendor_id)
);

-- 5. Quotation Lines Table (Line-item quotation capture with technical compliance)
CREATE TABLE IF NOT EXISTS public.quotation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  pr_line_item_id uuid REFERENCES public.pr_line_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit text,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_price numeric(14,2) NOT NULL DEFAULT 0,
  delivery_days integer DEFAULT 7,
  warranty_months integer DEFAULT 12,
  meets_technical_spec boolean NOT NULL DEFAULT true,
  technical_remarks text,
  quotation_ref text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Comparative Statements Table (§8.4)
CREATE TABLE IF NOT EXISTS public.comparative_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cs_number text UNIQUE DEFAULT public.generate_cs_number(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  pr_id uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  prepared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  negotiation_notes text,
  price_reasonableness_notes text,
  recommended_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  recommended_total numeric(14,2),
  is_lowest_price boolean NOT NULL DEFAULT true,
  non_lowest_rationale text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  current_approver_role text,
  routing_reason text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. CS Line Scores Table (Price, Technical, Delivery, Warranty)
CREATE TABLE IF NOT EXISTS public.cs_line_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cs_id uuid NOT NULL REFERENCES public.comparative_statements(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  quoted_total numeric(14,2) NOT NULL DEFAULT 0,
  price_score numeric(5,2) DEFAULT 0,
  technical_score numeric(5,2) DEFAULT 0,
  delivery_score numeric(5,2) DEFAULT 0,
  warranty_score numeric(5,2) DEFAULT 0,
  total_score numeric(5,2) DEFAULT 0,
  rank integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Purchase Orders Table (§8.5)
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE DEFAULT public.generate_po_number(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE RESTRICT,
  cs_id uuid REFERENCES public.comparative_statements(id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('regular', 'rate_contract')),
  rate_contract_id uuid REFERENCES public.rate_contracts(id) ON DELETE SET NULL,
  scope_of_supply text,
  price numeric(14,2) NOT NULL DEFAULT 0,
  taxes numeric(14,2) NOT NULL DEFAULT 0,
  total_value numeric(14,2) GENERATED ALWAYS AS (price + taxes) STORED,
  delivery_timeline text,
  payment_terms text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'pending_approval',
    'approved',
    'issued',
    'amended',
    'closed',
    'partially_closed',
    'cancelled'
  )),
  original_approver_role text,
  current_approver_role text,
  routing_reason text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  issued_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. PO Amendments Table (§8.5 - tracks value and re-approval triggers)
CREATE TABLE IF NOT EXISTS public.po_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  changed_fields_json jsonb DEFAULT '{}'::jsonb,
  old_value_total numeric(14,2) NOT NULL,
  new_value_total numeric(14,2) NOT NULL,
  reason text NOT NULL,
  requires_reapproval boolean NOT NULL DEFAULT false,
  original_approver_role text,
  new_approver_role text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Triggers for updated_at
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'rate_contracts',
    'rfqs',
    'comparative_statements',
    'purchase_orders'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I;', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t);
  END LOOP;
END $$;

-- 11. Row Level Security Policies (DEFAULT DENY, EXPLICIT GRANTS)
ALTER TABLE public.rate_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comparative_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_line_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_amendments ENABLE ROW LEVEL SECURITY;

-- Rate Contracts RLS
DROP POLICY IF EXISTS "Rate contracts readable by authenticated" ON public.rate_contracts;
CREATE POLICY "Rate contracts readable by authenticated"
  ON public.rate_contracts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Rate contracts writable by procurement and admin" ON public.rate_contracts;
CREATE POLICY "Rate contracts writable by procurement and admin"
  ON public.rate_contracts FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- RFQs RLS
DROP POLICY IF EXISTS "RFQs readable by authenticated" ON public.rfqs;
CREATE POLICY "RFQs readable by authenticated"
  ON public.rfqs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "RFQs writable by procurement and admin" ON public.rfqs;
CREATE POLICY "RFQs writable by procurement and admin"
  ON public.rfqs FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
  );

-- RFQ Vendors RLS
DROP POLICY IF EXISTS "RFQ Vendors readable by authenticated" ON public.rfq_vendors;
CREATE POLICY "RFQ Vendors readable by authenticated"
  ON public.rfq_vendors FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "RFQ Vendors writable by procurement and admin" ON public.rfq_vendors;
CREATE POLICY "RFQ Vendors writable by procurement and admin"
  ON public.rfq_vendors FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
  );

-- Quotation Lines RLS
DROP POLICY IF EXISTS "Quotation lines readable by authenticated" ON public.quotation_lines;
CREATE POLICY "Quotation lines readable by authenticated"
  ON public.quotation_lines FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Quotation lines insertable by authenticated" ON public.quotation_lines;
CREATE POLICY "Quotation lines insertable by authenticated"
  ON public.quotation_lines FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
  );

-- Comparative Statements RLS
DROP POLICY IF EXISTS "CS readable by authenticated" ON public.comparative_statements;
CREATE POLICY "CS readable by authenticated"
  ON public.comparative_statements FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "CS writable by procurement and approvers" ON public.comparative_statements;
CREATE POLICY "CS writable by procurement and approvers"
  ON public.comparative_statements FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- CS Line Scores RLS
DROP POLICY IF EXISTS "CS line scores readable by authenticated" ON public.cs_line_scores;
CREATE POLICY "CS line scores readable by authenticated"
  ON public.cs_line_scores FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "CS line scores writable by committee" ON public.cs_line_scores;
CREATE POLICY "CS line scores writable by committee"
  ON public.cs_line_scores FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
  );

-- Purchase Orders RLS
DROP POLICY IF EXISTS "POs readable by authenticated" ON public.purchase_orders;
CREATE POLICY "POs readable by authenticated"
  ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "POs writable by procurement and approvers" ON public.purchase_orders;
CREATE POLICY "POs writable by procurement and approvers"
  ON public.purchase_orders FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );

-- PO Amendments RLS
DROP POLICY IF EXISTS "Amendments readable by authenticated" ON public.po_amendments;
CREATE POLICY "Amendments readable by authenticated"
  ON public.po_amendments FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Amendments writable by procurement and approvers" ON public.po_amendments;
CREATE POLICY "Amendments writable by procurement and approvers"
  ON public.po_amendments FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );
