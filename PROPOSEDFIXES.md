# Proposed Fixes & Implementation Documentation

**Document Purpose:** Complete specification and record of recent procurement workflow fixes and feature additions implemented across the application.

Please refer to the full documentation at: [docs/PROPOSEDFIXES.md](file:///c:/Users/Hemanth%20Raje%20URS%20HK/OneDrive/Desktop/stalight%20technologies/procurementamc/docs/PROPOSEDFIXES.md)

---

## Summary of Solutions Implemented:

### 1. Recurring Requisitions: Empty Frequency Validation
- **Problem:** Ticking "Recurring Requirement" submitted successfully even if the frequency was left blank.
- **Client Solution:** Added validation in `RaiseRequisition.tsx` blocking submission if frequency is empty, added standardized frequency dropdown (`Monthly`, `Quarterly`, `Annually`, etc.), and added SOP §8.2 guidance tip.
- **Server Solution:** Added guard in `pr.functions.ts` rejecting requests where `is_recurring = true` and `recurring_frequency` is empty.

### 2. In-App Rate Contract Registration Inside Purchase Orders
- **Problem:** Master Rate Contracts previously required direct SQL inserts in the database, with no UI for Procurement Officers to create them.
- **Solution in `PurchaseOrders.tsx`:**
  - Added **`+ New Rate Contract`** header button.
  - Added quick-action **`+ New Contract`** link inside the Create PO dialog.
  - Built full **Register Master Rate Contract** modal featuring:
    - Empanelled vendor selector (`status = 'empanelled'`).
    - Auto-generated contract number (`RC-YYYY-NNNN`).
    - 6-month validity period window per SOP §6 (`valid_from` to `valid_to`).
    - Interactive Schedule of Negotiated Rates multi-line table (Item description, Unit, Unit Rate).
  - Enhanced Rate Contract PO creation to allow selecting approved Requisitions (PR) and auto-binding contract vendor & scope of supply.

### 3. Location Charts: Cursor Background & Tooltip Contrast Fix
- **Problem:**
  - In "Inventory by Location", hovering over bars produced an unwanted white background rectangle.
  - In "Location Distribution", pointing at pie slices displayed tooltip text in dark near-black font (`rgb(51, 51, 51)`), making the item count illegible on dark backgrounds.
- **Solution in `Dashboard.tsx`:**
  - Added `cursor={{ fill: "transparent" }}` to `<Tooltip>` in `<BarChart>` to eliminate the white hover background.
  - Implemented high-contrast `LocationBarTooltip` and `LocationPieTooltip` components with theme-adaptive popover styling (`bg-popover text-popover-foreground border border-border shadow-xl px-3 py-2 rounded-lg`).
  - Added `nameKey="location"` to `<Pie>` and formatted `<Legend>` labels for crisp contrast in both dark and light modes.

### 4. Calendar / Date Picker Indicator Visibility Fix in Dark Mode
- **Problem:**
  - In dark mode, native calendar icons inside date inputs (`<input type="date">`, `<input type="datetime-local">`, etc.) rendered pitch-black, making them invisible against dark backgrounds across the application (e.g. `/add` Invoice Date, Approval Date, `/procurement/orders` Rate Contract validity dates).
- **Solution in `styles.css` & `input.tsx`:**
  - Applied `filter: brightness(0) invert(1) !important;` to `.dark input[type="date"]::-webkit-calendar-picker-indicator` (and time, datetime, month, week). This clamps any input color to black and flips it to pure crisp white (`#FFFFFF`) with 95% opacity.
  - Added hover drop-shadow glow for enhanced interactive contrast.
  - Added `dark:[color-scheme:dark]` to `src/components/ui/input.tsx`.


