# Katamari Theme

Ticket: basmith7.github.io/T-1. Inspired by https://x.com/measure_plan/status/2106085652567654593 — a Katamari ball rolled across a live web page, picking up its elements as it grows.

## Goal

Add a fourth pill to the resume theme picker, **Katamari**. Choosing it drops a ball onto the resume that the visitor steers around; it rolls up the page's own elements — words first, then chips, headings, cards, and finally whole panels — growing as it goes. It is a toy easter egg: no timer, goals or win screen (that is a later "full game" step, see Future).

## Decisions (from brainstorm)

- **Scope:** toy (A). Full game (B) is deferred, but the core exposes the hook it needs.
- **Entry:** choosing the pill starts the game straight away.
- **Not remembered:** Katamari is never written to `localStorage['resume-theme']`. A reload shows the previously saved theme (or Professional).
- **Rendering:** DOM pickup with a faked 3D sphere. No dependencies, no canvas or WebGL.

## Architecture

### `assets/katamari-core.js` — pure logic, no DOM

UMD-style like `ask-brian-model.js` (`module.exports` in Node, `window.KatamariCore` in the browser). Contains:

- `createBall({x, y, r})` → state `{x, y, vx, vy, r, q}` where `q` is a unit quaternion for orientation.
- `steer(ball, target, dt)` — accelerate toward a target point (pointer) or along a key vector; capped speed that scales with radius; friction. Updates `q` by rolling: rotation axis ⟂ velocity in the screen plane, angle = distance / r.
- `canPickUp(ball, item)` — `item = {w, h}`; true when `max(w, h) <= 1.6 * ball.r`.
- `grow(ball, item)` — `r' = sqrt(r² + k·w·h/π)`, with `k` (≈0.35) tuned so the whole page takes about 2–4 minutes.
- `attachPoint(ball, contact)` — turns a screen-space contact direction into a sphere-local unit vector by applying `q⁻¹`, so the item stays put as the ball rolls.
- `project(ball, local)` — rotates the local point by `q` and returns `{x, y, z, scale}`, where `z < 0` means the point is behind the ball.
- `collides(ball, rect)` — circle–rectangle overlap test, plus a push-out vector used to treat too-big items as soft walls.
- A tiny emitter: `on('pickup', fn)` / `emit`, with payload `{item, r, count}`.

### `assets/katamari.js` — DOM layer, `window.Katamari = { start, stop, reset }`

- **`start()`:**
  - Split every non-blank text node into word `<span class="kt-w">` elements, except inside `a`, `button`, `.skill-list li` (taken whole) and `#ask-brian` (its script rewrites its own text with `innerHTML` and `textContent`, which would leave stray spans behind).
  - Collect pickables as cached page-coordinate rects and sort them by area.
  - Create the ball element and the HUD, bind input, and start the `requestAnimationFrame` loop.
- **Pickables, found by one generic walk** of `main.resume-shell`, not a per-section selector list, so markup edits don't silently drop items:
  - every element with a non-zero rect is a candidate; its size is its rect's longest side;
  - excluded: the theme picker, the HUD, the ball, and decorative `aria-hidden` layers;
  - inside `#ask-brian`, only direct block children are candidates, each taken whole;
  - a container becomes pickable once every candidate inside it is taken, or once it already fits the pickup rule — so the ball eats words, then the chip, then the card, then the panel.
- **Pickup:**
  1. `cloneNode(true)` the element.
  2. Add the class `kt-taken` (`visibility: hidden`) to the original, so the layout never reflows.
  3. Put the clone inside the ball element with absolute positioning, at its `attachPoint`.
  4. Rotate it so its long axis points outward from the centre, with a random ±25° jitter.
- **Render each frame:**
  - Project each stuck clone and set its `transform: translate3d(...) rotate(...) scale(...)`.
  - Set its `z-index` from `z`. Behind-the-ball clones get `opacity: .35` and sit under the ball's disc.
  - The ball's disc shows a candy-stripe `background-position` shifted by rotation, so it looks like it's rolling.
- **Performance cap:** after 150 stuck clones, the oldest are removed from the DOM and counted toward the disc's "packed" stripe density. Their originals stay hidden. That keeps per-frame work bounded.
- **Input:**
  - The ball accelerates toward the pointer while the mouse is over the page.
  - On touch, it steers toward a held finger, with `touch-action: none` on the play surface only while playing.
  - Arrow keys and WASD steer it, ignored while focus is in an input, textarea or select.
  - Escape exits (see Exiting).
- **Camera:** each frame, if the ball is within 25% of the viewport's top or bottom edge, `window.scrollBy` eases it back toward the middle. Ball x and y are clamped to the document.
- **HUD:** fixed top-right. It shows the size in cm (`2·r / 10`, one decimal), the item count, a **Reset** button and an **Exit ✕** button, always on screen so leaving never needs a scroll back to the picker. It uses `aria-live="polite"` and announces only at whole-cm milestones.
- **`stop()`:**
  - Cancel the frame loop, remove the ball, HUD and listeners.
  - Undo only what the game touched, so no node is replaced and every existing listener (ask-brian, theme pills) survives: unwrap the `.kt-w` spans back to text nodes, `normalize()` their parents, and remove `kt-taken` from every original.
- **`reset()`:** `stop()` then `start()`.
- **Exiting:** Exit ✕, Escape, browser Back, or picking another pill. All of them restore the page and return to the saved theme. Starting the game pushes one history entry (`#katamari`); `popstate` exits, and leaving by any other route calls `history.back()` only if that entry is still on top, so Back never leaves the site from inside the game.

### `index.html`

- Add `<button … data-theme-choice="katamari">Katamari</button>`.
- In the theme script, turn the `portraits` object into a `themes` map, one entry per theme with `portrait`, `persist` (default true) and optional `onEnter` / `onLeave`. `setTheme` reads the entry instead of branching on a name:
  - `katamari: { portrait: profile.jpg, persist: false, onEnter: Katamari.start, onLeave: Katamari.stop }`;
  - `setTheme` calls the old theme's `onLeave`, sets `data-theme`, writes localStorage only when `persist`, then calls the new theme's `onEnter`;
  - `Katamari.start(onExit)` takes a callback the game calls on Exit, Escape or Back, which runs `setTheme(savedTheme)`.
- Load `katamari-core.js` and `katamari.js` with `defer`.

### `assets/main.scss`

- `[data-theme="katamari"]` variables:
  - warm pastels on a deep-violet star field, made with a radial-gradient sparkle layer reusing the `.aurora` divs;
  - rounded, chunky headings;
  - panels stay readable.
- Ball (`.kt-ball`): a circle with a candy-stripe conic/linear gradient and an inner highlight.
- HUD (`.kt-hud`): a pill-shaped panel. Sized like the reference: a big "5.3 cm" and a smaller "12 things".
- Print: `.kt-ball, .kt-hud { display: none }`, and `.kt-taken { visibility: visible }`, so a mid-game print shows the whole resume.

## Reduced motion

With `prefers-reduced-motion: reduce`, choosing Katamari applies the skin and shows a **Start rolling** button in the HUD instead of auto-starting.

## Error handling

- If `KatamariCore` failed to load, the pill applies only the skin and logs one warning.
- Rects are re-measured on `resize`, debounced. Pickables measured as 0×0 (for example, hidden on mobile) are skipped.

## Future (B, not in this build)

The `pickup` event (`{item, r, count}`) is the only hook B needs:

- a timer module listening for start and stop;
- goal sizes checked in a `pickup` listener;
- "SIZE UP!" popups at radius thresholds;
- a "FEVER" multiplier on quick successive pickups;
- an end card.

No changes to core physics should be needed.

## Testing

- `tests/katamari-core.test.js` (node:test):
  - `canPickUp` at the 1.6r boundary;
  - `grow` is monotonic, and area is conserved with the k factor;
  - `steer` moves toward the target and caps speed;
  - the quaternion stays unit length after 1,000 steps;
  - `attachPoint` → `project` round trip: a point attached at the front-right still projects front-right at zero further rotation, and goes behind (`z < 0`) after rolling half a circumference;
  - `collides` handles inside, edge and corner cases;
  - the emitter fires with its payload.
- Browser check (headless, via the dev server):
  - pick Katamari and drive the ball with synthetic key events for about 5 s;
  - assert that the count is above 0 and the radius grew;
  - press Reset and assert `main.resume-shell` text content and the count of visible elements match the pre-game values;
  - assert `localStorage['resume-theme']` was not set to `katamari`;
  - after reset, assert ask-brian's "Train it a little" still updates the epoch counter;
  - start again and press Escape, then start again and go Back: each one restores the saved theme, the URL stays on the site, and no `.kt-ball` remains;
  - assert no console errors;
  - take a screenshot mid-game.
- Print emulation mid-game: `.kt-ball` is not displayed and all role headings are visible.

## If we started over
*Accretion review, Fable, 2026-10-02. Advisory.*

Clean design: Katamari is a game mode with its own lifecycle and a pure physics core, finding pickables generically. The theme picker stays a skin selector.

- A Katamari branch inside `setTheme` plus a "don't persist" special case: future themes would trip over it. **Fixed now:** the themes map with `persist`, `onEnter` and `onLeave`.
- A hand-written pickable selector list shaped to today's markup: markup edits silently drop items. **Fixed now:** one generic walk plus an exclude list.
- The 150-clone cap means taken items have two representations (live clones and "packed" stripes): **accept**, because it's bounded and fits a toy.
- Rejected: "the `#ask-brian` word-split exclusion is unnecessary". Its answer and caption elements are rewritten with `innerHTML` mid-game, so the exclusion stays.

Verdict: acceptable accretion.

## Expectations
*Jakob's Law review, Fable, 2026-10-02. Advisory.*

- Escape restarted the game and there was no exit: users expect Escape and ✕ to leave a game overlay. **Departed without a reason. Fixed:** Escape exits, and the HUD has Exit ✕.
- Back: on Android, users expect Back to close a full-screen toy rather than leave the site. **Fixed:** one history entry, and `popstate` exits.
- A finger steers instead of scrolling: **for a good reason**, since that is the game. The HUD stays fixed and one tap away.
- Links and buttons get rolled up: **for a good reason**, since that's the joke. They work until they're taken, and Reset brings them back.
- Katamari isn't remembered across reloads, unlike the other pills: **for a good reason**. A reload shouldn't drop a recruiter into a game.

## Non-goals

- No timer, goals, sound or score saving.
- No 3D library or html2canvas.
- Katamari is not included in the PDF or the print layout.
