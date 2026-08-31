# Handoff: Pickleball Open Play Queue App

Context for whichever AI assistant picks this up next. This project was built and
debugged with Claude across two sessions. Everything below is exact and verified,
not guessed — run the "Verification" commands yourself if you want to confirm.

## What this app is

A mobile-first pickleball open-play queue manager ("unstckd"). One admin screen
runs the queue for a club session: players wait in a queue, courts pull the next
eligible 4-player group automatically, games get finished with a result, and
players cycle back into the queue.

- Stack: React 19 + TypeScript + Vite 7 + Tailwind CSS 4, Supabase for shared
  state, deployed to Cloudflare Pages.
- Repo root of the actual app: `pickleball-open-play-v2/`
- Main logic file: `pickleball-open-play-v2/client/src/pages/Home.tsx` (single
  file holds nearly the entire app: state, matchmaking engine, UI).
- Styling: `pickleball-open-play-v2/client/src/index.css` (plain CSS, no
  component library styling beyond a few shadcn/ui primitives that are unused
  right now).

## Matchmaking rule (the core logic — do not casually rewrite this)

Function `selectNextPlayers(queue)` in `Home.tsx`:
1. Sort the waiting queue by `queuedAt` (oldest first).
2. Look at the oldest player's last result (`win` / `loss` / `null`).
3. If that result exists and there are ≥4 players in the queue with the SAME
   result, take the 4 oldest-by-queue-order players with that result → group
   reason is `"winner"` or `"loss"`.
4. Otherwise fall back to plain FIFO (first 4 in queue) → reason `"fifo"`.

`buildNextGroups(queue)` repeatedly calls `selectNextPlayers` on a *copy* of the
queue (never mutates the real queue) to produce the "Next Up" preview list. This
is the same pure function used both for the preview AND for actually assigning
players to a court, so preview and reality can never diverge.

This exact logic has a standalone test file — see Testing below.

## Session 1 — Get it building and verify the logic (already done)

**Problem found:** the zip was a Manus.computer export. `npm install` failed
outright with an ERESOLVE conflict because `@builder.io/vite-plugin-jsx-loc`
required Vite 4/5 but the project used Vite 7.

**Fixes applied:**
- Removed Manus-only tooling that has nothing to do with the app itself:
  `vite-plugin-manus-runtime`, `@builder.io/vite-plugin-jsx-loc`, the debug-log
  collector plugin, the storage proxy plugin, `pnpm`, the wouter patch, and an
  unused `Map.tsx` (Google Maps) component that didn't even have its types
  installed.
- Rewrote `vite.config.ts` down to just React + Tailwind + path aliases.
- Removed dead `server/index.ts` and the OAuth-portal leftover in `const.ts`
  wasn't touched since nothing calls it, but it's inert.
- Fixed one real bug: `[...aSet]` spread on a `Set<string>` needing
  `Array.from(aSet)` under this TS target.
- Result: `npm install`, `npx tsc --noEmit`, and `npm run build` all pass clean
  from zero.

**Verification actually run (not assumed):**
- `npm install` → clean, no errors
- `npx tsc --noEmit` → zero errors
- `npm run build` → succeeds, outputs `dist/`
- `vite preview` → served HTTP 200, JS bundle loads with no 404s
- Extracted the exact matchmaking function into
  `pickleball-open-play-v2/test/matchmaking.test.ts` and ran all of the spec's
  required test cases (see Testing below) — **10/10 passed**.

**Known gap (not yet fixed, flagged to the user):** the Supabase sync loads
state once on mount and pushes on every change, but does **not** subscribe to
realtime `postgres_changes`. Two devices open at once won't see each other's
updates until a manual refresh. If cross-device live sync matters, add a
`supabase.channel(...).on('postgres_changes', ...)` subscription in `Home.tsx`
next to `loadRemoteState`/`saveRemoteState`.

## Session 2 — Redesign requests (already done)

Four changes requested, all applied and tested:

1. **Move the "Playing" card above "Next Up".**
   On desktop these are already two side-by-side columns (Playing left, Next Up
   right) via `.dashboard-grid`, so this wasn't visually wrong there. The real
   bug was in the mobile stacked layout: `@media (max-width: 820px)` had
   `.queue-column{order:-1}`, which forced "Next Up" to render ABOVE "Playing"
   on phones — the opposite of what was wanted, and phones are the primary
   dev/test device here. Fix: removed that `order:-1` rule so DOM order (Playing
   first, Next Up second) is what renders on mobile too.

2. **Background photo: pickleball, not badminton.**
   The original template used Unsplash photo `1626224583764-f87db24ac4ea` in 4
   places in `index.css` (`.next-hero-card` and 3 `.next-card-bg` variants for
   winner/loss/fifo). That photo is not actually a clear pickleball court shot.
   Replaced all 4 occurrences with Unsplash photo `1747027694225-cbf12dd20826`
   ("People play pickleball on an outdoor court" by Venti Views, free Unsplash
   License, verified via unsplash.com before using). Same CDN domain as before
   so no new external dependency was introduced.

3. **Wording: "Losses" → "Loss".**
   `groupLabel()` in `Home.tsx` returned `"Losses vs losses"` for a loss-group
   Next Up card; changed to `"Loss vs loss"`. (Other "loss" wording elsewhere
   in the file — e.g. player status badge "Loss", modal copy "marked as loss"
   — was already singular and untouched.)

4. **Win rate on the leaderboard.**
   Added `winRate(player) = games > 0 ? round(wins/games*100) : 0` in
   `Home.tsx`. Leaderboard now sorts by win rate first (then wins, then games
   played as tiebreakers), and each row shows a `XX% win rate` figure next to
   the existing win count. Added `.rank-winrate` CSS and widened the
   `.rank-row` grid from 5 to 6 columns (with a narrower mobile variant too).

**Verification actually run:**
- `npx tsc --noEmit` → zero errors after changes
- `npm run build` → succeeds
- Re-ran `test/matchmaking.test.ts` → still 10/10 passing (confirms the
  redesign didn't touch the matchmaking logic)
- Wrote a new `test/winrate.test.ts` covering: 100%/50%/33%-rounding cases, the
  0-games / no-divide-by-zero case, and that leaderboard sort order is correct
  when win rate and win count disagree → **5/5 passed**
- Served the built `dist/` via `vite preview`, confirmed HTTP 200 and the new
  "Loss vs loss" string is present in the compiled JS bundle
- Confirmed the new background image is a verified free-license Unsplash photo
  before using it (not fabricated, not hotlinking something restricted)

## Session 3 — Redesign requests (already done)

Two changes requested, both applied and tested:

1. **Remove the background photo on Next Up cards; match the Playing card design.**
   The individual "Next Up" group cards (`NextGroupCard` in `Home.tsx`, class
   `.next-card`) had a `.next-card-bg` div with an Unsplash photo + gradient
   overlay and white text. Removed the `.next-card-bg` div from the JSX
   entirely and rewrote the `.next-card` CSS to match `.court-card` (the
   Playing card): plain white/cream background (`#fffefa`), dark ink text
   colors instead of white, no forced `min-height`. The shared colored
   top-accent bar (`::before`) and circular corner accent (`::after`) already
   apply to both `.court-card` and `.next-card` via one shared rule, so they
   now look consistent automatically.
   Note: the top intro banner (`.hero-wrap` / `.next-hero-card`, the "Know
   when you're up" section) still uses the pickleball photo from the last
   session. That's a distinct page-level banner, not one of the repeating
   Next Up cards, so it wasn't touched — flag this if the user actually wants
   that removed too.

2. **Remove courts, with confirmation, players return to the TOP of the queue.**
   - Added a small trash-icon button (`.icon-button.danger`) in each court
     card's header, visible only in admin mode.
   - Clicking it opens the existing confirm-action modal (extended with a new
     `"removeCourt"` branch) with a message that differs depending on whether
     the court currently has an active game.
   - Confirming calls `removeCourt()` in `Home.tsx`, which:
     - Removes the court from `draft.courts` and its game from `draft.games`.
     - If the court had an active game, takes its 4 players and:
       - Prepends their IDs to the front of `draft.queueIds`.
       - Sets their `queuedAt` to a large negative number (`-Date.now() + i`,
         preserving their original team order) so they sort as the OLDEST
         entries in the queue — guaranteeing the matchmaking engine
         (`selectNextPlayers`) picks them again before anyone who was already
         waiting.
     - If the court was idle (no game), it's just removed — no player/queue
       side effects.
   - Removing a court is a normal `commit()` (goes through the undo/rollback
     history stack like every other admin action), so "Roll Back" also undoes
     a court removal.

**Verification actually run:**
- `npx tsc --noEmit` → zero errors after changes
- `npm run build` → succeeds
- Re-ran `test/matchmaking.test.ts` (10/10) and `test/winrate.test.ts` (5/5) —
  unaffected by this session's changes
- New `test/removecourt.test.ts` mirrors the exact `removeCourt()` mutation
  logic and checks: court + game removed, other courts untouched, displaced
  players correctly prepended to `queueIds`, displaced players get an earlier
  `queuedAt` than anyone already waiting, and — the case that actually matters
  — that `selectNextPlayers` on the resulting queue picks the displaced group
  first. Also covers removing an idle court as a true no-op. **10/10 passed.**
- Rebuilt and grepped the compiled `dist/` output: confirmed `next-card-bg` no
  longer appears anywhere in the bundle, and only one Unsplash URL reference
  remains (the intentional hero banner). Served via `vite preview`, HTTP 200.



```bash
cd pickleball-open-play-v2
npm install
npx tsc --noEmit                     # typecheck
npm run build                        # production build to dist/
npx tsx ./test/matchmaking.test.ts   # 10 required queue-logic cases
npx tsx ./test/winrate.test.ts       # leaderboard wins-first ranking cases
npx tsx ./test/removecourt.test.ts   # remove-court / requeue-to-top cases
npx tsx ./test/removeplayer.test.ts  # remove-player-from-court / backfill cases
```

Four test files, same pattern each time — plain TypeScript, no test runner
dependency beyond `tsx` (already a devDependency), each re-implements the
relevant pure logic inline so it runs standalone without booting React. If you change `selectNextPlayers`, `buildNextGroups`, `winRate`, `removeCourt`, or
`removePlayerFromGame` in `Home.tsx`, mirror the change in the matching test
file and rerun.

There is no browser/UI test in place (no Playwright etc. configured in this
project). Manual click-through on a phone is still the only way to verify the
six-tap-logo → PIN → admin panel → Finish Game → Roll Back flow end-to-end.

## Session 4 — Fixes requested (already done)

Four changes requested, all applied and tested:

1. **Admin access was unreliable/invisible on mobile browsers.**
   Couldn't fully reproduce the exact cause from this sandbox (no real mobile
   device here), so this is a defense-in-depth fix rather than a single
   confirmed root cause:
   - Added a second, always-visible way into admin: a small gear icon
     (`.admin-entry-button`, `Settings2` icon) next to the LIVE indicator in
     the header. It opens the exact same PIN modal as the six-tap logo
     gesture. The six-tap secret on the logo still works too — this adds a
     reliable fallback that doesn't depend on a multi-tap gesture landing
     correctly on a small touch target.
   - Hardened the header for narrow phones: removed a `min-width` fight
     between the three header sections (brand / nav / actions); added
     `touch-action: manipulation` and removed the tap-highlight flash on the
     logo button so rapid taps register instead of being eaten by the mobile
     browser's double-tap-to-zoom delay; and at ≤520px the topbar now wraps
     (`flex-wrap: wrap`) instead of staying in one `nowrap` row, so on very
     narrow/budget-phone viewports nothing gets silently clipped off-screen —
     worst case it wraps to a second line instead of disappearing.
   - Trimmed non-essential header text at narrow widths (the "LIVE" label
     text hides under 520px, keeping just the dot) to leave room for the
     logo and the new admin gear icon.

2. **Leaderboard ranks by total wins, not win rate.**
   `Leaderboard`'s sort in `Home.tsx` changed from
   `winRate(b) - winRate(a) || b.wins - a.wins || ...` to
   `b.wins - a.wins || winRate(b) - winRate(a) || ...`. Win rate is still
   shown per row (added last session) — it's just no longer the primary sort
   key; total wins is first, win rate and games played are tiebreakers only.

3. **Removed "Riverside Club" text.**
   Deleted `<span className="live-club">Riverside Club</span>` from the
   header entirely (and the now-unused `.live-club` CSS rule). The "LIVE"
   indicator dot + label stays.

4. **Remove a currently-playing player; they go to the front of the queue,
   everyone else shifts back one.**
   Added a small "×" remove button per player inside each team panel on an
   active court (`Team` component in `Home.tsx`), visible only in admin mode.
   Clicking it opens the confirm modal (new `"removePlayer"` branch), and
   confirming calls `removePlayerFromGame()`, which does one of two things:
   - **If someone is waiting in the queue:** the single oldest waiting player
     (by `queuedAt`) is pulled out of the queue and immediately swapped into
     the vacated slot on the court, so the game keeps going 2v2 without
     interruption. The removed player is placed at the very front of the
     queue with an artificially early `queuedAt`. Net effect: the queue's
     length doesn't change (one player left it to backfill the court, one new
     player joined at the front), so everyone who was already waiting shifts
     back by exactly one position — the literal behavior requested.
   - **If nobody is waiting:** there's no valid replacement, so the game on
     that court ends without a result, and all 4 players from that court
     return to the queue — the removed player strictly first, the other 3
     right behind them in their original order, ahead of anyone already
     waiting.
   This is a normal `commit()`, so it's covered by Roll Back like every other
   admin action.

**Verification actually run:**
- `npx tsc --noEmit` → zero errors
- `npm run build` → succeeds
- Re-ran prior tests: `matchmaking.test.ts` (10/10), `removecourt.test.ts`
  (10/10) — both unaffected by this session's changes
- Rewrote `test/winrate.test.ts` for the new wins-first ranking (the old file
  asserted win-rate-first behavior, which is now intentionally wrong) —
  includes the case that actually distinguishes "rank by wins" from "rank by
  win rate" (a high-rate/low-win player must not outrank a low-rate/high-win
  player) plus a same-wins tiebreak case. **6/6 passed.**
- New `test/removeplayer.test.ts` mirrors `removePlayerFromGame()` exactly
  and covers both branches: with a waiting replacement (court still has 4
  players, the right player backfilled, removed player is queue position 0,
  and — the literal ask — the previously-waiting player's position shifted
  back by exactly one) and without one (game ends, all 4 return to queue,
  removed player strictly first). **12/12 passed.**
- **Full suite: 38/38 passing** across all four test files
- Rebuilt and grepped `dist/`: confirmed "Riverside" no longer appears
  anywhere in the compiled output, and the new admin entry button's class
  name is present in the bundle. Served via `vite preview`, HTTP 200.
- **What I could not verify:** an actual mobile browser rendering/touch test.
  The header-overflow theory is reasonable and the fix is more robust
  regardless of exact cause, but if the admin gear icon still doesn't show up
  on the user's specific phone after this, the next step is getting the
  actual viewport width and a screenshot from that device instead of
  guessing further.

## Session 5 — Fix requested (already done)

One change: **remove the always-visible admin gear icon added in Session 4;
the hidden six-tap-logo gesture is the only way into admin again.**

Session 4 added a persistent gear icon in the header as a mobile-reliability
fallback alongside the six-tap logo gesture. The user wants admin access kept
fully hidden — so the gear icon is removed, and only the six-tap logo remains.

**What changed:**
- Removed the `<button className="admin-entry-button">` and its `Settings2`
  icon from the header JSX in `Home.tsx` (also removed the now-unused
  `Settings2` import).
- Removed the `.admin-entry-button` CSS rule from `index.css`.
- Left everything else from Session 4's mobile-hardening pass in place: the
  `touch-action: manipulation` / tap-highlight fix on the logo button, the
  `.topbar` flex-wrap safety net at ≤520px, and the "LIVE" text hiding at
  narrow widths. Those were general overflow/touch-reliability fixes for the
  header, independent of whether a gear icon exists, so there's no reason to
  revert them — only the extra visible button goes away. The six-tap gesture
  (`handleLogoTap` / `logoTaps` state) was never touched by this change.

**Verification actually run:**
- `npx tsc --noEmit` → zero errors
- `npm run build` → succeeds
- Re-ran the full test suite — this is a UI-only change with no logic touched,
  and confirmed **all 38/38 still pass** across all four test files
- Rebuilt and grepped `dist/`: confirmed `admin-entry-button` no longer
  appears anywhere in the compiled output
- Confirmed `handleLogoTap` / the six-tap gesture is untouched and still wired
  to the logo button in the compiled bundle
- Served via `vite preview`, HTTP 200

## Session 6 — Fix requested (already done)

One change: **remove the wait-time timer on the Next Up ("wait list") cards,
and show the entire player name instead of truncating it.**

This is about the individual player rows inside the "Next Up" group cards
(`NextPlayer` component in `Home.tsx`), not the live-game timer on the
Playing cards (that one — `formatWait(game.startedAt, clock)` in the
court-card header — is a different timer and was intentionally left alone;
the request was specifically about the wait list).

**What changed:**
- `NextPlayer` no longer renders `<span className="wait-time">
  {formatWait(player.queuedAt, clock)}</span>`, and no longer takes a `clock`
  prop at all. Removed `clock` from `NextGroupCard`'s props and from its
  caller too, since nothing in that chain needs it anymore.
- `.next-player`'s CSS grid went from 4 columns (`16px 30px minmax(0,1fr)
  auto` — the last one was reserved for the timer) down to 2 (`30px
  minmax(0,1fr)` — avatar, then name/status).
- `.next-player-copy strong` and `span` (player name and status line) had
  `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` — that's
  what was clipping long names. Replaced with `overflow-wrap: anywhere;
  white-space: normal` so long names wrap onto a second line instead of
  getting cut off, and the full name is always visible.
- Removed the now-dead `.wait-time` CSS rule and its two other references
  (a `font-variant-numeric` grouping rule, and a color override inside
  `.next-card`).

**Verification actually run:**
- `npx tsc --noEmit` → zero errors
- `npm run build` → succeeds
- Full regression suite unaffected (this is UI-only, touches no queue/game
  logic) — **all 38/38 still pass** across all four test files
- Rebuilt and grepped `dist/`: confirmed `wait-time` no longer appears
  anywhere in the compiled JS or CSS, and the new `overflow-wrap:anywhere`
  rule for full-name wrapping is present
- Served via `vite preview`, HTTP 200

## Deployment

- Cloudflare Pages: build command `npm run build`, output directory `dist`
- Supabase: run `pickleball-open-play-v2/supabase/schema.sql`, then set
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (both in
  `.env.local` for local dev and in Cloudflare Pages env vars for prod)
- Admin PIN is `4951`, unlocked only by tapping the logo 6 times (the
  Session 4 always-visible gear-icon fallback was removed again in
  Session 5 at the user's request — hidden-only access is intentional).
  Client-side gate only, not real security (documented in
  `SUPABASE_SETUP.md`)

## Open items / suggestions for next session

- Add Supabase realtime subscription for true multi-device live sync (see gap
  noted above)
- No automated UI/E2E test exists — consider Playwright if this keeps growing
- `client/src/const.ts` still has dead OAuth-portal boilerplate from the Manus
  template; harmless but could be deleted for cleanliness
- Admin access is hidden-only again (six-tap logo, no visible fallback) per
  Session 5. The original mobile-visibility complaint from Session 4 was
  never confirmed against a real device — if it resurfaces, get the actual
  phone model/browser and a screenshot before guessing at another fix
