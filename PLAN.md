# Doodle Bridge - Build Plan

Oct 21, 2026 · @Josh

## Overview

Doodle Bridge is a mobile web game where you draw bridges with limited ink so a runaway vehicle can cross gaps. Lines sag, wobble and snap, so failures are funny and successes feel earned. It ships as an installable PWA with a handcrafted campaign, an endless high-score mode, a daily challenge and an online leaderboard.

**Locked design decisions**

| Area | Decision |
| --- | --- |
| Platform | Mobile web game, installable PWA, portrait orientation |
| Structure | 60-level campaign + endless mode + daily seeded challenge |
| Art style | Notebook doodle: lined paper, pencil and crayon lines, hand-drawn wobble. Vehicles are polished cartoon (no faces) |
| Physics feel | Wobbly and funny: lines bend, sag and snap; forgiving for new players |
| Draw timing | Campaign: draw, then press Go. Endless: draw live ahead of a moving vehicle |
| Vehicle | Auto-drives; tap anywhere (outside drawing) to boost |
| Leaderboard | Online, global + daily boards |
| Unlocks | Vehicles, pens (ink types), paper themes |

**Design pillars**

1. Learn in 5 seconds: draw a line, watch it work. No tutorial text walls.
2. Every failure is funny: crashes produce ragdoll, doodle sound effects and an instant retry.
3. Mastery is visible: ink used, time and style tricks all feed one score players can beat.
4. Restart in under 1 second, always.

## Tech stack

The game uses TypeScript, Phaser 3 with its built-in Matter.js physics, Vite for building and Supabase for the leaderboard. This combination is well documented, so Claude Code can build it with minimal guesswork.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) | Catches bugs early, easier for Claude Code to refactor |
| Engine | Phaser 3 | Mature 2D engine, touch input, scenes, audio, mobile scaling built in |
| Physics | Matter.js (via Phaser) | Soft constraints give the sag and wobble; constraints can be broken under stress |
| Build | Vite | Fast dev server, simple production build |
| PWA | vite-plugin-pwa | Offline play, home-screen install, app icon and splash |
| Backend | Supabase (free tier) | Postgres table + edge function for score submission, no server to maintain |
| Hosting | Vercel (free tier) | Auto-deploys from GitHub on every push |
| Tests | Vitest + Playwright | Unit tests for scoring and level logic, mobile-viewport smoke tests |
| Audio | Phaser built-in audio with small .ogg/.m4a files | Fewer dependencies |

**Performance targets:** 60 fps on a mid-range phone from 2021, under 3 MB initial download, first play within 3 seconds on 4G.

## Core mechanics and game feel

The player draws strokes with a finger; each stroke becomes a chain of physics segments joined by springy constraints that sag under weight and snap when overstretched. The vehicle drives itself, and a tap gives a short boost.

**Drawing**

- A stroke is sampled every 12 px and simplified (Ramer-Douglas-Peucker) into segments of 16 to 24 px.
- Each segment is a thin rectangle body; neighbours are joined by two Matter constraints (stiffness 0.6 to 0.9 depending on pen) for a slightly elastic feel.
- Strokes that start on an anchor point (nail icons on cliffs) are pinned there. Unanchored strokes fall, which is a lesson players learn in level 2.
- An ink bar shows remaining ink. Ink used = total stroke length.
- Undo button removes the last stroke and refunds its ink. Clear button resets all.
- Campaign: physics is frozen while drawing; press Go to start. Endless: physics runs live and the camera scrolls.
- Long levels (bosses, up to 3 screens wide): while drawing, pan with the arrows at the page edges or a two-finger drag; during the run the camera follows the vehicle. An overview strip shows start, checkpoint and flag.

**Breaking**

- Each constraint tracks its stretch every frame. If stretch exceeds the pen's break threshold for 6 frames in a row, the joint snaps with a pencil-snap sound and a little graphite puff.
- Broken pieces stay in the world as debris, which can still help or hinder.

**Vehicle**

- A body plus two wheel bodies on revolute joints with a motor at constant speed.
- Tap (anywhere not on the drawing area while running) = 0.6 s boost, 1.5 s cooldown shown as a ring around the button.
- Crash conditions: vehicle body touches the bottom of the screen, flips upside down for 1.5 s, or stalls for 4 s.
- Win condition: front wheel reaches the flag zone.

**Game feel (juice) checklist**

- Lines draw with a slight random wobble and pencil texture, rendered as a stroked path that follows the physics segments.
- Bridges creak when heavily loaded (pitch rises with stress); stressed segments tint from grey to red.
- Screen shake on snap (small) and crash (medium). Hit-stop of 80 ms on crash.
- Vehicle squash and stretch on landing; doodle dust on wheels.
- Crash = vehicle bursts into cartoon doodle pieces, "Oops!" scribble text, retry prompt within 0.8 s.
- Win = confetti made of paper scraps, star rating pops in one at a time with rising notes.
- Haptics via navigator.vibrate where supported (short pulse on snap, longer on crash), toggle in settings.

**Forgiving for new players**

- First 10 levels have generous ink and visible hint ghost lines after 3 fails.
- Physics slows to 50% for the first 0.5 s after Go so players can see what happens.
- Any completion counts; stars reward efficiency, so beginners progress while experts optimise.

## Campaign level structure

The campaign has 6 notebooks (worlds) of 10 levels each, 60 in total. Each notebook introduces one new idea, mixes it with old ones, and ends with a boss level.

| Notebook | Theme | New mechanic | Unlock reward |
| --- | --- | --- | --- |
| 1. Homework | Lined school paper | Draw, anchors, ink limit | Crayon pen |
| 2. Doodle Desert | Sand-coloured graph paper | Ramps and jumps, boost timing | Skateboard |
| 3. Rainy Margins | Wet ink smudges | Moving platforms, wind gusts | Marker pen |
| 4. Stick Mountain | Sketchbook | Heavy vehicles, multi-gap levels | Monster truck |
| 5. Night Notes | Dark paper, glow ink | Limited visibility, eraser zones that delete lines | Glow pen |
| 6. The Final Exam | Mixed paper scraps | Everything combined, timed levels | Rocket car + Golden pencil |

**Level design rules**

- Level 1 of every notebook teaches its mechanic with almost no way to fail.
- Levels 2 to 7 combine the new mechanic with older ones.
- Levels 8 and 9 are optional challenge levels with tight ink.
- Level 10 is a boss: a long multi-section course with a checkpoint.
- Every level has 3 star targets: complete, ink under target, time under target.
- Notebooks unlock with stars (10, 25, 45, 70, 100), not completion, so skilled players skip ahead.

**Level data format**

Levels are JSON files in /src/levels so Claude Code can generate and tweak them without touching code. Each defines terrain polygons, anchor points, hazards, moving objects, start and flag positions, ink limit, star targets and an optional hint stroke.

**Level generation workflow (hands-off)**

1. Claude Code writes a level editor scene (dev-only, opened with ?editor=1) for placing terrain and anchors.
2. Claude Code authors the 60 levels as JSON using the rules above.
3. An automated solver test drops a pre-recorded solution stroke into every level and confirms it can be beaten. Every level JSON must include a solution stroke for this test.

## Endless and daily modes

Endless mode is the high-score engine: the vehicle never stops, gaps keep coming, and you draw live just ahead of it. Daily mode is the same engine with a fixed seed so everyone plays the identical course.

**Endless mode**

- Unlocks after campaign level 5, so players know the basics first.
- Terrain is generated in chunks from a seeded random generator (e.g. mulberry32). Chunk types: simple gap, double gap, ramp gap, pit with anchor island, moving platform, wind zone, eraser zone.
- Ink refills slowly over time and in bursts from ink pots placed above gaps. Running out of ink is the main pressure.
- Difficulty ramps every 250 m: wider gaps, fewer anchors, faster vehicle (capped at 1.8x), new chunk types mixed in.
- One life. Death screen shows distance, score, best, and a Retry button that restarts in under 1 second.
- Ghost of your personal best run is shown as a faint pencil outline.

**Daily challenge**

- Seed = the date in UTC (e.g. 20261021), so the course is the same worldwide.
- 3 attempts per day count toward the daily board; unlimited practice runs after that.
- Share button copies a text result for messaging apps, e.g. "Doodle Bridge Daily #42 - 1,284 m - 3 snaps - best of 3" with a link.
- Daily streak counter with a small reward (paper theme) at 7 and 30 days.

## Scoring system

Score rewards distance first, then efficiency and style, so beginners always score something and experts chase multipliers.

**Endless and daily score**

```latex
\text{Score} = (\text{distance} \times 10 + \text{style bonuses}) \times \text{combo multiplier}
```

| Event | Points | Notes |
| --- | --- | --- |
| Distance | 10 per metre | Base score |
| Clean crossing | +100 | Gap crossed with no snapped joints |
| Thrifty crossing | +150 | Gap crossed using under 50% of the expected ink |
| Big air | +50 per 0.5 s airborne | Encourages ramps and boosts |
| Close call | +75 | Wheel touches a segment as it snaps |
| Ink pot | +25 | Collected mid-air |

- **Combo multiplier:** each consecutive clean crossing adds +0.1x, up to 3.0x. Any snap resets it to 1.0x.
- Score and multiplier show at the top centre with pop-up text for bonuses.

**Campaign scoring**

- Stars: 1 for completing, 1 for ink under target, 1 for time under target.
- Level score = 1,000 + unused ink percent x 20 + time bonus. Stored per level as a personal best.
- Total stars gate notebook unlocks; total campaign score is shown on the profile.

## Unlocks

Every unlock changes how the game plays, not just how it looks, except paper themes, which are cosmetic. All are earned through play; there are no purchases in version 1.

**Vehicles**

| Vehicle | Weight | Speed | Unlock |
| --- | --- | --- | --- |
| Paper Car | Medium | Medium | Default |
| Skateboard | Light | Fast, bouncy | Finish Notebook 2 |
| School Bus | Heavy, long | Slow | 1,000 m in endless |
| Monster Truck | Very heavy | Medium, big wheels | Finish Notebook 4 |
| Unicycle | Very light | Fast, tips easily | 30-day daily streak |
| Rocket Car | Medium | Very fast, longer boost | Finish Notebook 6 |

**Pens**

| Pen | Ink amount | Stiffness | Break strength | Unlock |
| --- | --- | --- | --- | --- |
| Pencil | 100% | Medium | Medium | Default |
| Crayon | 130% | Low (very wobbly) | High | Finish Notebook 1 |
| Marker | 70% | High | High | Finish Notebook 3 |
| Glow Pen | 100% | Medium | Medium, lines light the dark | Finish Notebook 5 |
| Golden Pencil | 100% | High | Very high | All 180 stars |

**Paper themes (cosmetic)**

Lined (default), graph paper, sticky note, napkin, blueprint, chalkboard, notebook margin doodles. Unlocked through daily streaks (7 and 30 days), endless distance milestones (500, 2,000, 5,000 m) and star totals.

**Leaderboard fairness:** the global endless board records which vehicle and pen were used, and players can filter by them.

## Art and audio

All art is generated in code (procedural vector drawing with a hand-drawn wobble), so no artist or asset purchases are needed and Claude Code can build everything itself.

**Visual rules**

- Background: paper texture generated with noise, faint blue lines, red margin line on the left.
- Lines: every shape is drawn with a "rough" stroke (small random offsets, double-stroked like sketching). The open-source library roughjs can render this onto a canvas texture.
- Palette: graphite grey for terrain, one accent colour per notebook, red for danger, yellow for ink pots and stars.
- Font: a free handwritten Google Font such as "Patrick Hand" for UI and "Gloria Hallelujah" for big titles, bundled locally for offline play.
- Vehicles: polished semi-realistic cartoon art (glossy shaded paint, chrome, glass reflections, detailed wheels), no faces, so they pop against the doodle world like toy cars on a sketchbook page. *(Changed Oct 21 2026 at Josh's request; replaces doodle vehicles with googly eyes.)*
- Doodle elements and UI animate at a 12 fps "boil" (the outline redraws slightly each frame) for a living-sketch look, while physics stays at 60 fps. Vehicles stay smooth.

**Screens**

1. Title: notebook cover, big Play button, daily challenge card, streak counter.
2. Notebook select: pages flip like a real book.
3. Level select: 10 doodled level bubbles per notebook with stars.
4. Game HUD: ink bar (left), score (top centre), boost button (bottom right), undo and clear (bottom left), pause (top right).
5. Results: stars, score, best, Retry, Next.
6. Leaderboard: tabs for Daily, Endless all-time, Endless this week.
7. Garage: choose vehicle, pen and paper theme.
8. Settings: sound, music, haptics, left-handed layout, reduced motion, player name.

**Audio**

- Sound effects made with mouth-sounds style samples generated using jsfxr (pencil scratch while drawing, creak, snap, boing, crash, ding for stars).
- Music: a light ukulele or xylophone loop. Use a CC0 track from a source such as freepd.com or opengameart.org, credited in the about screen.
- Pitch varies by ±5% each play so repeated sounds do not grate.

**Accessibility**

- Left-handed mode mirrors the HUD.
- Reduced motion turns off screen shake and boil animation.
- Colourblind-safe stress tint (also thickens stressed lines, not just colour).

## Online leaderboard

Scores go to Supabase through one edge function that checks them before saving. Players get an anonymous account automatically and only pick a display name, so there is no sign-up friction.

**Data**

| Table | Key columns |
| --- | --- |
| players | id (anonymous auth user), display\_name, created\_at |
| scores | id, player\_id, mode (endless / daily), daily\_seed, score, distance, vehicle, pen, replay (compressed JSON), game\_version, created\_at |

- Row Level Security: anyone can read scores; nobody can insert directly. Inserts only happen through the submit-score edge function.
- Database views: daily\_top\_100 (per seed), endless\_top\_100\_alltime, endless\_top\_100\_week.

**Anti-cheat (light, appropriate for a free game)**

- Edge function rejects scores above a plausible maximum for the distance (e.g. score / distance ratio over 30x).
- Rate limit: 1 submission per player per 20 seconds; 3 counted daily attempts enforced server-side.
- Each submission stores a compact replay (seed + list of strokes with timestamps + boost taps). Top 10 scores can be re-simulated later by a script if cheating becomes a problem.
- Display names pass a simple profanity filter.

**Offline behaviour**

- Scores are saved locally first and queued; the queue uploads when the connection returns.
- The game is fully playable offline; leaderboard screens show a friendly "offline" doodle.

## Project structure

One repository holds the game, levels, Supabase config and tests. Claude Code should create this layout in phase 1.

```
doodle-bridge/
  CLAUDE.md              # project rules + this plan, read by Claude Code every session
  PROGRESS.md            # checklist Claude Code updates after each phase
  src/
    main.ts              # Phaser config, scaling, scene list
    scenes/              # Boot, Title, NotebookSelect, LevelSelect, Game, Endless, Results, Leaderboard, Garage, Settings, Editor
    physics/             # StrokeBuilder, BridgeChain, BreakSystem, Vehicle
    render/              # RoughRenderer, PaperBackground, Effects (shake, confetti, puffs)
    game/                # Scoring, Combo, InkMeter, StarRules, Unlocks, Save
    endless/             # ChunkGenerator, SeededRandom, Difficulty
    net/                 # SupabaseClient, ScoreQueue, Leaderboard API
    levels/              # nb1-01.json ... nb6-10.json
    audio/               # sfx + music files
    config/              # vehicles.ts, pens.ts, themes.ts (all tuning numbers live here)
  supabase/
    migrations/          # tables, RLS, views
    functions/submit-score/
  tests/
    unit/                # scoring, seeded generator, unlock rules
    levels.solver.test.ts  # replays each level's solution stroke
    e2e/                 # Playwright mobile viewport smoke tests
  public/                # icons, manifest, fonts
```

**Tuning rule:** every gameplay number (stiffness, ink amounts, speeds, score values) lives in /src/config so balancing never requires hunting through code.

## Build phases for Claude Code

The build runs in 10 phases. Each phase ends with passing tests, a commit, a deploy preview and an updated PROGRESS.md, so you only need to play the preview link and say "next" or give feedback.

1. **Setup** - Vite + TypeScript + Phaser project, folder layout, CLAUDE.md, PROGRESS.md, ESLint, Vitest, GitHub repo, Vercel deploy. Done when: a blank paper screen loads on your phone from the Vercel link.
2. **Drawing + physics prototype** - stroke capture, simplification, segment chains, anchors, ink meter, undo/clear, Go button, Paper Car. One test level. Done when: you can draw a bridge and the car crosses or falls. *This is the most important phase: review the feel here.*
3. **Breaking + game feel** - stress, snapping, debris, crash and win conditions, screen shake, hit-stop, sounds, confetti, boost. Done when: crashes are funny and wins feel good.
4. **Rough art pass** - roughjs rendering, paper backgrounds, handwritten fonts, boil animation, HUD layout. Done when: it looks like a notebook doodle.
5. **Campaign framework** - level JSON loader, star rules, save system (localStorage), level and notebook select screens, results screen, dev level editor, solver test.
6. **Content: 60 levels** - author all levels notebook by notebook with solution strokes; add moving platforms, wind, eraser zones, darkness, heavy vehicles as each notebook needs them. Solver test must pass for all 60.
7. **Endless + daily** - seeded chunk generator, difficulty ramp, ink pots, combo scoring, ghost run, daily seed, share text, streaks.
8. **Unlocks + garage** - vehicles, pens, themes, unlock rules and notifications.
9. **Online leaderboard** - Supabase migrations, anonymous auth, submit-score edge function, offline queue, leaderboard screens, name entry and filter.
10. **Polish + launch** - PWA install and offline caching, icons and splash, settings and accessibility, performance pass on a mid-range phone, music, about/credits screen, final balance pass.

**Working rules for Claude Code (put these in CLAUDE.md)**

- Work one phase at a time; do not start the next phase until the current one meets its "done when".
- Run tests and a production build before every commit.
- Push to GitHub after each phase so Vercel creates a preview link; post the link at the end of the phase.
- Keep all tuning numbers in /src/config.
- When unsure of a design detail, choose the option that is more forgiving for new players and note it in PROGRESS.md rather than stopping to ask.
- Never use paid assets or services beyond the free tiers listed.

## Testing and acceptance criteria

The game is done when every item below is ticked. Claude Code checks the automated ones; you check the feel ones on your phone.

**Automated (Claude Code)**

- [ ] Unit tests pass for scoring, combo, star rules, unlock rules and seeded generation (same seed gives identical terrain)
- [ ] Solver test beats all 60 levels with their solution strokes
- [ ] Playwright smoke test at 390 x 844 viewport: title loads, a level starts, a stroke can be drawn, results screen appears
- [ ] Production bundle under 3 MB; Lighthouse PWA and performance scores 90+
- [ ] Edge function rejects an impossible score and accepts a valid one
- [ ] Game loads and plays with the network turned off

**Feel checks (you, about 10 minutes per phase)**

- [ ] Drawing feels responsive with no lag between finger and line
- [ ] A friend who has never played clears level 1 without help
- [ ] Crashes make you smile, not frustrated
- [ ] Endless mode makes you want "one more go"
- [ ] Runs at a smooth frame rate on your phone

## What you need to do

Your part is about 30 minutes of one-off setup, then playing preview links and giving feedback. All services below have free tiers that cover this game.

**One-off setup**

- [ ] Install Node.js (LTS) and Claude Code on your computer
- [ ] Create a free GitHub account and sign in with the GitHub CLI (Claude Code can walk you through `gh auth login`)
- [ ] Create a free Vercel account using GitHub sign-in
- [ ] Create a free Supabase project; copy the project URL, anon key and service role key into a `.env` file when Claude Code asks (never share the service role key publicly)
- [ ] Create an empty folder called doodle-bridge and open Claude Code in it

**During the build**

- [ ] After each phase, open the preview link on your phone and play for a few minutes
- [ ] Reply "next" or describe what feels off (e.g. "lines too bouncy", "car too fast")
- [ ] Pay extra attention after phase 2 and phase 7, which decide whether the game is fun

## Kickoff prompt for Claude Code

Export this doc as Markdown, save it as PLAN.md in your doodle-bridge folder, then paste the prompt below into Claude Code.

```
You are building Doodle Bridge, a mobile web game, from start to finish.
The full design and build plan is in PLAN.md. Read it completely first.

1. Create CLAUDE.md containing the "Working rules for Claude Code" and the
   key decisions from PLAN.md, and create PROGRESS.md as a checklist of the
   10 build phases and the acceptance criteria.
2. Work through the phases in order. Do not move on until the current
   phase meets its "Done when" condition and tests and the production
   build pass.
3. At the end of each phase: commit, push to GitHub, confirm the Vercel
   preview deployed, update PROGRESS.md, and give me the preview link plus
   a 3-line summary of what to try on my phone.
4. Make reasonable design decisions yourself, favouring what is more
   forgiving for new players, and log them in PROGRESS.md instead of
   asking me. Only stop to ask when you need an account, key or login
   from me.
5. If my feedback changes the design, update PLAN.md so it stays the
   source of truth.

Start with Phase 1 now. Walk me through any account setup step by step.
```

**Resuming later:** start a new Claude Code session in the same folder and say "Read CLAUDE.md, PLAN.md and PROGRESS.md, then continue from the next unfinished phase."
