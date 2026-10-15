-- ==============================================================================
-- MIGRATION 20260918000008: ALLOW STORES TO READ PURCHASE REQUISITIONS FOR GRN
--
-- Adds 'stores' and 'procurement_executive' to the SELECT policy on
-- public.purchase_requisitions so that store officers can inspect PR line items
-- and specifications during delivery verification and GRN creation (§8.6).
-- ==============================================================================

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
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'stores'::public.app_role)
    OR public.has_role(auth.uid(), 'purchase_committee'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'evp'::public.app_role)
  );
