# Katamari Theme: Implementation Plan

Spec: `docs/superpowers/specs/2026-10-02-katamari-theme-design.md`. I'm executing this inline myself (Brian approved "whatever you think is best").

## Tasks

1. **Core, test first.** Write `tests/katamari-core.test.js` covering every bullet in the spec's Testing section and run it to watch it fail. Then write `assets/katamari-core.js` (UMD) until `node --test tests/` passes. Commit.
2. **Theme script refactor.** In `index.html`, build the `themes` map and change `setTheme` to persist only persistent themes, call `onEnter`/`onLeave`, and read `storedTheme()` at exit. Add the Katamari pill and the deferred scripts. With a stub `Katamari`, check by hand that the three existing themes still work. Commit.
3. **DOM layer.** Build `assets/katamari.js` in this order, checking each step in a headless browser:
   1. collect: the walk, word split with exact restore, atoms and boxes, the rect grid;
   2. ball canvas, frame loop, input, camera;
   3. pickup: clone, sanitise, freeze styles, attach, project and render, clone cap;
   4. HUD, end card, reduced-motion Start button, exit paths (Escape, Back, Exit, another pill), `stop()` restore.

   Commit after each working slice.
4. **Skin.** Add to `assets/main.scss`: the `[data-theme="katamari"]` palette and background, `.kt-*` styles, the HUD and end card, and the print rules. Commit.
5. **Tuning.** Play it in a headed or screenshot loop. Tune `FIT`, `GAIN`, `HOLLOW`, the start radius and the speed so that a full roll-up takes about 2–4 minutes of real play. Make sure the first few seconds pick up words, and that the clone cap holds 60 fps.
6. **Verification.** Run a scratch Playwright script in /tmp, using the cached Chromium and an existing `playwright-core`, through the full browser checklist in the spec. Take desktop and mobile screenshots. Run `node --test`.
7. **Review and ship.** Run code review on the diff, fix anything it finds, then merge `idea/agent-3` into `master` and push. The site is GitHub Pages, so pushing deploys it.
