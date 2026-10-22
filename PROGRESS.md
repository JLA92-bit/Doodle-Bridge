# Progress

## Build phases
- [x] 1. Setup - Vite + TS + Phaser, folders, CLAUDE.md, ESLint, Vitest, Playwright, GitHub, Cloudflare deploy
- [x] 2. Drawing + physics prototype - stroke capture, RDP simplify, segment chains, nails, ink meter, undo/clear, Go, Paper Car, test level *(awaiting feel review)*
- [x] Vehicle art pass (requested after phase 2): all 6 vehicles drawn and driveable, then restyled to polished cartoon, see below
- [x] 3. Breaking + game feel - stress tint, snapping, debris, crash/win rules, hit-stop, shake, sounds, confetti, stars, boost *(awaiting feel review)*
- [x] 4. Rough art pass - roughjs terrain, flag, nails, buttons, ink bar, stars and pause panel with 12 fps boil; pencil-textured lines; page on a desk filling any screen; pause button and run timer *(awaiting look review)*
- [x] 5. Campaign framework - level registry, save + unlock rules, title, notebook select, level select, results panel, pause Levels, dev level editor, solver test, level-stats script *(awaiting review)*
- [x] 6. Content: 60 levels - all 6 notebooks written and solver-verified; platforms, wind, erasers, darkness, checkpoints, time limits, wide levels with panning, 6 paper styles *(awaiting play review)*
- [ ] 7. Endless + daily
- [ ] 8. Unlocks + garage
- [ ] 9. Online leaderboard
- [ ] 10. Polish + launch

## Acceptance criteria
Automated
- [ ] Unit tests: scoring, combo, star rules, unlock rules, seeded generation (seeded RNG, star rules, level score, break/crash/boost rules done)
- [x] Solver test beats all 60 levels (each also fails with no drawing; every solution also wins in at least 5 of 8 jittered replays)
- [x] Playwright smoke at 390 x 844: title loads, a level starts, a stroke can be drawn, results screen appears (and progress saves)
- [ ] Bundle under 3 MB (now ~1.4 MB raw, ~370 KB gzip); Lighthouse PWA + performance 90+
- [ ] Edge function rejects impossible score, accepts valid one
- [ ] Plays offline

Feel (Josh, on phone)
- [ ] Drawing feels responsive
- [ ] A new player clears level 1 unaided
- [ ] Crashes make you smile
- [ ] Endless makes you want one more go
- [ ] Smooth frame rate

## Decisions log
- Hosting on Cloudflare (a Worker at https://doodle-bridge.joshmakesgames.app) instead of Vercel: the Cloudflare account is already connected to this workspace and is free. Pages direct upload was blocked by the sandbox proxy, so `scripts/deploy-worker.mjs` serves dist/ from a Worker. Each phase redeploys the same URL.
- Physics uses standalone matter-js (same engine Phaser bundles) stepped at a fixed 60 Hz, so the solver test, the game and future replay checks are identical and deterministic.
- Slow motion after Go is render-time only (the sim still takes fixed steps), so it does not affect determinism.
- Both stroke ends snap to a nail within 26 px (plan only required the start); more forgiving.
- Nails are a hinge plus a soft brace, so a stroke from one nail droops instead of swinging straight down.
- Retry keeps your drawing so you can tweak it; Clear wipes it.
- Short strokes (24 to 32 px) that cannot be cut into 16 to 24 px pieces use slightly longer pieces.
- Phaser 3.90 (latest v3) kept per the plan, although Phaser 4 is out.
- vitest 5 used (vitest 3 had open security advisories).

- Vehicle art pass: all six vehicles from the plan are drawn (hand-drawn wobbly outlines that "boil" at 12 fps,
  pencil hatching, googly eyes that blink, look ahead and lag behind bumps, moods: scared when falling, happy at the
  flag, dizzy on a crash), with squash on landing, exhaust puffs, wheel dust and a rocket flame. Their physics are in
  `src/config/vehicles.ts` now so they can be previewed with `?vehicle=skateboard` (also schoolBus, monsterTruck,
  unicycle, rocketCar); unlocking them stays in phase 8. A test checks every vehicle crosses the test bridge and
  falls without one.
- Vehicle restyle (Josh: "semi more realistic / cartoony", no faces, vehicles only): each vehicle is painted once
  with Canvas 2D gradients (glossy paint, chrome, glass with reflections, wheel arches cut out so wheels show
  through, detailed rims) into a high resolution texture that follows the physics. Live parts are drawn per frame:
  skateboard trucks, monster truck shocks, the unicycle rider's legs and arms (helmet with dark visor, no face) and
  the rocket flame. The engine rumbles while idling. PLAN.md updated.
- Level `start` is now the ground point under the vehicle, so any vehicle spawns resting on its wheels (taller
  vehicles were spawning inside the ground).
- Unicycle balance is a weak self-righting nudge: it wobbles about 20 degrees but stays playable.

- Phase 3 decisions:
  - Stress = how far a joint's two springs are pulled apart, as a fraction of segment length. Snap limits
    (pencil 0.13, crayon/marker 0.2, golden 0.32) were set from measurements: a sensible pencil bridge holds for every
    vehicle on the test gap; wide gaps under heavy vehicles and big drops snap it.
  - Nails never snap (forgiving); only joints between segments do.
  - Stall = no forward progress for 4 s (rocking in a dip counts as stuck), not just low speed.
  - Flipped uses a per-vehicle tilt limit (about 110 degrees; the unicycle 72 degrees, since it lies on its side).
  - Boost cooldown counts from the start of the boost (1.5 s between taps), the more forgiving reading.
  - While running, Undo/Clear are replaced by a small Retry (instant restart) and Go by a round Boost button with
    a cooldown ring. Tap anywhere else also boosts.
  - Sounds are synthesised live with Web Audio (pencil scratch, creak that rises with stress, snap, boost whoosh,
    landing thud, crash with slide whistle, star dings, win jingle), pitch varied by up to 5%. No audio files to
    download and they work offline; this replaces the plan's jsfxr samples with the same cartoon style.
  - Results for now: "Nice!" with 3 stars (complete, ink, time) and the targets. The full results screen comes in phase 5.
  - Settings (sound, haptics, reduced motion) have defaults until the settings screen in phase 10; reduced motion
    follows the phone's system setting and turns off screen shake.

- Phase 4 decisions:
  - The game is a 480 x 854 notebook page lying on a wooden desk. The canvas expands to fill any screen (Phaser
    EXPAND) and the camera keeps the page centred, so there are no plain bars on tall or wide screens. Falling off
    the page bottom is the "fell" crash.
  - Boil: each rough drawing is painted in 3 versions (different roughjs seeds) and flipped at 12 fps. Cheap on phones;
    frozen on frame 1 with reduced motion. Drawn lines wobble in step with a seeded sketch pass.
  - Desk is a baked repeating tile and the page shadow is thin edge strips, to keep overdraw low.
  - HUD per plan: ink bar left, level name and run timer top centre, pause top right, undo/clear (or retry while
    running) bottom left, Go/Boost bottom right. Pause offers Resume and Restart (Levels comes with phase 5).
  - Browser tests run at 1x pixel density to keep the software renderer fast; `window.__pageToClient` converts page
    coordinates to screen coordinates for tests.

- Phase 5 decisions:
  - Levels live in `src/levels/nbN-MM.json` and are picked up automatically. The id must match notebook and index
    (checked by the solver test). Levels gained an optional one-line `tip` shown before the first stroke.
  - Unlocks: notebooks open by total stars (10, 25, 45, 70, 100). Inside a notebook, levels open one after another;
    the optional challenge levels 8 and 9 can be skipped because the boss (10) opens once level 7 is done.
  - Stars are kept once earned (best of each), along with best score, best time and least ink. Failed attempts are
    saved too, so the hint ghost line still appears after 3 fails if you leave and come back.
  - Results are a panel over the level (stars, ink and time against targets, score, best or "New best!") with
    Retry, Levels and Next, so retrying stays instant. Next pulses when the next level is open.
  - Levels not written yet show as dashed "soon" bubbles. Daily challenge shows a "coming soon" card until phase 7.
  - Saves use localStorage, falling back to memory when storage is blocked (private browsing).
  - Dev tools: `?editor=1` opens the level editor (ground blocks, ramps, nails, start, flag, solution stroke, test
    in the real game, export JSON; `&level=nb1-02` edits an existing level). `?play=nb1-02` jumps into a level.
    `npx tsx scripts/level-stats.ts` plays every solution and suggests star targets.

- Phase 6 decisions and findings:
  - Built by parallel agents against a fixed contract (level format + Simulation API), then integrated: one for
    simulation mechanics, one for rendering/HUD, one per notebook of levels.
  - Moving platforms are sine-eased kinematic bodies; their nails carry pinned lines. Lines are ropes: a platform
    nail moving more than ~30-40 px away from the other end snaps the line, so platforms are used as lifts,
    bobbing islands and anchors with small travel, not ferries (the car out-runs them).
  - Wind is an acceleration in px per step squared (mass independent); 0.03-0.08 is the useful range.
  - Erasers remove any segment whose centre enters them, every step after Go; "floating" nails in the air are used
    to hold lines up over erasers because a pinned line cannot hold an arch.
  - Checkpoint retries restart the clock and platform timing from zero; levels were checked from the checkpoint.
  - The car cannot climb drawn uphill lines (they sag), so climbs are terrain; heavy vehicles mostly fail by sagging
    and stalling on long spans rather than snapping. Pencil may be made weaker later if snapping should feature more.
  - Notebook 2 levels all need a boost; ink there is small (80-300) because jumps, not bridges, are the puzzle.
  - Vitest's fs module cache kept stale import.meta.glob results, silently skipping new level files; disabled.
  - Rendering: a second static UI camera keeps the HUD fixed while the world scrolls; darkness is one low-res canvas
    veil with baked light gradients; paper styles are baked per 480 px segment. Cost is about 10% frame rate.
  - Night paper switches HUD text and outlines to pale colours.

## Known gaps to revisit
- Two-finger pan and the eraser crumb effect were not exercised in automated tests (single-pointer browser); check on a phone.
- Frame rate in the sandbox's software-rendered test browser is low (about 10 fps at 2x); this does not reflect phones.
  The phase 10 performance pass checks a real mid-range phone.
