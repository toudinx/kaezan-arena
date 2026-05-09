# Kaezan Arena — Development Roadmap

Generated: 2026-05-09  
Source of truth: `README.md` + `docs/INVENTORY.md` + `docs/DEBT_AND_OPPORTUNITIES.md`.

---

## Design Invariants

These are locked and must not be violated by any roadmap item:

- Short-session design (~3 min runs) is non-negotiable.
- 7×7 grid identity is non-negotiable.
- Deterministic simulation must never be compromised.
- All balance constants must stay in `ArenaConfig.cs`.
- Prefer incremental safe changes over large refactors.
- Permanent progression and run variety are both important retention levers.
- The three playable Kaelis are Velvet, Sylwen, and Mirai (legacy Kina and Prototype are retired).
- Each Kaelis has: Signature AA, 3 active skills, 1 ultimate with 3 evolution levels.

---

## Phase 0 — Stabilization

**Goal:** Unblock the full game loop and eliminate critical correctness bugs before adding any new content.

**Prerequisites:** None. All items here are foundational and must ship first.

### Deliverables

| # | Description | Effort | Category | Priority |
|---|-------------|--------|----------|----------|
| 0.1 | **Fix Account Level cap / zone unlock mismatch.** Backend `AccountLevelCap = 10` with unlock gates `[1,2,4,6,8]`; frontend locks zones at `[1,21,41,61,81]` — Zones 2–5 are permanently unreachable through normal play. Either raise the backend cap to 100 and retune the XP formula, or reconcile both sides to the same set of thresholds. This single fix unblocks every boss, every higher-tier sigil drop, and all zone-gated content. | S | Tech | P1 |
| 0.2 | **Backend analytics receiver endpoint.** Add `POST /api/v1/analytics/run-result` to persist the `RunResultLogger` payload server-side. `RunResultLogger` already captures all required fields (kill rates, card picks, damage, timing). Without this, balance iteration requires manual player exports and is silently blocked. | S | Tech | P1 |
| 0.3 | **Resolve the `AntiRangedPressure` dead branch.** A 20% ranged damage reduction is wired into the mob→player hot path but no code activates `AntiRangedPressureBuffId`. Either remove the branch entirely or wire the buff to a card or kit mechanic. Every ranged hit currently evaluates a dead branch. | S | Tech/Combat | P1 |
| 0.4 | **Fix Mirai ultimate structural inconsistency.** `FixedWeaponKitByCharacterId` has 4 entries for Sylwen and Velvet (skills + ultimate) but only 3 for Mirai — Blood Fang is referenced via the shared `UltimateConfig.UltimateSkillId`. Any generic kit-iteration code silently skips Mirai's ultimate. Normalize all three characters to the same 4-entry structure. | S | Tech | P2 |
| 0.5 | **Remove legacy Exori / Heal / Guard dead constants.** `ExoriMinCooldownTotalMs`, `ExoriCooldownTotalMs`, `ExoriMasCooldownTotalMs`, `HealCooldownTotalMs`, `GuardCooldownTotalMs`, and their `WeaponIds` / `DisplayNames` entries are dead weight. Avalanche constants (`AvalancheDamage`, `AvalancheRangeTilesManhattan`) are also orphaned. Remove them and shrink `ArenaConfig.cs`. | XS | Tech | P2 |
| 0.6 | **Decide fate of `/arena-select` route.** A separate `/arena-select` page exists alongside `/arena-prep` with no documented relationship to the prep flow. Determine if it is a legacy route (delete) or an in-progress replacement (document it and wire it in), and update the README accordingly. | XS | UX/Tech | P2 |
| 0.7 | **Document Boss System in README.** Three bosses (Demon Lord, Plague Titan, The Ascendant) with zone routing, HP values, element affinities, and the `RunEndReasonVictoryBoss` victory condition are fully implemented but undocumented. Add a Boss System section to the README so their behavior is visible to all developers. | XS | Tech | P2 |
| 0.8 | **Document Mimic System in README.** Mimics (20% chest replacement chance, 40 Echo Fragment kill bonus) are fully implemented and undocumented. Add a Mimic section to the README. | XS | Tech | P3 |
| 0.9 | **Fix Mastery README description vs actual slot schedule.** README implies sigil slots unlock every 10 mastery levels; the actual schedule is levels 1, 2, 4, 6, 8. Correct the README description so it matches the code. | XS | Tech | P3 |

### Definition of Done

- All 5 zones are reachable through normal play via consistent backend + frontend unlock thresholds.
- Run telemetry is persisted server-side after every run.
- No dead branches in the mob→player damage hot path.
- Mirai's kit is structurally uniform with Sylwen and Velvet.
- `ArenaConfig.cs` contains no Exori / Heal / Guard / Avalanche orphan constants.
- `/arena-select` is either removed or documented.
- Boss and Mimic systems are in the README.

---

## Phase 1 — Combat Identity

**Goal:** Make each Kaelis feel mechanically distinct in play, and make every run feel like a dramatic arc rather than a slow drift.

**Prerequisites:** Phase 0 complete. Zone unlock must be working so elite and boss scaling can be tested across all zones.

### Deliverables

| # | Description | Effort | Category | Priority |
|---|-------------|--------|----------|----------|
| 1.1 | **Enable elite abilities via config.** All 4 elite archetypes (Masked Orc, Pumpkin Dude, Doc, Ice Zombie) have ability scaffolding locked at `99999ms` cooldown. Enable 2–3 distinct abilities — e.g. Doc casting a heal on the nearest living mob, Pumpkin Dude triggering a small AoE on death — by lowering the cooldown constant and verifying existing damage/range values. No new event contracts or frontend FX required for a first pass. This transforms late-run elites from tankier mobs into encounters requiring positional attention. | S | Combat | P1 |
| 1.2 | **Non-linear spawn pacing curve.** The current linear lerp from 2 to 10 mobs over 180s produces a slow first 60 seconds in a 3-minute run. Replace with a quadratic or sigmoid curve: slow open (~10s to orient), fast mid escalation, soft plateau at the end. Formula lives entirely in `InMemoryBattleStore.ScalingAndDamage.cs`. Validate with server-side telemetry from 0.2. | S | Combat | P1 |
| 1.3 | **Loot award reliability.** `awardLootSources` is fire-and-forget after each step response — loot can be silently lost on browser navigation or network failure. The `AwardedBySourceKeyByCharacter` idempotency key already prevents double-awards; add retry-on-failure to complete the safety loop so sigil and material drops are never silently dropped. | M | Tech | P1 |
| 1.4 | **Ultimate gauge feel tuning.** Damage-taken gauge fill (3/damage point) means ultimates fire faster when the player is in danger — rewarding being hit rather than skill play for Sylwen and Velvet. Tune the fill rates per character (e.g. lower damage-taken rate for Sylwen/Velvet, preserve or raise it for Mirai where risk/reward synergizes with Blood Fang). Level 1 threshold (< 3 cards) means the opening ultimates feel weak; consider shifting to < 2 cards for Level 1 gates. | S | Combat | P2 |
| 1.5 | **Wire `AntiRangedPressure` to a passive card.** After fixing the dead branch in 0.3, activate it as a card benefit (e.g. a new "Ranged Deflection" passive that grants the buff while the player's shield is non-zero). Adds meaningful defensive strategy consistent with passive card design. | S | Combat | P2 |
| 1.6 | **Passive card balance first tuning pass.** Use server-side telemetry (0.2) to identify which cards are picked in > 70% of runs. Tune `PercentAttackSpeedBonus` and `GlobalCooldownReductionPercent` caps, both currently generous defaults without a documented DPS baseline. Record tuning rationale as a comment in `ArenaConfig.cs` so future changes have a reference point. | S | Combat | P2 |
| 1.7 | **Document and verify `arcane_tempo` / `overclocked_reflex` incompatibility.** The incompatible pair exists but there is no recorded explanation of why they cannot coexist. Document the interaction and verify no other current card pairs produce broken state. | XS | Tech | P3 |

### Definition of Done

- At least 2 elite archetypes have enabled, distinct abilities with cooldowns < 30s.
- Spawn pacing curve produces noticeable escalation in the mid-run (60–120s window).
- Loot drops have no silent failure path.
- Ultimate gauge fill rates are differentiated per character and the Level 1 gate feels meaningful.
- Telemetry from at least 50 runs is available on the backend for Phase 2 planning.

---

## Phase 2 — Run Depth

**Goal:** Expand build variety so every run feels different and rewards experimentation with each Kaelis.

**Prerequisites:** Phase 0 (zones unlocked, telemetry live). Phase 1 (pacing tuned, baseline card balance documented).

### Deliverables

| # | Description | Effort | Category | Priority |
|---|-------------|--------|----------|----------|
| 2.1 | **Externalize card pool to JSON.** Move all card definitions from C# object initializers in `InMemoryBattleStore.cs` to a JSON file in the API content root. `CardDefinition` structure already exists. This enables balance changes via config deployment rather than code deployment and unblocks 2.2 without a build cycle. | S | Tech | P1 |
| 2.2 | **Card pool expansion to 20+ unique passives.** With `MaxDistinctPassiveCards = 4` and 14 current cards, the post-expansion pool should reach at least 22 cards — enough that C(22,4) = 7,315 possible endgame four-card combinations are viable. Prioritize cards that synergize with character-specific mechanics: Bleeding Mark amplifiers for Mirai, Focus/Headshot enhancers for Sylwen, Corrosion scalers for Velvet. | M | Content | P1 |
| 2.3 | **Ultimate evolution descriptions in HUD.** The Ultimate HUD panel shows gauge fraction and an AMBER `READY` pulse but does not communicate which Level (1/2/3) is currently active or what the next level unlocks. Add a compact Level indicator and a one-line description of the current level's behavior pulled from `ArenaConfig.DisplayNames`. | S | UX | P1 |
| 2.4 | **Character-specific card affinity system.** Add an optional `CharacterAffinity` field per card definition. Cards with a matching affinity grant +20% effectiveness (a numeric multiplier applied server-side) when used by the matching Kaelis. This deepens the Kaelis selection decision without requiring different card pools per character. | M | Content/Combat | P2 |
| 2.5 | **New card interaction pairs (synergy and conflict).** Add 3–5 documented synergistic pairs (e.g. a card that amplifies crits + a card that raises crit rate) and extend the existing conflict list with any interaction found unstable during 2.2 balance testing. Document all pairs in `ArenaConfig.cs` with a brief rationale. | S | Content | P2 |
| 2.6 | **Card offer weighting by run context.** Rather than uniform random offers, weight the card pool toward cards that synergize with the currently equipped sigils or already-chosen cards. This is a pure offer-generation change in `TryOfferCardChoice` and does not touch simulation logic. | M | Combat/UX | P3 |

### Definition of Done

- Cards are loaded from JSON; a card value change requires no recompilation.
- Pool has ≥ 22 unique passives; each Kaelis has at least 4 cards with explicit affinity.
- Ultimate HUD shows the current evolution level and a one-line description.
- 10 consecutive runs with the same Kaelis produce no identical card builds in telemetry analysis.

---

## Phase 3 — Progression Layer

**Goal:** Give players meaningful long-term goals that motivate returning across many sessions.

**Prerequisites:** Phase 0 (zone unlock fixed). Phase 1 (combat feel established). Phase 2 (card variety provides mid-run depth; progression layer complements it).

### Deliverables

| # | Description | Effort | Category | Priority |
|---|-------------|--------|----------|----------|
| 3.1 | **Sigil tier species unlock conditions for Brave–Ascendant tiers.** `TierSpecies[1..4]` in `ArenaConfig.BestiaryConfig` are empty arrays — Sigil Slots 2–5 have no Ascendant unlock condition. Define species lists for each tier (matching the zone at which those species naturally appear) and surface Ascendant unlock progress in the Bestiary UI per tier. | M | Progression | P1 |
| 3.2 | **Reconcile Account Level cap with full progression arc.** Raise `AccountLevelCap` from 10 to 100 (or an agreed target matching the frontend `[1,21,41,61,81]` unlock gates) and retune the XP formula `(n × 200) + 100` so the full cap requires meaningful cumulative play but is not a grind wall. Define per-level rewards (Kaeros, Echo Fragments) at milestone intervals. | S | Progression/Tech | P1 |
| 3.3 | **Mastery cap raise and milestone extension.** Current `MasteryLevelCap = 10` with one Hollow Essence barrier. Raise to 50 per character, add 3–4 additional essence barrier milestones, and extend `MilestoneRewards` arrays beyond the current 5-milestone table. Add per-milestone rewards that are meaningful at each tier (new sigil slot unlocks, currency bonuses). | M | Progression | P2 |
| 3.4 | **Daily Contracts variety expansion.** 6 contract types cover basic play patterns well but thin out at higher account levels. Add 4–6 new types targeting character mastery mechanics: e.g. `deal_bleeding_mark_damage`, `build_focus_stacks`, `kill_with_corrosion`, `chain_kills_in_window`, `survive_boss`. At least one new type per Kaelis mechanic. | S | Progression | P2 |
| 3.5 | **Echo Fragments spending depth audit.** Echo Fragments are currently earned (mastery milestones + mimic kills) but their spending pipeline (`Craft Weapon`, `Refine Weapon` in Bestiary tab) has not been fully audited. Verify the full crafting loop is functional, document the upgrade tree, and surface spend options that feel rewarding at each Mastery tier. | M | Progression/UX | P2 |
| 3.6 | **Kaeros sink: cosmetic or convenience purchases.** Kaeros is currently earned only through daily contracts and mastery milestones but has no documented spend path visible in the inventory. Add at least one meaningful Kaeros sink (e.g. extra card offer per run, zone prestige flag, cosmetic background unlock for Home Hub) so the currency loop closes. | M | Progression/UX | P3 |

### Definition of Done

- Bestiary shows Ascendant unlock progress for all 5 sigil slot tiers with real species conditions.
- Account level cap and XP formula produce a full progression arc from Zone 1 to Zone 5 within a realistic play horizon.
- Mastery has at least 4 milestones per character that deliver meaningful rewards.
- Daily Contracts include at least 2 contracts tied to each Kaelis's specific mechanics.
- Echo Fragments and Kaeros both have documented and functional spend paths.

---

## Phase 4 — Content Expansion

**Goal:** Add enemy variety and environmental depth that makes later zones feel distinct without changing grid identity.

**Prerequisites:** Phase 1 (elite abilities active — sets the bar for what "distinctive enemy" means). Phase 2 (card pool established — new enemies should interact with existing card mechanics). Phase 3 (progression rewards must justify encountering new enemies).

### Deliverables

| # | Description | Effort | Category | Priority |
|---|-------------|--------|----------|----------|
| 4.1 | **New mob species for Brave+ zone tiers.** Current 13-archetype spawn cycle is the same across all zones. Add 2–3 zone-exclusive archetypes per zone tier (Zone 2 Brave, Zone 3 Awakened, etc.) that appear only in their tier's archetype cycle. Each new archetype needs: HP/damage constants in `ArenaConfig`, spawn cycle registration, Bestiary species entry, frontend aura tier assignment. Prioritize Zone 2 first. | L | Content/Combat | P1 |
| 4.2 | **Boss behavior expansion.** All three bosses (Demon Lord, Plague Titan, The Ascendant) have HP, element, and zone routing but no special abilities beyond their base auto-attack. Add 1–2 unique ability patterns per boss (phase-transition at 50% HP, telegraphed AoE, summon call). The BossSystem.cs infrastructure supports this via existing event contracts. | M | Combat/Content | P2 |
| 4.3 | **Activate LOS via destructible obstacles.** `HasLineOfSight()` is stubbed to return `true` pending destructible objects. Implement at minimum one obstacle archetype (e.g. a breakable pillar that blocks ranged projectiles) and activate the LOS check. This has immediate gameplay impact for Sylwen (Whisper Shot LoS) and Velvet (Void Chain jump validity) and unlocks meaningful positional play on the 7×7 grid. | L | Combat/Tech | P2 |
| 4.4 | **A\* or simple flow-field pathfinding.** Current mob movement is sign-delta toward `(3,3)` with no obstacle routing. With terrain obstacles (4.3) and 10 concurrent mobs on a 5×5 walkable interior, mobs will permanently block each other. Add a simple BFS pathfinding fallback for blocked positions. Must remain deterministic (same grid state → same path). | M | Tech | P2 |
| 4.5 | **Zone-specific environmental modifiers.** Add one passive environmental effect per zone that changes run feel without changing the 7×7 grid: e.g. Zone 4 mobs spawn with a base damage aura, Zone 5 mobs have a 10% chance to respawn once. Constants in `ArenaConfig`, evaluated in the spawn system. | M | Content | P3 |

### Definition of Done

- Zone 2 and Zone 3 archetype cycles each include at least 1 zone-exclusive species.
- At least 2 bosses have phase-triggered behaviors beyond their base auto-attack.
- At least one destructible obstacle archetype is playable; LOS check is live.
- Mob pathfinding does not produce permanent clumps around obstacles.

---

## Phase 5 — Polish & Retention

**Goal:** Reduce technical friction, improve input responsiveness, and add hooks that motivate daily return.

**Prerequisites:** Phases 1–4 complete. Content must be stable before architectural refactors and social systems are worth building on top of it.

### Deliverables

| # | Description | Effort | Category | Priority |
|---|-------------|--------|----------|----------|
| 5.1 | **Decompose `ArenaPageComponent` into focused sub-components.** The ~5,000-line god component owns rendering, HUD, card choice UI, run results, bestiary deltas, and replay controls. Split into at minimum: `ArenaCanvasComponent` (rendering), `ArenaHudComponent` (HUD panels + skill bars), `CardChoiceComponent` (offer modal), `RunResultComponent` (post-run overlay). Angular module boundaries (`engine`, `render`, `assets`, `ui`) already define the natural split points. | M | Tech | P1 |
| 5.2 | **Server-side zone enforcement.** Zone selection is currently stored in `localStorage` and enforced client-side only. The backend secondary check uses thresholds `[1,2,4,6,8]` that are trivially met. Move enforcement to the backend using the reconciled account-level thresholds from Phase 0. Prevents zone-skipping via request manipulation. | S | Tech | P1 |
| 5.3 | **WebSocket / SignalR transport for battle step.** HTTP polling at 250ms introduces a hard input latency floor for Q/W/E/R manual casts. Replacing with a persistent connection eliminates 0–250ms command delay and removes the `battleRequestInFlight` serialization bottleneck. The simulation is already deterministic and event-driven; the transport change does not touch game logic. `InMemoryBattleStore` session is short (3 min), so connection management is straightforward. | XL | Tech | P2 |
| 5.4 | **Run result sharing.** Add a "Copy Run Summary" button in the Run Results overlay that generates a shareable plain-text or image summary (Kaelis, build, kill count, outcome). No external service needed — client-side canvas snapshot or clipboard text is sufficient for a first pass. | S | UX | P2 |
| 5.5 | **Persistent leaderboard for Daily Contracts.** Surface a simple per-day leaderboard scoped to contract completions or highest run level reached. Requires the backend analytics endpoint (Phase 0.2) and an aggregation endpoint. Gives social context to daily play without requiring PvP. | L | UX/Progression | P3 |
| 5.6 | **Home Hub background unlock system.** Kaeros sink from Phase 3.6 can fund purchasable Home Hub backgrounds (Void / Crimson / Azure already exist as themes). Add 3–5 new backgrounds unlockable via Kaeros or mastery milestones to close the currency loop visually. | S | UX | P3 |

### Definition of Done

- `ArenaPageComponent` is ≤ 1,500 lines; rendering, HUD, card choice, and run results are each in their own component.
- Zone selection is validated server-side; a manipulated request to Zone 5 is rejected if account level is insufficient.
- (Optional P2) Manual skill casts respond within 50ms of keypress with WebSocket transport.
- Run summary can be copied to clipboard in one click from the results screen.

---

## Deferred / Out of Scope

These items are intentionally excluded from the roadmap and why.

| Item | Reason |
|------|--------|
| **9×7 grid expansion** | Planned but deferred — the 7×7 grid identity is non-negotiable in the near term. All positioning math (Chebyshev range checks, spawn rings, POI constraints, movement rules) is tuned for 7×7. Expansion requires a full audit of every spatial constant and is a large-surface change with significant regression risk. |
| **WASD player movement** | Player fixed at `(3,3)` is a core design decision, not a limitation. The entire game is designed around the player being a stationary focal point for positional mob pressure. Enabling movement would require rethinking every skill geometry, spawn ring, and POI placement constraint. |
| **PvP or multi-player runs** | The HTTP polling architecture serializes all requests through `battleRequestInFlight`. Supporting two concurrent clients in the same simulation requires either a full transport rewrite or a separate simulation architecture. The short-session, solo combat identity does not motivate this investment. |
| **Kina and Prototype characters** | Legacy characters fully replaced by Mirai, Sylwen, and Velvet. No content, art, or backend logic for them is planned. |
| **Randomized skill loadouts per run** | Each Kaelis has a fixed kit; per-run skill randomization would undermine the character identity and mastery arc that motivates long-term play. Card selection already provides run variance. |
| **Server-side rendering / SEO** | Game-first SPA; there is no public-facing content that benefits from SSR. Angular's current setup is appropriate. |
| **Procedurally generated arenas** | The 7×7 fixed grid with a fixed player position is the game's identity. Procedural layouts would require a pathfinding investment that exceeds the design value at this stage. |
