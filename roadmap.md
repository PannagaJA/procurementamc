# AMC Inventory — port to Lovable

- [x] Copy source (pages, components, lib, hooks, utils, integrations, public)
- [x] Port Tailwind v3 design tokens to Tailwind v4 styles.css (light/dark kept)
- [x] Install dependencies (pinned react-day-picker@8, react-resizable-panels@2 to match original UI code)
- [x] Convert react-router-dom → @tanstack/react-router (all links, navigate, params)
- [x] Create all 31 route files (dashboard, auth, inventory, quotations, tickets, HOD, principal, viewer, librarian, admin)
- [x] Wire providers in root (Theme, Auth, Tooltip, Toaster, Sonner)
- [x] Fix pre-existing repo bugs (Dashboard search state, ReturnBook maps, duplicate status fields, confirm dialog)
- [x] Typecheck clean + production build passes
- [x] Verified login page renders identically in preview
- [ ] Add real Supabase anon key to .env (BLOCKED: needs key from user's Supabase dashboard)
