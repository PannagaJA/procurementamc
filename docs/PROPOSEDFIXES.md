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
| **Chart Hover & Tooltip Contrast** | High-contrast dark mode visualization | ✅ Removed white cursor background & fixed tooltip contrast |
| **Build & Type Safety** | Zero TypeScript / Vite compilation errors | ✅ `tsc --noEmit` passed (0 errors), `vite build` clean |

---

## 4. Location Charts: Cursor Background & Tooltip Text Contrast Fix

### Problem Statement
1. **White Cursor Background on Bar Hover:** When hovering over columns in **Inventory by Location** (`Dashboard.tsx`), Recharts rendered a prominent white/light-grey rectangle behind the hovered bar, which looked jarring against the dark theme card.
2. **Invisible Tooltip Text in Location Distribution:** When pointing the cursor at slices in the **Location Distribution** pie chart, Recharts rendered tooltip item text using hardcoded near-black styling (`rgb(51, 51, 51)`), making the item count (`Count : 311 items`) illegible against the dark popover background. Furthermore, the location name was omitted.

### Implemented Solution
1. **`src/pages/Dashboard.tsx`**:
   - Added `cursor={{ fill: "transparent" }}` to `<Tooltip>` in `<BarChart>`, completely removing the white cursor background highlight on hover.
   - Built custom high-contrast tooltip components `LocationBarTooltip` and `LocationPieTooltip` using Tailwind classes (`bg-popover text-popover-foreground border border-border shadow-xl px-3 py-2 rounded-lg`).
   - Slices now display the location name in bold (`text-sm font-semibold`), alongside a slice-matching color indicator dot and bright, readable count text (`text-foreground`).
   - Added `nameKey="location"` to `<Pie>` to ensure location names are correctly bound to tooltips and legends.
   - Formatted `<Legend>` labels to render in `text-card-foreground text-xs font-medium`.
2. **`src/pages/ViewerDashboard.tsx`**:
   - Added `cursor={{ fill: "transparent" }}` to `<ReTooltip>` on the location bar chart for application-wide consistency.

---

## 5. Calendar / Date Picker Indicator Visibility Fix in Dark Mode

### Problem Statement
In dark mode, the browser's native calendar icon inside date inputs (`<input type="date">`, `<input type="datetime-local">`, etc.) rendered pitch-black or nearly invisible across the app (such as `/add` for Invoice Date and Approval Date, and `/procurement/orders` for Rate Contract validity dates). This made it difficult for users to see or trigger the calendar picker.

### Root Cause
1. **WebKit Double-Inversion:**
   - Applying `color-scheme: dark` in Chrome/Chromium causes the browser to automatically render the picker glyph in white.
   - The preexisting stylesheet also applied `filter: invert(1)`, which inverted the white icon into pitch-black (`#000000`).
   - On dark navy and slate backgrounds (`#0f172a`, `#1e293b`), black on black was invisible.
2. **Component Color-Scheme Default:**
   - Reusable `<Input>` components did not explicitly declare dark color scheme utility classes.

### Implemented Solution
1. **`src/styles.css`**:
   - Implemented `filter: brightness(0) invert(1) !important;` for all date, datetime, time, month, and week native picker indicators:
     - `brightness(0)` reliably maps all color channels to black `(0, 0, 0)`.
     - `invert(1)` then flips black into pure crisp white `(255, 255, 255)`.
     - This guarantees the icon is 100% white regardless of whether the browser drew it black or white originally.
   - Added hover state with drop shadow (`drop-shadow(0 0 2px rgba(255, 255, 255, 0.8))`) and `opacity: 1 !important;` for interactive feedback.
2. **`src/components/ui/input.tsx`**:
   - Added `dark:[color-scheme:dark]` to ensure native browser controls inside `<Input>` properly respond to dark mode.


