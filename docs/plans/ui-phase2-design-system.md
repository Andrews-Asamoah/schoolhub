# Phase 2 — Shared interface foundation

This PR introduces consistent shadcn-inspired UI building blocks, retaining
SchoolHub's semantic design tokens and existing business logic.

## Shared components
- `ui/page-header.tsx`: one responsive page header with eyebrow, optional icon,
  description and actions
- `ui/page-container.tsx`: one responsive content width/spacing for school and
  platform-admin workspaces
- `ui/empty-state.tsx`: unified empty and error messaging
- `ui/skeleton.tsx`: reusable skeleton blocks and labelled loading states
- `ui/badge.tsx`: theme-aware semantic status chips
- `ui/input.tsx`: consistent accessible inputs and textareas
- Existing `Button`, `Card`, `Select`, `Table` and `Form*` use shared sizes,
  focus indicators and theme tokens

## Roll-out
- School page headings and empty states now use the same components as
  the superadmin equivalents
- Layouts share a 1500px maximum content width and responsive gutters
- Portal dialogs use labelled modal semantics, focus containment/restoration,
  scroll locking and responsive height limits
- Confirmation actions use consistent primary/destructive/outline buttons
- Clickable financial metric cards are real keyboard-operable buttons

## Guardrails
- No changes to roles, tenant access, accounting calculations or API contracts
- Keep `pnpm --filter @schoolhub/web lint:theme` passing in both themes
- Accessibility and visual smoke tests (mobile/desktop, light/dark, calendar
  inside modal, nested Select overlays) remain required in a live browser
- Chart palette / Recharts overhaul is Phase 3, not included here
