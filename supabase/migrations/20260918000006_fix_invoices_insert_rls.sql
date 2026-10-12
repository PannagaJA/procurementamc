-- ==============================================================================
-- MIGRATION 20260918000006: FIX INVOICES INSERT RLS (TC-3.4)
--
-- Adds an explicit INSERT policy for the invoices table.
-- Migration 000004 removed the broad "FOR ALL" policy and added UPDATE/DELETE
-- denied policies, but inadvertently left no INSERT policy, causing all invoice
-- submissions to be blocked by RLS.
-- ==============================================================================

DROP POLICY IF EXISTS "Invoices insertable by finance and procurement" ON public.invoices;

CREATE POLICY "Invoices insertable by finance and procurement"
  ON public.invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_officer'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_executive'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
