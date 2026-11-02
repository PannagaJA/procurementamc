# FRONTEND_DESIGN_AND_ARCHITECTURE_SPEC.md
# Master Frontend Specification for Hostel Management System (HMS)

> **MANDATORY INSTRUCTION FOR ALL AGENTS & DEVELOPERS:**
> Any and all frontend implementation (UI components, pages, design tokens, color palettes, layouts, state management, and API integrations) for this project **MUST STRICTLY REFER TO AND ADHERE TO THIS DOCUMENT**. No arbitrary styles, dark themes, or AI-generated generic templates are permitted.
>
> **CRITICAL COMPONENT RULE: STRICT USAGE OF SHADCN / RADIX UI & TANSTACK QUERY**
> 1. All interactive dropdowns, selects, dialogs, sheets, popovers, calendars, date-pickers, tooltips, and tabs across the entire application **MUST STRICTLY USE SHADCN / RADIX UI PRIMITIVES**. Do NOT use raw HTML `<select>`, unstyled native date inputs `<input type="date">`, or ad-hoc custom dropdowns.
> 2. All data fetching, caching, and state synchronization across components **MUST STRICTLY USE TANSTACK REACT QUERY (`useQuery`, `useMutation`)** with the global `queryClient` configuration. Do NOT write raw `useEffect` data fetching loops.

---

## 1. Design Philosophy & Visual Identity

The UI follows a **Modern Enterprise Soft-Pastel Light Theme** inspired by human-crafted SaaS dashboards with soft rounded geometry, clear visual hierarchy, rich dark top bars (`#0B1437`), soft pastel metric cards, and spacious breathing room.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  (H) HostelDesk     [ 🔍 Search student, room, pass... ]         [👤 Admin Profile]  │
├──────────────┬───────────────────────────────────────────────────────────────────────────┤
│ MAIN MENU    │  ┌─────────────────────────────────────────────────────────────────────┐ │
│ ┌──────────┐ │  │ Hi, Resident Student!                 [Gate Passes] [Report Issue] │ │
│ │📊Dashboard│ │  │ Aryabhatta Boys Hostel · Room 101     bg-gradient from-[#0B1437]   │ │
│ └──────────┘ │  └─────────────────────────────────────────────────────────────────────┘ │
│ 🏢 Hostels   │                                                                           │
│ 🛏️ Rooms     │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│ 👥 Residents │  │   Lime Card  │ │   Teal Card  │ │   Pink Card  │ │ Lavender Card│     │
│              │  │ Allotted Room│ │Active Outpass│ │Pending Passes│ │ Open Tickets │     │
│ OPERATIONS   │  │   Room 101   │ │Inside Hostel │ │  3 Requests  │ │ 2 Open Board │     │
│ 🎫 Gate Pass │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘     │
│ 🍽️ Mess Menu  │                                                                           │
│ 🔧 Issues    │  Quick Actions & Shared Quarters                                          │
│              │  ┌──────────────────────────────┐  ┌────────────────────────────────────┐ │
│ SETTINGS     │  │ Gate Passes & Outpasses      │  │ Roommates & Shared Quarters        │ │
│ ⚙️ System    │  │ Apply for night out permits  │  │ [Avatar] Alex Bed #1               │ │
│              │  └──────────────────────────────┘  └────────────────────────────────────┘ │
└──────────────┴───────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Design Tokens & Styling Rules

### 2.1 Color Palette & Token Definitions
| Token Name | Hex / Tailwind Code | Purpose |
| :--- | :--- | :--- |
| **Canvas Background** | `bg-slate-50` / `bg-emerald-50/20` | Main application background |
| **Surface White** | `bg-white` | White rounded panels, cards, modals (`rounded-3xl`) |
| **Primary Hero Navy** | `#0B1437` (`bg-[#0B1437]`) | Top banner gradient start, main action buttons, active navigation |
| **Teal Deep Accent** | `#082925` / `text-teal-950` | Top banner gradient end, secondary action buttons |
| **Sidebar Active Item** | `bg-[#0D3833] text-white` | Active pill navigation state in main sidebar |
| **Sidebar Inactive** | `text-slate-500 hover:bg-slate-100` | Inactive sidebar menu links |
| **Stat Card 1 (Room/Lime)** | `bg-blue-50 text-emerald-950` | Primary metric (Allotted Room, Total Hostels) |
| **Stat Card 2 (Pass/Teal)** | `bg-blue-100 text-teal-950` | Active permit / gate pass status metric |
| **Stat Card 3 (Pink/Rose)**| `bg-rose-50 text-rose-950` | Action required (Pending Passes, Outstanding Dues) |
| **Stat Card 4 (Lavender)** | `bg-[#E0E7FF] text-indigo-950` | Operational metric (Maintenance Tickets, Issues) |
| **Border Neutral** | `border-slate-200/80` | Card borders, dividers, table lines |
| **Text Primary** | `text-slate-900` | High-contrast headings and bold text |
| **Text Secondary** | `text-slate-500` / `text-slate-400` | Subtitles, labels, timestamps |

---

### 2.2 Buttons & Interactive Elements

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  BUTTON STYLING GUIDELINES                                                      │
├───────────────────────┬──────────────────────────────────────────────────────────┤
│ Primary Action Button │ bg-[#0B1437] text-white font-bold rounded-full px-5 py-2.5 │
│                       │ hover:bg-[#111f54] shadow-sm transition-all              │
├───────────────────────┼──────────────────────────────────────────────────────────┤
│ Secondary Emerald Pill│ bg-emerald-400 text-teal-950 font-bold rounded-full      │
│                       │ px-5 py-2.5 hover:bg-emerald-300 transition-all         │
├───────────────────────┼──────────────────────────────────────────────────────────┤
│ Glass Hero Action     │ bg-white/10 text-white border border-white/20           │
│                       │ hover:bg-white/20 rounded-full px-5 py-2.5               │
├───────────────────────┼──────────────────────────────────────────────────────────┤
│ Outline Action Button │ bg-white text-slate-700 border border-slate-200        │
│                       │ hover:bg-slate-50 rounded-xl px-4 py-2 font-bold         │
└───────────────────────┴──────────────────────────────────────────────────────────┘
```

---

### 2.3 Geometry & Rounded Corners
* **Hero Banners & Main Panels:** `rounded-3xl` (`24px`) with `p-6` or `p-8`.
* **Stat & Navigation Cards:** `rounded-3xl` (`24px`) with `border border-slate-200/80 shadow-sm`.
* **Action Buttons & Badges:** Full rounded pills `rounded-full` (`9999px`) or `rounded-2xl` (`16px`).
* **Avatars & Icon Containers:** `rounded-2xl` (`16px`) or `rounded-full`.

---

### 2.4 Typography
* **Primary Font:** `Inter`, `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.
* **Heading Size Scale:**
  - Hero Header: `text-2xl sm:text-3xl font-bold tracking-tight text-white`
  - Page Title: `text-xl sm:text-2xl font-bold text-slate-900 tracking-tight`
  - Card Value / Metric: `text-2xl` / `text-3xl font-bold`
  - Section Title: `text-base font-bold text-slate-900`
  - Small Label / Badge: `text-xs font-semibold uppercase tracking-wider`

---

## 3. Data Fetching & State Architecture (TanStack React Query)

All data fetching across student, warden, admin, and security pages follows TanStack Query standards:

1. **Global `QueryClient` (`lib/queryClient.ts`):**
   ```typescript
   export const queryClient = new QueryClient({
     defaultOptions: {
       queries: {
         staleTime: 1000 * 60 * 5, // 5 minutes instant cache window
         gcTime: 1000 * 60 * 30,    // 30 minutes garbage collection
         refetchOnWindowFocus: false,
         retry: 1,
       },
     },
   });
   ```

2. **Query Hook Pattern:**
   ```typescript
   const { data: profileData } = useQuery({
     queryKey: ['studentProfile'],
     queryFn: () => apiClient.get('/student/students/my_profile/').then(res => res.data),
     staleTime: 1000 * 60 * 5,
   });
   ```

3. **Mutation & Cache Invalidation:**
   ```typescript
   const queryClient = useQueryClient();
   const mutation = useMutation({
     mutationFn: (newPass) => apiClient.post('/security/gate-passes/', newPass),
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['myGatePasses'] });
     },
   });
   ```

---

## 4. Strict Component Guidelines: Shadcn UI Architecture

> **MANDATORY REQUIREMENT FOR ALL FORM CONTROLS & INTERACTIVE OVERLAYS**

1. **Dropdowns & Select Menus (`Select`, `SelectTrigger`, `SelectContent`, `SelectItem`):**
   - **MUST** use Shadcn Select / Radix Select component primitives.
   - Native HTML `<select>` elements are strictly forbidden.

2. **Date & Calendar Pickers (`DatePicker`, `Calendar`, `Popover`):**
   - **MUST** use Shadcn `Calendar` and `Popover` combinations with `date-fns` formatting.

3. **Dialogs & Modals (`Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`):**
   - **MUST** use Shadcn Dialog / Radix Dialog primitives with backdrop blur (`backdrop-blur-sm bg-black/50`).

4. **Tabs & Segmented Switches (`Tabs`, `TabsList`, `TabsTrigger`):**
   - **MUST** use Shadcn Tabs for switching views, filters, and role tabs.

---

## 5. Status Badges & Color Definitions
* **Approved / Active / Solved:** `bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1 text-xs font-semibold`
* **Pending / Review:** `bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1 text-xs font-semibold`
* **Rejected / Expired / Alert:** `bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-3 py-1 text-xs font-semibold`
* **In Progress / Maintenance:** `bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1 text-xs font-semibold`

---

## 6. Verification Checklist
- [x] Navy `#0B1437` to Teal `#082925` hero header banners.
- [x] Soft pastel metric cards (`bg-blue-50`, `bg-blue-100`, `bg-rose-50`, `bg-[#E0E7FF]`).
- [x] Pill action buttons (`bg-[#0B1437] text-white rounded-full`, `bg-emerald-400 text-teal-950 rounded-full`).
- [x] TanStack React Query (`useQuery` / `useMutation`) for instant (<50ms) rendering across all pages.
- [x] Shadcn UI primitives for Selects, Modals, Popovers, and Tabs.
