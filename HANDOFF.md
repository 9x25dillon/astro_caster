# Astra — Session Handoff

Continuing the Astra observatory (`/home/kill/astro-aae`). Read the `project-aae-state`
memory first — it has the working config, dev token, the new default chart
(Nov 11 1987, with Einstein kept as `PLACEHOLDER_BIRTH`), and last session's UI work
(amethyst accent system, unified wheel popovers, sigil draw-on animation, tier budgets).

## Launch
`./run.sh` from project root → frontend `:5173`, backend `:8787`. Unlock
supporter/oracle features in the browser with
`localStorage.setItem("aae.entitlement", "<AAE_DEV_TOKEN from backend/.env>")`.
Validate changes with `cd frontend && ./node_modules/.bin/tsc -b && npx vite build`
(always end on a green build).

## Suggested next moves (pick by what's asked)
- Carry the diegetic amethyst/gold language into surfaces still on plain chrome
  (SupportModal, AdminPanel, Controls).
- Wheel polish: hover affordance on transit-to-natal chords (they're the one
  popover-less layer); optional click-to-pin a popover.
- Consider the open security items from the inspection: the trust-mode donation
  bypass and live secrets in `backend/.env` (rotate before any deploy).

## How to work best here
- I can't see the rendered canvas — give screenshots, element names, or
  "12 o'clock"-style coordinates for UI bugs.
- State the full scope of multi-part visual work up front (which surfaces, which
  tier) so generic systems get built once instead of refactored.
- Name the persona to test as (free/supporter/oracle).
- Batch related edits; verify once per logical group.
