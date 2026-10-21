# Doodle Bridge - rules for Claude Code

Read PLAN.md (the design source of truth) and PROGRESS.md (where we are) at the start of every session.

## Working rules
- Work one phase at a time; do not start the next phase until the current one meets its "Done when".
- Run `npm run lint`, `npm test` and `npm run build` before every commit (`npm run test:e2e` when gameplay or UI changes).
- Push after each phase and deploy (`npm run deploy`, a Cloudflare Worker at https://doodle-bridge.joshavard.workers.dev); post the link at the end of the phase. In the cloud sandbox run it with CLOUDFLARE_ACCOUNT_ID set, NODE_USE_ENV_PROXY=1 and NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt.
- Keep all tuning numbers in /src/config.
- When unsure of a design detail, choose the option that is more forgiving for new players and note it in PROGRESS.md rather than stopping to ask.
- Never use paid assets or services beyond the free tiers.
- If feedback changes the design, update PLAN.md so it stays the source of truth.
- Never use the em dash (long dash) character in docs, code comments or UI text; use a plain hyphen "-".

## Key decisions
- Mobile web game, portrait, installable PWA. TypeScript (strict), Phaser 3, Vite, Vitest + Playwright.
- Physics: standalone `matter-js`, stepped at a fixed 60 Hz by `src/physics/Simulation.ts`. Phaser only renders.
  The same Simulation runs headless in the solver test, so tests and the game behave identically.
- Logical resolution 480 x 854. The canvas renders at up to 2x (`src/render/scale.ts`) and cameras zoom to match.
- Levels are JSON in `src/levels` (format: `src/game/Level.ts`). Terrain pieces must be convex.
  Every level must include a solution stroke; `tests/levels.solver.test.ts` replays it.
- All art is drawn in code. Fonts (Patrick Hand, Gloria Hallelujah, OFL) are bundled in `public/fonts`.
- Hosting: Cloudflare Worker `doodle-bridge` serving dist/ from embedded modules (`scripts/deploy-worker.mjs`). Replaces Vercel from the plan; Pages direct upload is blocked by the sandbox proxy.

## Layout
- `src/config` tuning numbers - `src/physics` StrokeBuilder, BridgeChain, Vehicle, Simulation
- `src/render` paper, buttons, scale - `src/scenes` Phaser scenes - `src/game` level, scoring, save
- `src/endless` seeded generation - `src/net` leaderboard - `supabase/` backend
