# shadcn/ui visual refresh — AFK run

Branch: `shadcn-ui` (off `visual-refresh` → `design-review` → `main`).
**Committed locally, not pushed.**

## Done

- [x] Tailwind v4 via `@tailwindcss/vite`, imported as **theme + utilities layers
      only** — no preflight, which would have reset a 1876-line stylesheet and
      taken the calendar grid with it.
- [x] `components.json`, `@/*` path alias, `cn()` helper.
- [x] shadcn components vendored to `src/components/shadcn/` (not the
      conventional `components/ui/`: `src/components/ui.tsx` already exists and
      a sibling `ui/` directory would make every `from './ui'` ambiguous).
- [x] shadcn colour tokens aliased onto the app's existing palette via
      `@theme inline`, so one palette drives both systems and the appearance
      switch needs no extra wiring.
- [x] Header rebuilt on Button / Separator / Tooltip. Week stepper is the one
      bordered group; row-height and appearance sit flat. Every icon-only
      control has a real label + tooltip.
- [x] Tasks bar on Input / Button / Checkbox / Badge.
- [x] Day-header schedule tags (BLOCK / EARLY OUT) are Badges.
- [x] Block typography pass: title 12px/600 tighter tracking, teacher line
      subordinate, times quietest + tabular, hover lifts without transform,
      today's emphasis from the border rather than a heavier fill.
- [x] Verified light and dark at 1440×900 and at 375px, zero console errors.

## Three real bugs found and fixed while verifying

1. **React 18 vs 19.** The current shadcn registry targets React 19, where `ref`
   is an ordinary prop. This app is 18.3, so `TooltipTrigger asChild` could not
   attach a ref to `Button` → null ref → crash. `button.tsx` and `input.tsx` are
   wrapped in `forwardRef`. **These patches are overwritten by a future
   `shadcn add button` / `add input`.**
2. **Skipping preflight broke Tailwind's own utilities.** `border` compiles to
   `border-style: var(--tw-border-style)`, declared in preflight — undeclared,
   every shadcn border silently resolved to nothing. Same for
   `button { background-color: transparent }`, whose absence made ghost buttons
   fall through to the UA's grey `buttonface` and look like a stuck hover.
   Both are now declared in a `@layer base` block.
3. **Unlayered CSS outranks every layer.** `button { border: none }` sat
   unlayered at the top of the sheet and beat the utilities layer outright.
   Scoped to `button:not([data-slot])`.
   **Worth knowing for future work: element selectors in `styles.css` will beat
   Tailwind unless they exclude `[data-slot]`.**

## Deliberately not done

- **Next.js — not done, and I'd argue against it.** `.github/workflows` uploads
  `dist` (Vite's output) and `src/lib/sync.ts:8-9` reads
  `import.meta.env.VITE_SUPABASE_*`, supplied as repo secrets in CI. Next has no
  `import.meta.env`, so a port breaks the Pages deploy *and* silently switches
  sync off for every existing user. That fails the "as long as nothing breaks"
  condition. Doing it properly means porting the build, the PWA service worker,
  the `/MyCAL/` base path and the env layer — a rewrite of the app shell, not a
  visual change.
- **Sheets not converted to shadcn Dialog.** Inspector / Create / Reschedule /
  Sync / Onboarding are large custom sheets with their own scrim and the
  layered Escape handling added earlier. Converting them is a behavioural
  change for no visual gain at this size. Verified they still open, still look
  right, and Escape still closes them.
- **`dropdown-menu`, `toggle-group`, `toggle` removed.** Added them per the
  brief, then found no honest place for them — this app has no dropdown UX, and
  the appearance switch keeps its custom implementation because it cycles on
  mobile to hold the topbar to one row. Left as dead files they'd be noise.
- **Not pushed.** AFK rules bar outward-facing actions.

## Known / accepted

- **Mobile topbar is taller than before** (~87px → ~133px). shadcn's h-8/h-9
  defaults dropped touch targets to 32px; putting them back on the 44px floor
  costs height. Targets won.
- **No reference screenshot was attached** despite the request describing one,
  so this was built from the written spec.
- **Budget never reported a reading** (`exit 4` every check). The run was paced
  sequentially with no parallel agents as a result, but the spend is unverified.

## First thing to do when you read this

Look at it: `npm run dev` in `~/MyCAL` on branch `shadcn-ui`, then
<http://localhost:5273>. Toggle light/dark from the header.

Then, if you want it up:

```bash
cd ~/MyCAL && git push -u origin shadcn-ui
```
