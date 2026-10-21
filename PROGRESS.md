# Progress

## Build phases
- [x] 1. Setup - Vite + TS + Phaser, folders, CLAUDE.md, ESLint, Vitest, Playwright, GitHub, Cloudflare deploy
- [x] 2. Drawing + physics prototype - stroke capture, RDP simplify, segment chains, nails, ink meter, undo/clear, Go, Paper Car, test level *(awaiting feel review)*
- [ ] 3. Breaking + game feel
- [ ] 4. Rough art pass
- [ ] 5. Campaign framework
- [ ] 6. Content: 60 levels
- [ ] 7. Endless + daily
- [ ] 8. Unlocks + garage
- [ ] 9. Online leaderboard
- [ ] 10. Polish + launch

## Acceptance criteria
Automated
- [ ] Unit tests: scoring, combo, star rules, unlock rules, seeded generation (seeded RNG done)
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
- Hosting on Cloudflare (a Worker at https://doodle-bridge.joshavard.workers.dev) instead of Vercel: the Cloudflare account is already connected to this workspace and is free. Pages direct upload was blocked by the sandbox proxy, so `scripts/deploy-worker.mjs` serves dist/ from a Worker. Each phase redeploys the same URL.
- Physics uses standalone matter-js (same engine Phaser bundles) stepped at a fixed 60 Hz, so the solver test, the game and future replay checks are identical and deterministic.
- Slow motion after Go is render-time only (the sim still takes fixed steps), so it does not affect determinism.
- Both stroke ends snap to a nail within 26 px (plan only required the start); more forgiving.
- Nails are a hinge plus a soft brace, so a stroke from one nail droops instead of swinging straight down.
- Retry keeps your drawing so you can tweak it; Clear wipes it.
- Short strokes (24 to 32 px) that cannot be cut into 16 to 24 px pieces use slightly longer pieces.
- Phaser 3.90 (latest v3) kept per the plan, although Phaser 4 is out.
- vitest 5 used (vitest 3 had open security advisories).

## Known gaps to revisit
- On very tall phones the 480 x 854 view letterboxes top and bottom; phase 4 HUD pass will extend the paper to fill the screen.
