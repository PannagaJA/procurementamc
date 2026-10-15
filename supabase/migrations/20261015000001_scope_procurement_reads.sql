-- Scope read access on procurement tables.
-- Before this, every table below had a SELECT policy of USING (true): any signed-in user
-- (faculty, librarian, student...) could read every PO, quote, invoice, payment and vendor
-- bank detail. Writes are unchanged (they already go through server functions / deny-by-default).
--
-- Who reads what after this migration:
--   procurement staff  -> everything (admin, super_admin, evp, director_admin_finance,
--                         purchase_committee, principal, procurement_officer/executive,
--                         finance, stores, auditor)
--   HOD                -> their department's POs and everything hanging off them
--                         (amendments, challans, GRNs, invoices, payments), their
--                         department's emergency requests, and vendor records
--   requester          -> POs (and their downstream records) for PRs they raised,
--                         their own emergency requests, line items of PRs they can see
--   quotes, CS, RFQs, vendor ratings/documents -> procurement staff only
--
-- Vendors never read these tables directly: the quotation portal uses server functions.

create or replace function public.is_procurement_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role in ('admin', 'super_admin', 'evp', 'director_admin_finance', 'purchase_committee',
                   'principal', 'principle', 'procurement_officer', 'procurement_executive',
                   'finance', 'stores', 'auditor')
  )
$$;

create or replace function public.is_hod_of(_user_id uuid, _department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _department_id is not null and exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = 'hod' and department_id = _department_id
  )
$$;

-- Purchase orders: staff, the department's HOD, or the person who raised the PR.
drop policy if exists "POs readable by authenticated" on public.purchase_orders;
drop policy if exists "POs readable by staff, department HOD or requester" on public.purchase_orders;
create policy "POs readable by staff, department HOD or requester" on public.purchase_orders
  for select to authenticated using (
    public.is_procurement_staff(auth.uid())
    or public.is_hod_of(auth.uid(), department_id)
    or exists (select 1 from public.purchase_requisitions pr
               where pr.id = purchase_orders.pr_id and pr.requested_by = auth.uid())
  );

-- Records that belong to a PO inherit the PO's visibility (the subquery is RLS-filtered).
drop policy if exists "Amendments readable by authenticated" on public.po_amendments;
drop policy if exists "Amendments readable with their PO" on public.po_amendments;
create policy "Amendments readable with their PO" on public.po_amendments
  for select to authenticated using (
    public.is_procurement_staff(auth.uid())
    or exists (select 1 from public.purchase_orders po where po.id = po_amendments.po_id)
  );

drop policy if exists "Challans readable by authenticated" on public.delivery_challans;
drop policy if exists "Challans readable with their PO" on public.delivery_challans;
create policy "Challans readable with their PO" on public.delivery_challans
  for select to authenticated using (
    public.is_procurement_staff(auth.uid())
    or exists (select 1 from public.purchase_orders po where po.id = delivery_challans.po_id)
  );

drop policy if exists "GRNs readable by authenticated" on public.grns;
drop policy if exists "GRNs readable with their PO" on public.grns;
create policy "GRNs readable with their PO" on public.grns
  for select to authenticated using (
    public.is_procurement_staff(auth.uid())
    or exists (select 1 from public.purchase_orders po where po.id = grns.po_id)
  );

drop policy if exists "GRN lines readable by authenticated" on public.grn_lines;
drop policy if exists "GRN lines readable with their GRN" on public.grn_lines;
create policy "GRN lines readable with their GRN" on public.grn_lines
  for select to authenticated using (
    public.is_procurement_staff(auth.uid())
    or exists (select 1 from public.grns g where g.id = grn_lines.grn_id)
  );

drop policy if exists "Invoices readable by authenticated" on public.invoices;
drop policy if exists "Invoices readable with their PO" on public.invoices;
create policy "Invoices readable with their PO" on public.invoices
  for select to authenticated using (
    public.is_procurement_staff(auth.uid())
    or exists (select 1 from public.purchase_orders po where po.id = invoices.po_id)
  );

drop policy if exists "Payments readable by authenticated" on public.payments;
drop policy if exists "Payments readable with their PO" on public.payments;
create policy "Payments readable with their PO" on public.payments
  for select to authenticated using (
    public.is_procurement_staff(auth.uid())
    or exists (select 1 from public.purchase_orders po where po.id = payments.po_id)
  );

-- PR line items: procurement staff (stores/finance need them for GRNs and POs, though the PR
-- policy itself doesn't cover them), otherwise follow the PR's own policy.
drop policy if exists "PR items readable by authenticated" on public.pr_line_items;
drop policy if exists "PR items readable with their PR" on public.pr_line_items;
create policy "PR items readable with their PR" on public.pr_line_items
  for select to authenticated using (
    public.is_procurement_staff(auth.uid())
    or exists (select 1 from public.purchase_requisitions pr where pr.id = pr_line_items.pr_id)
  );

-- Emergency requests: staff, the requester, or their department's HOD.
drop policy if exists "Emergency procurements readable by authenticated" on public.emergency_procurements;
drop policy if exists "Emergency procurements readable by staff, requester or HOD" on public.emergency_procurements;
create policy "Emergency procurements readable by staff, requester or HOD" on public.emergency_procurements
  for select to authenticated using (
    public.is_procurement_staff(auth.uid())
    or requested_by = auth.uid()
    or public.is_hod_of(auth.uid(), department_id)
  );

-- Vendor master (includes bank details): staff and HODs.
drop policy if exists "Vendors readable by authenticated users" on public.vendors;
drop policy if exists "Vendors readable by staff and HODs" on public.vendors;
create policy "Vendors readable by staff and HODs" on public.vendors
  for select to authenticated using (
    public.is_procurement_staff(auth.uid()) or public.has_role(auth.uid(), 'hod')
  );

-- Pricing, evaluation and vendor assessment: procurement staff only.
drop policy if exists "RFQs readable by authenticated" on public.rfqs;
drop policy if exists "RFQs readable by staff" on public.rfqs;
create policy "RFQs readable by staff" on public.rfqs
  for select to authenticated using (public.is_procurement_staff(auth.uid()));

drop policy if exists "RFQ Vendors readable by authenticated" on public.rfq_vendors;
drop policy if exists "RFQ vendors readable by staff" on public.rfq_vendors;
create policy "RFQ vendors readable by staff" on public.rfq_vendors
  for select to authenticated using (public.is_procurement_staff(auth.uid()));

drop policy if exists "Quotation lines readable by authenticated" on public.quotation_lines;
drop policy if exists "Quotation lines readable by staff" on public.quotation_lines;
create policy "Quotation lines readable by staff" on public.quotation_lines
  for select to authenticated using (public.is_procurement_staff(auth.uid()));

drop policy if exists "CS readable by authenticated" on public.comparative_statements;
drop policy if exists "CS readable by staff" on public.comparative_statements;
create policy "CS readable by staff" on public.comparative_statements
  for select to authenticated using (public.is_procurement_staff(auth.uid()));

drop policy if exists "CS line scores readable by authenticated" on public.cs_line_scores;
drop policy if exists "CS line scores readable by staff" on public.cs_line_scores;
create policy "CS line scores readable by staff" on public.cs_line_scores
  for select to authenticated using (public.is_procurement_staff(auth.uid()));

drop policy if exists "Vendor ratings readable by authenticated" on public.vendor_ratings;
drop policy if exists "Vendor ratings readable by staff" on public.vendor_ratings;
create policy "Vendor ratings readable by staff" on public.vendor_ratings
  for select to authenticated using (public.is_procurement_staff(auth.uid()));

drop policy if exists "Vendor docs readable by authenticated users" on public.vendor_documents;
drop policy if exists "Vendor documents readable by staff" on public.vendor_documents;
create policy "Vendor documents readable by staff" on public.vendor_documents
  for select to authenticated using (public.is_procurement_staff(auth.uid()));
