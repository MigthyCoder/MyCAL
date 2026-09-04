# shadcn/ui visual refresh — AFK run

Branch: `shadcn-ui` (off `visual-refresh`, which is off `design-review`).

## Standing decisions

- **Next.js: NOT done, deliberately.** The deploy workflow uploads `dist` (Vite's
  output) and `src/lib/sync.ts:8-9` reads `import.meta.env.VITE_SUPABASE_*`,
  which CI supplies as repo secrets. Next has no `import.meta.env`, so a port
  would break the GitHub Pages deploy *and* silently switch off sync for every
  existing user. That fails the "as long as nothing breaks" condition attached
  to the request, so I left the framework alone. See "If you still want Next".
- **Not pushed.** AFK rules bar outward-facing actions. Commits are local; the
  push command is in the handoff.
- **Budget:** guard armed at start. First reading was `NO READING` (exit 4), so
  the run was paced sequentially rather than fanned out. Final figure at bottom.

## Checklist

- [x] Branch `shadcn-ui`
- [x] Install tailwindcss, @tailwindcss/vite, radix-ui, cva, clsx,
      tailwind-merge, lucide-react
- [ ] Tailwind wired WITHOUT preflight (preflight would reset the 1876-line
      stylesheet and destroy the calendar grid)
- [ ] `components.json`
- [ ] shadcn components added
- [ ] CSS tokens bridged into the Tailwind theme so both systems share one palette
- [ ] Header converted
- [ ] Tasks bar converted
- [ ] Blocks + boxes redesigned
- [ ] Verified in both appearances at desktop width
- [ ] Self-audit pass
- [ ] Adversarial re-check of the fixes

## Notes / assumptions

- No reference screenshot was attached to the request despite being described as
  provided; worked from the written spec instead.
- Calendar grid and BlockCard stay custom components, per the original brief.
  shadcn covers header controls, tasks bar, tooltips, dropdowns, dialogs.
