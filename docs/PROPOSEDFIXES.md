# Proposed Fixes & Implementation Documentation

**Document Purpose:** Complete specification and record of recent procurement workflow fixes and feature additions implemented across the application.

---

## 1. Recurring Requisitions: Empty Frequency Submission Fix

### Problem Statement
When raising a Purchase Requisition (`/procurement/raise-pr`), users could check the **"Recurring Requirement"** checkbox and leave the recurrence frequency text input completely blank. The form would successfully submit without prompting for frequency, generating ambiguous recurring requisitions in the database with `is_recurring = true` and `recurring_frequency = ""` or `null`.

### Root Cause
1. **Client-Side:** In [RaiseRequisition.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/RaiseRequisition.tsx), `handleSubmit()` checked required fields for `departmentId`, `justification`, and `lineItems`, but lacked a validation guard for `isRecurring && !recurringFrequency.trim()`.
2. **Server-Side:** In [pr.functions.ts](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/lib/procurement/pr.functions.ts), the `createPr` RPC accepted `recurring_frequency: string | null` without validating that recurring requisitions must declare a valid frequency under SOP §8.1.
3. **UX Gap:** The free-text input allowed unstructured input like `"1m"` or `"every few weeks"`, leading to inconsistent reporting.

### Implemented Solution
1. **Client-Side Form Validation ([RaiseRequisition.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/RaiseRequisition.tsx)):**
   - Added validation check before submission:
     ```typescript
     if (isRecurring && (!recurringFrequency || !recurringFrequency.trim())) {
       toast({
         title: "Recurring Frequency Required",
         description: "Please specify the frequency (e.g. Monthly, Quarterly) for this recurring requisition.",
         variant: "destructive",
       });
       return;
     }
     ```
   - Auto-clears `recurringFrequency` if the user unchecks the checkbox.
2. **Standardized Frequency Selector ([RaiseRequisition.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/RaiseRequisition.tsx)):**
   - Replaced raw free-text box with a preset dropdown containing:
     - `Monthly (12x / year)`
     - `Bi-Monthly (Every 2 months)`
     - `Quarterly (Every 3 months)`
     - `Half-Yearly (Every 6 months)`
     - `Annually (Once a year)`
     - `Custom frequency...` (reveals text input for non-standard intervals).
   - Added contextual SOP guidance banner informing requesters that routine recurring consumables qualify for a 6-month Master Rate Contract under SOP §8.2.
3. **Server-Side API Guard ([pr.functions.ts](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/lib/procurement/pr.functions.ts)):**
   - Added server-side validation:
     ```typescript
     if (data.is_recurring && (!data.recurring_frequency || !data.recurring_frequency.trim())) {
       return {
         ok: false as const,
         error: "Recurring frequency is required when Recurring Requirement is enabled (SOP §8.1).",
         code: "recurring_frequency_required",
       };
     }
     ```

---

## 2. In-App Rate Contract Registration Inside Purchase Orders

### Problem Statement
The database table `rate_contracts` and backend server guards (`createPo` in `po.functions.ts`) supported issuing Rate Contract POs, but there was no user interface to create or manage Master Rate Contracts. Users had to manually run SQL queries in the database to insert agreements. Additionally, when attempting to create a Rate Contract PO, the modal lacked a dropdown to bind approved Purchase Requisitions.

### Implemented Solution

#### A. In-App "Create Rate Contract" Modal ([PurchaseOrders.tsx](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/src/pages/procurement/PurchaseOrders.tsx))
Built a dedicated modal and header action for Procurement Officers and Admins:
1. **Header Action:** Added **`+ New Rate Contract`** button alongside `Create PO`.
2. **Quick-Link inside PO Creation:** When switching PO type to `Rate Contract Order`, a **`+ New Contract`** shortcut allows instant agreement creation without leaving the flow.
3. **Form Fields:**
   - **Contract Number:** Auto-generated sequence (`RC-YYYY-NNNN`) with manual override.
   - **Empanelled Vendor:** Selectable dropdown filtered strictly by active, empanelled suppliers (`status = 'empanelled'`).
   - **Category:** SOP category selector (`routine_consumable`, `services_amc`, `maintenance`).
   - **Agreement Title:** Descriptive contract label.
   - **Validity Window:** Start date (`valid_from`) and Expiry date (`valid_to`), defaulting to the SOP §6 mandatory **6-month validity period**.
   - **Schedule of Negotiated Rates:** Interactive multi-line items table with item description, unit of measure, and fixed unit rate (₹). Supports dynamic addition and deletion of item rows.
4. **Auto-Binding:** Submitting the modal immediately refreshes the active contracts list and automatically selects the newly created contract in the PO creation dialog.

#### B. Rate Contract PO Binding
Enhanced the **Create Purchase Order** modal:
1. When `poType === "rate_contract"`, selecting an agreement automatically sets:
   - `selectedVendorId` to the contract's vendor.
   - `scopeOfSupply` to `Supply against Rate Contract {contract_number} ({title})`.
2. Added an **Approved Purchase Requisition (PR)** selector, allowing the Procurement Officer to select which approved requisition this contract order fulfills (satisfying SOP §8.5 G5 requirement that all POs must reference an approved PR).
3. Pre-populates the order price from the PR's estimated value for faster entry.

---

## 3. Verification & Compliance Checklist

| Feature | SOP Requirement | Verification Status |
| :--- | :--- | :--- |
| **Recurring PR Validation** | SOP §8.1: PR completeness and necessity | ✅ Validated on client & server (empty frequency blocked) |
| **Rate Contract Validity** | SOP §6: 6-month validity window for rate contracts | ✅ Defaulted & enforced on registration |
| **Vendor Empanelment Gate**| SOP §8.2: Only empanelled vendors may hold contracts | ✅ Strictly filtered by `status = 'empanelled'` |
| **PO Linking Rule** | SOP §8.5 G5: Every PO must reference an approved PR | ✅ Required PR dropdown active on Rate Contract POs |
| **Build & Type Safety** | Zero TypeScript / Vite compilation errors | ✅ `tsc --noEmit` passed (0 errors), `vite build` clean |
