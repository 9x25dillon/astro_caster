# The engraved observatory

Astra becomes an engraved astronomical instrument: aurum establishes reference, vitriol marks measured coordinates, and parchment gives prose a physically distinct reading surface. Maximalism lives in concentric geometry and material detail; navigation targets and astronomical positions remain stable.

## Token system

The complete executable token set is [`frontend/src/observatory.css`](../../frontend/src/observatory.css), loaded after the legacy theme.

| Role | Token | Rationale |
| --- | --- | --- |
| Obsidian substrate | `--void`, `--obsidian{,-2,-3}` | Green-black depth evokes oxidized instrument housings. |
| Engraved reference | `--gold{,-soft,-bright}` | Brass rules and graduations separate structure from data. |
| Computed coordinates | `--ion`, `--ion-soft` | Vitriol green separates coordinates from brass structure. |
| Reading | `--parchment`, `--sepia`, `--ink` | Warm, opaque surfaces and quieter secondary text. |
| Tension / harmony | `--danger`, `--harmonious` | Copper and verdigris preserve semantic distinctions. |
| Type | `--display`, `--serif`, `--mono` | Book display, sustained reading, tabular instrument notation. The vendored Cormorant / EB Garamond faces lead both serif stacks (no font request either way, and the only faces an Android WebView can render); the system faces are fallbacks. |
| Spacing | `--space-1` … `--space-12` | Quarter-rem scale, dense instrumentation with separated reading areas. |
| Elevation | `--elevation-1`, `--elevation-2` | Inset metallic edge and restrained physical shadow. |

Hex colors are the baseline; `@supports` upgrades selected colors to `oklch()`. Legacy `--amethyst` names alias the vitriol palette for compatibility, and legacy hardcoded amethyst accents have been migrated.

## Signature component — Celestial Index

Full semantic HTML/SVG and JavaScript behavior are implemented in [`CelestialIndex.tsx`](../../frontend/src/components/CelestialIndex.tsx); its annotated CSS is in [`observatory.css`](../../frontend/src/observatory.css).

- Seven classical-body buttons use the actual chart response. Each selects the existing planet detail through Zustand; native keyboard activation, `aria-pressed`, and a polite atomic coordinate announcement are retained.
- The pointer displays normalized zodiac longitude clockwise from the top reference. This is a coordinate index, distinct from the chart wheel's Ascendant-relative orientation. The SVG is decorative because the adjacent text exposes the same data.
- The two interlocking triangles form a sixfold lattice. Its rotation is ornamental; the longitude pointer does not rotate with it.
- `@container celestial` rearranges the instrument at 850px and 580px; the outer shell retains its established viewport breakpoints.
- `:has(button:focus-visible)` illuminates the containing instrument. Registered `@property --index-light` and `color-mix(in oklch, …)` provide a bounded hover wash on small buttons.
- The empty state says “Awaiting chart coordinates”; natal/current-sky labels follow the store. No synthetic planetary positions or network dependencies are introduced.

## Motion spec

| Layer | Timing / timeline | Property |
| --- | --- | --- |
| Sixfold lattice | 180s linear, perpetual | `transform: rotate()` |
| Aether field | 18s eased alternating | `opacity`, `translate3d()` |
| Chapter arrival | 320ms, `--ease-orbit` | 16px translation + opacity |
| Parchment arrival | `view()`, entry 0–90% | Translation + opacity |
| Masthead recession | named `--folio` root scroll timeline, 0–500px | Reverse reveal |
| Button wash | 180ms | Registered percentage, local paint only |

Keyframes, `scroll-timeline-name`, and `animation-timeline` declarations are executable in the stylesheet. Timeline effects are inside `@supports`; unsupported browsers receive visible, static content. Decorative motion uses transforms and opacity, without promising a hardware-specific frame time. CSS reduced motion disables animations/transitions; the canvas starfield independently watches the same media query and document visibility, with listener and animation-frame cleanup.

Modern API references: [container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries), [scroll timelines](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines), [reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion).

## Migration and verification

1. `main.tsx` loads `observatory.css` after `theme.css`. The override file owns the material system; legacy layout, selection classes, modal composition, and chapter IDs remain in place.
2. The header includes the index. Controls, payment actions, chart calculations, storage, offline fallbacks, chapter routing, and mobile dial order retain their existing contracts.
3. Threshold prose moves to light parchment with explicitly dark text and buttons; chapter surfaces use opaque green-black panels. Hologram scan/flicker effects retire in favor of static edge light; canvas geometry uses vitriol instead of cyan.
4. Existing shell tests recognize the expanded wordmark. The hover-geometry test scrolls its target into view before measurement so viewport scrolling cannot masquerade as glyph movement.
5. `celestial-index.spec.ts` checks keyboard selection, corresponding chart detail, a 390px viewport without horizontal overflow, and reduced-motion styling. It produces browser screenshots per project.
6. Desktop chapter controls occupy a separate strip above the wheel. The wheel and transit timeline remain in document flow, preventing scroll overlap and intercepted clicks. Timeline stepping, range input, local date input, and aspect text have separate rows; the transit toggle is a native button.
7. Labels use 13–14px type and principal reading text uses 15–16px with explicit leading. `timeline-layout.spec.ts` verifies active transit controls and separation while scrolling at 1440×720, 1920×1080, 1280×720, and 390×844.

Commands: `npm run build`, `npm test`, and `npm run e2e -- e2e/app-shell.spec.ts e2e/threshold.spec.ts e2e/wheel-hover.spec.ts e2e/celestial-index.spec.ts e2e/timeline-layout.spec.ts` from `frontend/`.

Validation: production build and 216 unit tests passed. After the final spacing adjustments, 10 browser checks passed (four viewport regressions, two wheel hover checks, and four chapter/navigation checks). The remaining shell check expects free-tier status but the running local service returns Supporter; account configuration was left unchanged. Earlier Celestial Index and mobile checks passed. Safari/Firefox, APK builds, and performance traces require separate validation.

Rollback: restore the previous `TransitSlider.tsx`, remove the new stylesheet import and header component, and revert the associated test expectations to recover the legacy shell composition. Palette-only legacy edits and starfield accessibility improvements can remain independently.
