-- ==============================================================================
-- MIGRATION 20260918000007: FIX PAYMENTS INSERT RLS (TC-3.6)
--
-- Migration 000004 set "Payments direct client writes denied" with WITH CHECK (false),
-- blocking ALL INSERT attempts from authenticated users on the payments table.
-- This migration adds an explicit INSERT policy restricted to finance and admin roles.
-- The INSERT gate is safe because recordPayment() enforces:
--   1. Invoice must be in "approved" status before payment is allowed.
--   2. Only finance / director_admin_finance / admin roles can call recordPayment().
-- ==============================================================================

DROP POLICY IF EXISTS "Payments direct client writes denied" ON public.payments;
DROP POLICY IF EXISTS "Payments insertable by finance and admin" ON public.payments;

CREATE POLICY "Payments insertable by finance and admin"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'finance'::public.app_role)
    OR public.has_role(auth.uid(), 'director_admin_finance'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Keep UPDATE blocked for direct clients (status changes go through server fns only)
DROP POLICY IF EXISTS "Payments direct client updates denied" ON public.payments;
CREATE POLICY "Payments direct client updates denied"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (false);
