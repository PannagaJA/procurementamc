-- =========================================================================
-- DAY 3 — Fulfilment, Payment Gate, Emergency Procurement, Vendor Rating
-- SOP §8.6 (GRN), §8.7 (Three-Way Match & Payment), §9 (Emergency), Annexure 4
-- =========================================================================

-- 1. Sequences & Generators
CREATE SEQUENCE IF NOT EXISTS public.challan_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.grn_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.payment_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.emergency_number_seq START 1001;

CREATE OR REPLACE FUNCTION public.generate_challan_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE yr text; seq_val bigint; BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('public.challan_number_seq');
  RETURN 'DC-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_grn_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE yr text; seq_val bigint; BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('public.grn_number_seq');
  RETURN 'GRN-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_emergency_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE yr text; seq_val bigint; BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('public.emergency_number_seq');
  RETURN 'EP-' || yr || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

-- 2. Delivery Challans Table (§8.6)
CREATE TABLE IF NOT EXISTS public.delivery_challans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number text UNIQUE DEFAULT public.generate_challan_number(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  packages_count integer DEFAULT 1,
  carrier_details text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Goods Receipt Notes (GRN) Table (§8.6)
CREATE TABLE IF NOT EXISTS public.grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number text UNIQUE DEFAULT public.generate_grn_number(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  delivery_challan_id uuid NOT NULL REFERENCES public.delivery_challans(id) ON DELETE RESTRICT,
  security_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  security_verified_at timestamptz,
  technical_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  technical_verified_at timestamptz,
  requires_technical_inspection boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'partially_accepted')),
  rejection_reason text,
  accepted_value numeric(14,2) NOT NULL DEFAULT 0,
  prepared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. GRN Line Items Table (§8.6)
CREATE TABLE IF NOT EXISTS public.grn_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid NOT NULL REFERENCES public.grns(id) ON DELETE CASCADE,
  description text NOT NULL,
  unit text,
  qty_delivered numeric(12,2) NOT NULL DEFAULT 0,
  qty_accepted numeric(12,2) NOT NULL DEFAULT 0,
  qty_rejected numeric(12,2) GENERATED ALWAYS AS (qty_delivered - qty_accepted) STORED,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  accepted_total numeric(14,2) GENERATED ALWAYS AS (qty_accepted * unit_price) STORED,
  inspection_remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Invoices Table (§8.7 Three-Way Match)
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  grn_id uuid REFERENCES public.grns(id) ON DELETE SET NULL,
  invoice_amount numeric(14,2) NOT NULL,
  gst_details_json jsonb DEFAULT '{}'::jsonb,
  is_duplicate_check_passed boolean NOT NULL DEFAULT true,
  match_status text NOT NULL DEFAULT 'pending' CHECK (match_status IN (
    'pending',
    'matched',
    'on_hold',
    'approved',
    'paid'
  )),
  hold_reason text,
  is_service_po boolean NOT NULL DEFAULT false,
  service_completion_cert_url text,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, invoice_number)
);

-- 6. Payments Table (§8.7)
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  payment_terms_ref text,
  external_ref text,
  payment_mode text NOT NULL DEFAULT 'bank_transfer' CHECK (payment_mode IN ('bank_transfer', 'neft', 'rtgs', 'cheque', 'upi')),
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Emergency Annual Ledger (SOP §9 Hard Cap ₹10,00,000)
CREATE TABLE IF NOT EXISTS public.emergency_annual_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text UNIQUE NOT NULL, -- e.g. '2026-27'
  running_total numeric(14,2) NOT NULL DEFAULT 0,
  cap_limit numeric(14,2) NOT NULL DEFAULT 1000000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Emergency Procurements Register (SOP §9)
CREATE TABLE IF NOT EXISTS public.emergency_procurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_number text UNIQUE DEFAULT public.generate_emergency_number(),
  pr_id uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  description text NOT NULL,
  estimated_cost numeric(14,2) NOT NULL,
  reason_standard_process_failed text NOT NULL,
  is_post_facto boolean NOT NULL DEFAULT false,
  register_entry_at timestamptz NOT NULL DEFAULT now(),
  evp_approval_status text NOT NULL DEFAULT 'pending' CHECK (evp_approval_status IN ('pending', 'approved', 'rejected')),
  evp_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evp_approved_at timestamptz,
  rejection_remarks text,
  quotations_obtained_count integer DEFAULT 1,
  price_reasonableness_note text,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  financial_year text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Vendor Performance Ratings Table (Annexure 4)
CREATE TABLE IF NOT EXISTS public.vendor_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  review_period text NOT NULL, -- e.g. 'FY2026-Q2' or 'Annual 2026'
  section_a_score numeric(5,2) NOT NULL, -- Quality & Specification (25%)
  section_b_score numeric(5,2) NOT NULL, -- Delivery & Timeline (20%)
  section_c_score numeric(5,2) NOT NULL, -- Price & Commercial (15%)
  section_d_score numeric(5,2) NOT NULL, -- Service & Technical Support (20%)
  section_e_score numeric(5,2),          -- Compliance & Safety (10% or null)
  section_f_score numeric(5,2) NOT NULL, -- Commercial Relations & Responsiveness (10%)
  weighted_score numeric(5,2) NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('preferred', 'active', 'active_notice', 'suspended', 'debarred')),
  notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  countersigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evp_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Triggers for updated_at
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'delivery_challans',
    'grns',
    'invoices',
    'emergency_annual_ledger',
    'emergency_procurements',
    'vendor_ratings'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I;', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t);
  END LOOP;
END $$;

-- 11. Row Level Security Policies (DEFAULT DENY, EXPLICIT GRANTS)
ALTER TABLE public.delivery_challans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_annual_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_procurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_ratings ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "Challans readable by authenticated" ON public.delivery_challans FOR SELECT TO authenticated USING (true);
CREATE POLICY "GRNs readable by authenticated" ON public.grns FOR SELECT TO authenticated USING (true);
CREATE POLICY "GRN lines readable by authenticated" ON public.grn_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Invoices readable by authenticated" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Payments readable by authenticated" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Emergency ledger readable by authenticated" ON public.emergency_annual_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "Emergency procurements readable by authenticated" ON public.emergency_procurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Vendor ratings readable by authenticated" ON public.vendor_ratings FOR SELECT TO authenticated USING (true);

-- Writable policies for Stores / Procurement / Finance / EVP / Admin
CREATE POLICY "Challans writable by stores and procurement" ON public.delivery_challans FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
  );

CREATE POLICY "GRNs writable by stores and procurement" ON public.grns FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
  );

CREATE POLICY "GRN lines writable by stores and procurement" ON public.grn_lines FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
  );

CREATE POLICY "Invoices writable by finance and admin" ON public.invoices FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
  );

CREATE POLICY "Payments writable by finance and admin" ON public.payments FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
  );

CREATE POLICY "Emergency procurements writable by users and EVP" ON public.emergency_procurements FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
    OR public.has_role(auth.uid(), 'hod'::public.app_role)
    OR public.has_role(auth.uid(), 'principal'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
  );

CREATE POLICY "Emergency ledger writable by EVP and admin" ON public.emergency_annual_ledger FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
  );

CREATE POLICY "Vendor ratings writable by committee and EVP" ON public.vendor_ratings FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );
