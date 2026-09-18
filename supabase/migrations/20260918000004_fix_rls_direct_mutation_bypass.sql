-- ==============================================================================
-- MIGRATION 20260918000004: FIX RLS DIRECT MUTATION BYPASS
--
-- Revokes broad direct UPDATE/ALL permissions from `authenticated` on all
-- status, approval, and amount-bearing procurement tables.
-- All state transitions, threshold validations, and approval sign-offs must
-- route exclusively through the server domain tier (service_role / server functions).
-- ==============================================================================

-- 1. PURCHASE ORDERS
DROP POLICY IF EXISTS "POs writable by procurement and approvers" ON public.purchase_orders;
-- Deny direct client UPDATE/DELETE. SELECT remains permitted for authenticated users.
CREATE POLICY "POs direct client updates denied"
  ON public.purchase_orders FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "POs direct client deletes denied"
  ON public.purchase_orders FOR DELETE
  TO authenticated
  USING (false);


-- 2. EMERGENCY PROCUREMENTS
DROP POLICY IF EXISTS "Emergency procurements writable by users and EVP" ON public.emergency_procurements;
-- Allow INSERT of draft requests by authenticated users with pending status only
CREATE POLICY "Emergency procurements insertable as pending only"
  ON public.emergency_procurements FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND evp_approval_status = 'pending'
    AND evp_approved_by IS NULL
    AND evp_approved_at IS NULL
  );

-- Deny direct client UPDATE/DELETE on approval fields
CREATE POLICY "Emergency procurements direct updates denied"
  ON public.emergency_procurements FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Emergency procurements direct deletes denied"
  ON public.emergency_procurements FOR DELETE
  TO authenticated
  USING (false);


-- 3. VENDORS & VENDOR BLACKLIST
DROP POLICY IF EXISTS "Vendors updatable by procurement and evp and admin" ON public.vendors;
DROP POLICY IF EXISTS "Vendor blacklist writable by evp and admin" ON public.vendor_blacklist;

-- Deny direct client status/empanelment updates
CREATE POLICY "Vendors direct status updates denied"
  ON public.vendors FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Vendor blacklist direct writes denied"
  ON public.vendor_blacklist FOR ALL
  TO authenticated
  USING (false);


-- 4. INVOICES & PAYMENTS
DROP POLICY IF EXISTS "Invoices writable by finance and admin" ON public.invoices;
DROP POLICY IF EXISTS "Payments writable by finance and admin" ON public.payments;

-- Deny direct client UPDATE/DELETE on invoices (matching and approvals restricted to server functions)
CREATE POLICY "Invoices direct client updates denied"
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Invoices direct client deletes denied"
  ON public.invoices FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "Payments direct client writes denied"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Payments direct client updates denied"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (false);


-- 5. PURCHASE REQUISITIONS
DROP POLICY IF EXISTS "PR updatable by approver roles or requester" ON public.purchase_requisitions;

-- Requesters can update their OWN PR ONLY when still in 'draft' status, and CANNOT change approval/status fields
CREATE POLICY "PR updatable by requester in draft only"
  ON public.purchase_requisitions FOR UPDATE
  TO authenticated
  USING (
    requested_by = auth.uid()
    AND status = 'draft'
  )
  WITH CHECK (
    requested_by = auth.uid()
    AND status = 'draft'
    AND current_approver_role IS NULL
    AND is_emergency = false
  );

CREATE POLICY "PR direct approvals or deletes denied"
  ON public.purchase_requisitions FOR DELETE
  TO authenticated
  USING (false);


-- 6. COMPARATIVE STATEMENTS & SCORES
DROP POLICY IF EXISTS "CS writable by procurement and approvers" ON public.comparative_statements;
DROP POLICY IF EXISTS "CS line scores writable by committee" ON public.cs_line_scores;

CREATE POLICY "CS direct updates denied"
  ON public.comparative_statements FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "CS line scores direct updates denied"
  ON public.cs_line_scores FOR UPDATE
  TO authenticated
  USING (false);


-- 7. VENDOR RATINGS
DROP POLICY IF EXISTS "Vendor ratings writable by committee and EVP" ON public.vendor_ratings;

CREATE POLICY "Vendor ratings direct writes denied"
  ON public.vendor_ratings FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Vendor ratings direct updates denied"
  ON public.vendor_ratings FOR UPDATE
  TO authenticated
  USING (false);


-- 8. GOODS RECEIPT NOTES (GRN) & CHALLANS
DROP POLICY IF EXISTS "GRNs writable by stores and procurement" ON public.grns;
DROP POLICY IF EXISTS "GRN lines writable by stores and procurement" ON public.grn_lines;
DROP POLICY IF EXISTS "Challans writable by stores and procurement" ON public.delivery_challans;

CREATE POLICY "GRNs direct updates denied"
  ON public.grns FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "GRN lines direct updates denied"
  ON public.grn_lines FOR UPDATE
  TO authenticated
  USING (false);


-- 9. EMERGENCY ANNUAL LEDGER (TAMPER-PROOF)
DROP POLICY IF EXISTS "Emergency ledger writable by EVP and admin" ON public.emergency_annual_ledger;

CREATE POLICY "Emergency ledger direct writes denied"
  ON public.emergency_annual_ledger FOR ALL
  TO authenticated
  USING (false);


-- 10. MATRIX RULES & DEVIATIONS
DROP POLICY IF EXISTS "Matrix rules editable by admin" ON public.approval_matrix_rules;
DROP POLICY IF EXISTS "Deviations writable by evp and admin" ON public.deviation_approvals;

CREATE POLICY "Matrix rules direct writes denied"
  ON public.approval_matrix_rules FOR ALL
  TO authenticated
  USING (false);

CREATE POLICY "Deviations direct writes denied"
  ON public.deviation_approvals FOR ALL
  TO authenticated
  USING (false);
