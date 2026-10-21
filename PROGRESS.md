# Progress

## Build phases
- [x] 1. Setup - Vite + TS + Phaser, folders, CLAUDE.md, ESLint, Vitest, Playwright, GitHub, Cloudflare deploy
- [x] 2. Drawing + physics prototype - stroke capture, RDP simplify, segment chains, nails, ink meter, undo/clear, Go, Paper Car, test level *(awaiting feel review)*
- [x] Vehicle art pass (requested after phase 2): all 6 vehicles drawn and driveable, then restyled to polished cartoon, see below
- [x] 3. Breaking + game feel - stress tint, snapping, debris, crash/win rules, hit-stop, shake, sounds, confetti, stars, boost *(awaiting feel review)*
- [ ] 4. Rough art pass
- [ ] 5. Campaign framework
- [ ] 6. Content: 60 levels
- [ ] 7. Endless + daily
- [ ] 8. Unlocks + garage
- [ ] 9. Online leaderboard
- [ ] 10. Polish + launch

## Acceptance criteria
Automated
- [ ] Unit tests: scoring, combo, star rules, unlock rules, seeded generation (seeded RNG, star rules, level score, break/crash/boost rules done)
- [ ] Solver test beats all 60 levels (runs on the test level today)
- [x] Playwright smoke at 390 x 844: game loads, a stroke is drawn, run reaches the flag (title and results screens to come)
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

## Known gaps to revisit
- On very tall phones the 480 x 854 view letterboxes top and bottom; phase 4 HUD pass will extend the paper to fill the screen.
