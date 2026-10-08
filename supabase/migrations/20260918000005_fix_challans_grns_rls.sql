-- ==============================================================================
-- MIGRATION 20260918000005: FIX FULFILLMENT & GRN RLS POLICIES (TC-3.1 & TC-3.2)
--
-- Restores explicit INSERT and UPDATE policies for delivery_challans, grns,
-- and grn_lines, ensuring Stores, Procurement, HOD, and Admin roles can perform
-- fulfillment workflows even when connecting through session-based clients.
-- ==============================================================================

-- 1. DELIVERY CHALLANS (TC-3.1)
DROP POLICY IF EXISTS "Challans insertable by stores and procurement" ON public.delivery_challans;
CREATE POLICY "Challans insertable by stores and procurement"
  ON public.delivery_challans FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'stores'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 2. GOODS RECEIPT NOTES (GRN) (TC-3.2)
DROP POLICY IF EXISTS "GRNs insertable by stores and procurement" ON public.grns;
CREATE POLICY "GRNs insertable by stores and procurement"
  ON public.grns FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'stores'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Allow Stage 1 (Gate Security) and Stage 2 (Technical Inspection) sign-offs
DROP POLICY IF EXISTS "GRNs updatable by stores, hod, and admin" ON public.grns;
CREATE POLICY "GRNs updatable by stores, hod, and admin"
  ON public.grns FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'stores'::public.app_role)
    OR public.has_role(auth.uid(), 'hod'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 3. GRN LINE ITEMS (TC-3.2)
DROP POLICY IF EXISTS "GRN lines insertable by stores and procurement" ON public.grn_lines;
CREATE POLICY "GRN lines insertable by stores and procurement"
  ON public.grn_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'stores'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
