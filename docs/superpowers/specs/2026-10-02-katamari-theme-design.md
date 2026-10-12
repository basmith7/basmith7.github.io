# Katamari Theme

Ticket: basmith7.github.io/T-1. Inspired by https://x.com/measure_plan/status/2106085652567654593 (a Katamari ball rolled across a live web page) and by Katamari Hack (kathack.com, Alex Leone, David Nufer and David Truong, 2011). Katamari Hack has no licence, so none of its code is copied. We reimplement the technique from scratch: clone the element, hide the original, project the clone around the ball. We credit it in a code comment.

## Goal

Add a fourth pill to the resume theme picker, **Katamari**. Choosing it drops a polka-dot ball onto the resume. Press and hold (mouse or finger), or use the arrow keys or WASD, to roll it. It picks up the page's own elements that fit (words first, then chips, links, headings, cards and finally whole panels), and it grows as it goes. Rolling up the whole résumé shows an end card. It is a toy easter egg: no timer or goals yet (see Future).

## Decisions

- **Scope:** toy, plus an end card. Timer, goals and popups are deferred. The core's `pickup` event is the hook for them.
- **Entry:** choosing the pill starts straight away. With reduced motion, a **Start rolling** button appears instead.
- **Not remembered:** Katamari is never saved as the theme. Exiting returns to the theme saved in localStorage, read at exit time.
- **Rendering:** clone the DOM element onto a ball that is really 3D. Each stuck item keeps a 3D unit vector that gets a small rotation every frame, so turning looks right, not just rolling straight. The ball body is a `<canvas>` with shading and dots that move with the rotation. No dependencies.
- **The ball rolls over everything.** Nothing is a wall. An item sticks when it touches the ball and its volume fits.
- **Brian approved** building this however the agent thinks best (2026-10-02).

## Architecture

### `assets/katamari-core.js`: pure logic, no DOM

UMD like `ask-brian-model.js`: `module.exports` in Node, `window.KatamariCore` in the browser.

- `itemVolume(w, h, hollow)` returns `w·h·min(w,h)`, multiplied by `HOLLOW` (0.15) for an emptied box. Long thin things are cheap, so a long heading sticks early, like the planks in the clip.
- `ballVolume(r)` returns `4/3·π·r³`. `radiusFor(vol)` is the inverse.
- `canPickUp(ball, vol)`: `vol <= ballVolume(ball.r) · FIT` (FIT ≈ 0.5).
- `grow(ball, vol)`: adds `vol · GAIN` to the ball's volume and recomputes `r`.
- `createBall({x, y, r})` → `{x, y, vx, vy, r}`.
- `step(ball, input, dt, bounds)`:
  - `input` is `{target:{x,y}} | {dir:{x,y}} | null`;
  - accelerates toward the target or along `dir`, with the top speed scaling with `√r`;
  - applies exponential friction and bounces off `bounds`;
  - returns the roll rotation for this step as `{axis:[x,y,0], angle}`. The angle is `distance / r`, and the axis lies in the screen plane, at right angles to the motion, so the ball's top (z toward the viewer) moves in the direction of travel.
- `rotate(v, axis, angle)`: Rodrigues rotation of a 3-vector.
- `attach(ball, contactX, contactY)`: a unit vector from the ball's centre to the contact point, in the screen plane (z = 0), so the item sits on the ball's silhouette when it's picked up.
- `project(ball, v, drawR)` → `{x, y, z, front}` in screen offsets from the centre.
- `circleRect(cx, cy, r, rect)`: an overlap test.
- `splitWords(text)` → alternating word and whitespace tokens whose concatenation equals `text` exactly.
- `createEmitter()` → `{on, emit}`.

### `assets/katamari.js`: DOM layer, `window.Katamari = { start, stop, running }`

**Collecting pickables** (`start`): one generic walk of `main.resume-shell`.
- **Skipped:** the theme picker, `script`, `style`, `template`, `[hidden]`, and anything with a 0×0 rect. Decorative `aria-hidden` separators inside the résumé (`//`, `·`) are visible, so they stay pickable.
- **Atoms** are taken whole and not descended into: `a`, `button`, `img`, `svg`, `input`, `textarea`, `select`, `.skill-list li`, `strong` in the impact strip, and every direct child of `#ask-brian`. The demo rewrites its own text, so its words are never split. Its network SVG is cloned shallow, as an empty box, because a deep clone would carry about 2,700 lines.
- **Words:** every other non-blank text node is split with `splitWords` into `<kt-w>` elements plus whitespace text nodes. `kt-w` is an unstyled custom tag that is inline by default, so rules like `.impact-strip span` don't match it. Each split is recorded as `{parent, original, inserted[]}` for an exact restore.
- **Boxes:** elements with a visible background, border or shadow (panels, cards, impact articles, the hero, roles with their left rule). A box becomes pickable only once every pickable inside it is taken. It then counts as hollow, and its clone is shallow: an empty card flying around the ball. Plain wrappers with no visual box are never picked up; they just end up empty.
- **Rects** are cached in page coordinates in a uniform grid (cells of 128 px) for fast overlap queries. A debounced `ResizeObserver` on `main.resume-shell` re-measures them, since ask-brian can change height.

**Pickup:**
1. Clone the element: deep for atoms and words, shallow for boxes.
2. Sanitise the clone: strip `id`, `for`, `name`, `href`, `onclick`, `tabindex` and `kt-taken` throughout.
3. Freeze its look by copying a whitelist of computed styles from the original onto the clone: font, colour, letter-spacing, text-transform, text-shadow, line-height, white-space, background, border, border-radius and padding. Set `width` and `height` from the rect, with `box-sizing: border-box`. Drop `backdrop-filter`, and cap the box-shadow.
4. Add `kt-taken` (`visibility: hidden`) to the original. The layout never reflows.
5. Attach the clone. Its 3D vector comes from `attach()`. Its tangent vector is the item's long axis, a random tilt of ±30° from the circle's tangent, so long items stick out at angles like in the clip.
6. Grow the ball, emit `pickup` `{label, vol, r, count}`, and update the HUD with the last item's label.

**Every frame** (`requestAnimationFrame`, `dt` clamped to 50 ms):
1. Step the physics, then rotate every attached vector and tangent by the roll rotation, and renormalise every 60 frames.
2. Draw the ball canvas: a shaded sphere plus about 40 dots spread evenly over the sphere (a Fibonacci layout), rotated the same way and drawn only on the front half, as ellipses foreshortened by `z`.
3. Place each clone with `translate(...) rotate(...) scale(...)`, built from the projected position, the projected tangent angle and a foreshortening of `0.55 + 0.45·|t_xy|`. Its `z-index` goes above the canvas when `z > 0` and below it otherwise. Clones fully hidden behind the disc get `display: none`.
4. Query the grid around the ball, and pick up every overlapping pickable that fits.
5. Move the camera: when the ball is within 30% of the viewport's top or bottom edge, `scrollBy` eases toward it.

- **Drawn size:** once `r` exceeds 38% of the viewport's shorter side, everything on the ball is drawn at scale `cap / r`, so the camera "zooms out". The cm readout keeps the true size, and pickup overlap uses the drawn radius.
- **Clone cap:** at most 160 clones are kept. Beyond that, the ones buried longest (oldest, at the back) are removed. The ball body is the record that they were taken.

**Input:**
- **Pointer:** `pointerdown` on the page (not on the HUD) starts rolling toward the pointer, `pointermove` updates the target, and `pointerup` or `pointercancel` stops it.
- **Click capture:** while running, a click on `main` is cancelled, so the page is a playfield and no link navigates.
- **Keys:** the arrows and WASD steer, with `preventDefault`, and Escape exits.
- **While playing,** the body gets `touch-action: none` and `user-select: none`.

**HUD** (`.kt-hud`, fixed top-right, above the ball):
- the size in cm (diameter / 10, one decimal);
- "N things";
- the last thing picked up;
- **Reset** and **Exit ✕** buttons.

It uses `aria-live="polite"` on a hidden status line, updated only at each new whole cm. When nothing pickable remains, an end card appears with "You rolled up the whole résumé", the final size, Brian's email link and Play again.

**The ball element** is `inert` and `aria-hidden`.

**`stop()`:**
1. Clear `running` first, then cancel the frame loop and remove the ball, HUD and listeners.
2. Undo the word splits exactly: put `original` back and remove `inserted`.
3. Remove `kt-taken` everywhere.
4. Remove the history entry if it's still on top.

Nothing else in the DOM is ever replaced, so ask-brian's and the theme pills' listeners survive.

**Exiting:** Exit ✕, Escape, Back, or picking another pill.
- `start` pushes a history state (`{katamari: true}`, same URL), and `popstate` while running exits.
- A non-Back exit calls `history.back()` only when `history.state?.katamari`. Its trailing `popstate` arrives with `running` already false, so it does nothing.

### `index.html`

- Add the pill and the two scripts with `defer`.
- Turn `portraits` into a `themes` map, with each entry `{portrait, persist = true, onEnter, onLeave}`.
- The Katamari entry looks the global up lazily, because the inline script runs before deferred scripts load: `onEnter: () => window.Katamari ? Katamari.start({ onExit }) : console.warn(...)` and `onLeave: () => window.Katamari?.stop()`.
- `onExit` runs `setTheme(storedTheme())`, where `storedTheme()` reads localStorage and falls back to `professional` when the value is missing or not persistent.
- `setTheme` runs the old theme's `onLeave`, sets `data-theme` and the portrait, saves the theme if it's persistent, then runs the new theme's `onEnter`.

### `assets/main.scss`

- **Katamari skin:** a deep-violet night sky, star sparkles from the `.aurora` layers, warm pastel accents (pink, lemon, mint, sky), and chunky rounded headings. Panels are cream cards with dark text: readable, and pleasing to roll up.
- `.kt-ball`, `.kt-canvas` and `.kt-clone` (absolute, `pointer-events: none`, `transform-origin: center`, `will-change: transform`).
- `.kt-hud` and `.kt-end`, in a Katamari-ish style: rounded, bold, a rainbow edge.
- `kt-w { display: inline }`, and `.kt-taken { visibility: hidden }`.
- **Print:** hide `.kt-ball`, `.kt-hud` and `.kt-end`, and show `.kt-taken` again (`visibility: visible`).

## Error handling

- The game script is missing → the pill applies the skin only and logs one warning.
- A clone with an unusual style still renders. Losing nested contextual styling is accepted.

## Future (B)

A timer, goal sizes, "SIZE UP!" at radius thresholds and a "FEVER" streak can all hang off `pickup` and `start`/`stop`. The physics doesn't change.

## Testing

- `tests/katamari-core.test.js` (`node --test`):
  - the volume functions are inverses;
  - `canPickUp` at the boundary;
  - `grow` is monotonic and adds the expected volume;
  - `step` accelerates toward the target, caps speed, applies friction with no input, and bounces at the bounds;
  - the roll axis makes the top move with the motion (rotating `(0,0,1)` gives a positive x component when moving +x);
  - `rotate` preserves length;
  - `attach` → `project` keeps the contact direction;
  - `circleRect` covers inside, edge, corner and miss;
  - `splitWords` round-trips text exactly and handles leading and trailing whitespace;
  - the emitter fires.
- A browser check with headless Chromium (Playwright, run from a scratch script outside the repo, so no dependency is added) against `scripts/dev-server.py`:
  - pick Katamari and assert the impact strip's box hasn't changed (no reflow);
  - hold a key for a few seconds, then assert the count is above 0 and the radius grew;
  - assert every `id` is unique mid-game, and that no element in `.kt-ball` can take focus;
  - Reset and Exit each restore `main.resume-shell` `innerHTML` (with `#ask-brian` removed) to the pre-game snapshot;
  - localStorage is never set to `katamari`;
  - AI Neon → Katamari → Exit gives AI Neon, and Katamari → Hackerman stays Hackerman;
  - Back exits and stays on the site;
  - "Train it a little" still works after exit;
  - print emulation mid-game shows the role headings and hides the ball;
  - force-picking everything shows the end card;
  - no console errors;
  - screenshots on desktop and mobile.

## Reviews

### Adversarial review
*Fable, 2026-10-02. Folded in above.*

- Fixed: the inline script referenced `Katamari` before it loaded; word `span`s reflowed the impact strip; Exit returned to the theme from page load; a trailing `popstate` overrode a pill the user had just picked; clones were focusable and clickable with duplicate IDs; clones lost their contextual look; panels could never be picked up; the double counting between containers and their children; stale rects; arrow keys scrolled the page; the 2,700-line SVG; the browser check had no runner.
- The "the sphere is the cost centre" finding is resolved differently: the per-item 3D vectors cost a few multiplications per frame. The DOM transform writes are the real cost, and they exist under any design. That cost is bounded by the 160-clone cap.

### Implementation review
*DeepSeek, 2026-10-02 (Fable timed out twice on the diff). Folded in.*

- **Fixed:**
  - with reduced motion, clicks and touch scrolling were blocked before Start;
  - `exit()` now always reaches `stop()`, even if `onExit` throws;
  - a stale `history.back()` could close a newly started game. A pending back is now tracked, and the new game's entry is pushed once it lands;
  - clones lost their frozen `display` after swinging around the back of the ball;
  - a second finger broke steering. Only the primary pointer steers now;
  - the end card is now `aria-modal`, traps Tab, and focus returns to the pill on exit;
  - iOS long-press callouts are now suppressed;
  - the end card scrolls on short screens;
  - Reset did something before Start.
- **Rejected:** "skip `aria-hidden`". The visible separators should roll up like everything else, so the spec was updated to match.

### If we started over
*Accretion review, Fable, 2026-10-02. Advisory.*

Clean design: Katamari is a game mode with its own lifecycle and a pure physics core, finding pickables generically. The theme picker stays a skin selector.

- **Fixed now:** the themes map with `persist`, `onEnter` and `onLeave` replaces a Katamari branch in `setTheme`, and a generic walk replaces a hand-kept selector list.
- **Accept:** the clone cap means taken items have two representations (live clones, and the ball body standing in for the rest). It's bounded and fits a toy.
- **Rejected:** "the `#ask-brian` exclusion is unnecessary". It rewrites its own text mid-game, so it stays.

Verdict: acceptable accretion.

### Expectations
*Jakob's Law review, Fable, 2026-10-02. Advisory.*

- **Fixed:** Escape and ✕ leave the game, and Back closes it instead of leaving the site.
- **For a good reason:** a finger or click steers instead of scrolling or following links. That's the game, and Exit is always on screen.
- **For a good reason:** Katamari isn't remembered across reloads.

## Non-goals

- No timer, goals, sound or score saving.
- No 3D library, html2canvas, or new npm dependencies.
- Katamari is not part of the PDF or the print layout.
