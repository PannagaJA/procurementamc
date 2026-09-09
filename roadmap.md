# Port amc-inventory into this project

- [ ] Copy app source (pages, components, lib, hooks, utils, integrations) into src/
- [ ] Port styling: index.css + tailwind.config.ts -> src/styles.css (Tailwind v4)
- [ ] Install missing dependencies (exclude react-router-dom)
- [ ] Convert react-router-dom usage to @tanstack/react-router (~25 files)
- [ ] Create TanStack route files for all 34 routes
- [ ] Wire AuthProvider/ThemeProvider/Toasters into __root.tsx
- [ ] Verify: typecheck, build, preview loads, login page renders
- [ ] Get Supabase URL + anon key from user (project dywbeicausiukgzxsyfk) so the app connects to their existing backend
