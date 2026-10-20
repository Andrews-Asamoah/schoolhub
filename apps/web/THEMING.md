# Theming guide

All colour in the web app comes from **one place**: the tokens at the top of
[`src/index.css`](src/index.css). Components never choose colours; they pick a
*role* (`bg-card`, `text-muted-foreground`, `bg-success/10`) and the theme
decides what that role looks like in light and dark mode.

Change the look of the whole app by editing those tokens. Nothing else.

## Why dark colours used to leak into light mode

Tailwind v4 ties the `dark:` variant to the operating system's dark setting
unless told otherwise. The app switches themes with a `.dark` class, so on a
dark-mode computer every `dark:...` class applied even while the app was in
light mode. `index.css` now declares

```css
@custom-variant dark (&:where(.dark, .dark *));
```

so `dark:` follows the app's toggle only. `pnpm lint:theme` fails if that line
is removed.

## The rules

1. **Use token utilities, never raw colours.** No `bg-white`, `text-slate-500`,
   `bg-indigo-600`, `bg-[#f7f8fc]`, no hex in `style={{}}`.
2. **Don't add `dark:` colour classes.** A token already changes with the theme,
   so `bg-card` is correct in both modes. Use `dark:` only for deliberate
   structural differences (e.g. `dark:shadow-none`).
3. **Need a colour that doesn't exist?** Add a token (below), don't hard-code.

## Token reference

| Role | Use for | Utilities |
| --- | --- | --- |
| `background` / `foreground` | page canvas and default text | `bg-background text-foreground` |
| `card` / `card-foreground` | raised surfaces: cards, panels, modals | `bg-card text-card-foreground` |
| `popover` | menus, dropdowns, tooltips | `bg-popover text-popover-foreground` |
| `primary` | brand actions, links, active state | `bg-primary text-primary-foreground`, `text-primary`, `bg-primary/10` |
| `secondary`, `accent` | quiet fills, hover states, selected rows | `bg-secondary`, `hover:bg-accent` |
| `muted` / `muted-foreground` | subtle fills and secondary text | `bg-muted text-muted-foreground` |
| `border`, `input`, `ring` | dividers, field borders, focus ring | `border-border`, `border-input`, `ring-ring` |
| `destructive` | errors, delete | `bg-destructive text-destructive-foreground`, `bg-destructive/10 text-destructive` |
| `success` `warning` `info` `highlight` | status and categories | same pattern as destructive |
| `sidebar-*` | sidebar surfaces | `bg-sidebar text-sidebar-foreground` |
| `chart-1..5` | data visualisation | `fill-chart-1`, `stroke-chart-2` |
| `overlay` | modal scrim | `bg-overlay` |
| `brand-*` | fixed-dark banners that look the same in both themes (login hero, platform dashboard banner) | `bg-brand text-brand-foreground` |

Patterns:

- **Solid**: `bg-success text-success-foreground`
- **Tinted chip**: `bg-success/10 text-success border-success/20`
- **Hover**: `hover:bg-primary/90`, `hover:bg-muted`, `hover:bg-accent`

Text on a coloured banner must use that banner's `*-foreground` token
(`text-primary-foreground` on `bg-primary`). On the fixed brand banners use
`text-brand-foreground`.

## Changing the colour scheme

Edit the values in `:root` (light) and `.dark` (dark). Colours are
[OKLCH](https://oklch.com): `oklch(lightness chroma hue)`. For example, to
re-brand from indigo to green change the hue (`276`) of `--primary`,
`--ring`, `--accent`, `--sidebar-primary` and `--chart-1` in both blocks.

Then run:

```bash
pnpm --filter @schoolhub/web audit:theme   # WCAG contrast for every token pair, both modes
```

## Adding a new colour role

1. Add `--thing` and `--thing-foreground` to `:root` **and** `.dark`.
2. Register them in the `@theme inline` block: `--color-thing: var(--thing);`
3. Use `bg-thing text-thing-foreground`.
4. Add the pair to `PAIRS` in `scripts/audit-theme-contrast.mjs`.

## Guardrails

| Command | What it does |
| --- | --- |
| `pnpm --filter @schoolhub/web lint:theme` | fails on raw palette colours, `bg-white`/`text-white`, arbitrary hex classes, inline hex styles, and on removal of the `dark` variant fix. Also runs as part of `pnpm build`. |
| `pnpm --filter @schoolhub/web audit:theme` | checks WCAG AA contrast of the tokens themselves. |

A line that is genuinely data (for example a colour a school picks for a house)
can opt out with a trailing `// theme-allow: <reason>` comment, or a narrow
entry in `ALLOW` inside `scripts/check-theme.mjs`.

## Old class -> token cheat sheet

| Instead of | Use |
| --- | --- |
| `bg-white` | `bg-card` |
| `bg-slate-50` / `bg-slate-100` | `bg-muted/50` / `bg-muted` |
| `text-slate-900` | `text-foreground` |
| `text-slate-500` / `text-slate-600` | `text-muted-foreground` |
| `border-slate-200` | `border-border` |
| `bg-indigo-600 text-white` | `bg-primary text-primary-foreground` |
| `bg-indigo-50 text-indigo-700` | `bg-primary/10 text-primary` |
| `bg-emerald-50 text-emerald-700` | `bg-success/10 text-success` |
| `bg-amber-50 text-amber-700` | `bg-warning/10 text-warning` |
| `bg-rose-50 text-rose-700` | `bg-destructive/10 text-destructive` |
| `bg-black/40` | `bg-overlay` |
| `dark:bg-slate-900 dark:text-white` | (delete: the token already adapts) |
