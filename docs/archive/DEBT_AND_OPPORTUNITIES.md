# Kaezan Arena — Technical Debt and Opportunities

Generated: 2026-05-09  
Source of truth: `README.md` + live codebase (see [docs/INVENTORY.md](INVENTORY.md) for system status).

---

## Section 1 — Critical Technical Debt

Issues that actively limit correctness, scalability, or safety.

---

### 1.1 Account Level cap mismatch breaks all zone progression

**What it is:** The backend hard-caps `AccountLevelCap = 10`. The frontend zone unlock constants are `[1, 21, 41, 61, 81]`. A player who reaches the backend level ceiling (Lv 10) still sees Zones 2–5 locked on the Arena Prep screen — unlocks at Lv 21 are unreachable.

**Where it lives:**
- [ArenaConfig.cs:468–484](../backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L468) (`AccountLevelCap = 10`, backend unlock thresholds `[1,2,4,6,8]`)
- [arena-prep-page.component.ts:13](../frontend/src/app/pages/arena-prep/arena-prep-page.component.ts#L13) (`ZONE_UNLOCK_LEVELS = [1,21,41,61,81]`)

**What breaks if left unaddressed:** Zone 2–5 content is permanently inaccessible through normal play. The entire progression loop beyond the first zone is silently broken. Boss zone routing (`Demon Lord` → Zones 1–2, `Plague Titan` → Zones 3–4, `The Ascendant` → Zone 5) becomes moot.

---

### 1.2 `ArenaPageComponent` is a ~5,000-line god component

**What it is:** A single Angular component owns the rendering pipeline, input handling, HTTP polling, card-choice UI, HUD state, run-results overlay, bestiary deltas, FX orchestration, and replay controls. All arena game state lives in a single mutable object.

**Where it lives:** [arena-page.component.ts](../frontend/src/app/pages/arena/arena-page.component.ts)

**What breaks if left unaddressed:** Any change to one concern can corrupt another through shared state. Zone-based conditional logic (elemental arenas, boss spawns, sigil drops) is already adding branching paths — each addition raises the probability of a silent regression. Unit testing any arena subsystem is impossible without spinning up the entire component. Memory leaks caused by uncleaned subscriptions or canvas state are extremely hard to isolate.

---

### 1.3 Loot awarding is fire-and-forget with no idempotency guarantee

**What it is:** After each `stepBattle` response the frontend fires loot HTTP calls as a detached Promise chain (`awardLootSources`). `battleRequestInFlight` is released before these calls complete. If a loot call fails silently or the browser navigates away, the award is lost. If a network retry sends the call twice, the item may be awarded twice.

**Where it lives:** [InMemoryBattleStore.cs](../backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (kill-event processing), [arena-page.component.ts](../frontend/src/app/pages/arena/arena-page.component.ts) (`awardLootSources` fire-and-forget dispatch)

**What breaks if left unaddressed:** Account inventory diverges silently from what actually happened in the simulation. Sigil and material drops can be lost on any request failure. The `AwardedBySourceKeyByCharacter` idempotency key in `PersistedAccountData` prevents *double-awards from replay* but does not protect against failed or retried in-run loot calls.

---

### 1.4 `AntiRangedPressure` buff has no documented activation path

**What it is:** `AntiRangedPressureReductionPercent = 20%` is wired into the mob→player damage pipeline: incoming ranged damage is reduced by 20% when the buff is active. No code path that activates `AntiRangedPressureBuffId` is documented in the README or visible in the INVENTORY scan.

**Where it lives:** [InMemoryBattleStore.ScalingAndDamage.cs](../backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.ScalingAndDamage.cs) (damage pipeline branch)

**What breaks if left unaddressed:** If the buff is never activated it is dead code in the hot damage path — every mob→player ranged hit evaluates a branch that never triggers. If it *is* activated somewhere, it is an invisible player stat modifier that cannot be reasoned about from design, HUD, or documentation.

---

### 1.5 Zone selection is client-enforced only

**What it is:** Zone selection is stored in `localStorage` key `kaezan_zone_selection_v1`. The frontend renders zone locks based on `ZONE_UNLOCK_LEVELS`. The backend's secondary unlock check uses `AccountLevelToUnlockZone = [1,2,4,6,8]` — thresholds that are always met before the frontend even shows a zone as locked. A manipulated request can start a Zone 5 run at any account level.

**Where it lives:** [arena-prep-page.component.ts](../frontend/src/app/pages/arena-prep/arena-prep-page.component.ts), [ArenaConfig.cs:468](../backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L468)

**What breaks if left unaddressed:** Any player who can modify their localStorage or intercept the `/arena` route query parameter bypasses all zone gating. Zone 5 mob scaling (4.5× HP, 3.8× damage) combined with the full run scaling curve would trivially kill an undergeared player — but that is a gameplay concern, not a security one. The real risk is if zone-gated rewards (higher-tier sigils, specific boss drops) are also gated only client-side.

---

### 1.6 All run analytics are client-side only, capped at 30 runs

**What it is:** `RunResultLogger` writes to IndexedDB with a 30-run rolling cap. No backend endpoint receives run result data. On storage clear, browser switch, or private mode, all telemetry is lost.

**Where it lives:** [run-result-logger.ts](../frontend/src/app/shared/run-results/run-result-logger.ts)

**What breaks if left unaddressed:** Balance iteration (spawn pacing, skill damage, card power) requires players to manually export JSON. Any retention or funnel analysis (where do players die? when do runs end?) is impossible without this data. The 30-run cap means even a motivated tester has a narrow data window. This silently blocks all data-driven balance work.

---

### 1.7 Mirai's ultimate is structurally inconsistent with Sylwen and Velvet

**What it is:** `FixedWeaponKitByCharacterId` for Sylwen and Velvet includes 4 entries (3 skills + ultimate). Mirai's entry has 3 entries; Blood Fang is instead referenced via the shared `UltimateConfig.UltimateSkillId`. This structural asymmetry is not documented and must be special-cased in any code that iterates over character kits.

**Where it lives:** [ArenaConfig.cs:984–1157](../backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L984)

**What breaks if left unaddressed:** Adding a 4th character or refactoring ultimate handling requires understanding this undocumented special case. Any generic "iterate kit slots" logic that assumes 4 entries per character silently skips Mirai's ultimate. The inconsistency already appears to have caused confusion about Mirai's ultimate slot mapping in the Q/W/E/R key table.

---

## Section 2 — Moderate Technical Debt

Issues that slow down development or create fragile patterns, but do not cause immediate breakage.

---

### 2.1 Skill dispatch is switch-case per skill ID

**What it is:** The assist evaluation and manual cast path in `InMemoryBattleStore.cs` dispatches to the correct skill handler using a conditional block on skill ID strings. Each new skill requires a new case in the dispatch table and a new handler method in the store.

**Where it lives:** [InMemoryBattleStore.cs](../backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (`EvaluateCombatAssist`, `TryCastSkill`)

**What slows down:** Adding a 4th character requires touching the dispatch table, the assist priority array, the RNG stream assumptions, and the hit-event emission for each new mechanic. The pattern is linear with character count; it was acceptable at 3 characters.

---

### 2.2 Card pool is defined inline in application code

**What it is:** 14+ passive card definitions live as C# object initializers inside `InMemoryBattleStore.cs`. Adding or tuning a card requires a code change, recompilation, and redeployment.

**Where it lives:** [InMemoryBattleStore.cs](../backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (`CardPool` initializer), [ArenaConfig.cs:635–646](../backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L635)

**What slows down:** Every balance pass on card values touches source code. A/B testing different card pools requires code branches. New cards can't be deployed without a build.

---

### 2.3 HTTP polling introduces a hard 250ms input latency floor

**What it is:** The game loop polls `/api/v1/battle/step` at `stepDeltaMs = 250ms` (4 req/s). Every player action (Q/W/E/R keypress, right-click lock) must wait up to 250ms before the backend processes it.

**Where it lives:** [BattleV1Controller.cs](../backend/src/KaezanArena.Api/Controllers/BattleV1Controller.cs), [battle-api.service.ts](../frontend/src/app/)

**What slows down:** Manual skill casts feel sluggish compared to the visual speed of the combat FX. The `battleRequestInFlight` flag serializes all requests, so burst input (QWER pressed quickly) has cumulative latency. The architecture cannot support multiple concurrent players without significant rework.

---

### 2.4 Pathfinding is step-by-sign-delta with no obstacle awareness

**What it is:** Mob movement toward the player uses per-step sign deltas on X and Y — mobs take one step toward `(3,3)` each tick by moving in the direction of the player. Occupied tiles block movement but there is no pathfinding to route around them.

**Where it lives:** [InMemoryBattleStore.MovementRules.cs](../backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.MovementRules.cs)

**What slows down:** With 10 concurrent mobs on a 5×5 walkable interior (excluding borders), mobs can stack at corners and block each other's paths. The `Collapse Field` pull system (which uses the same occupancy logic) can produce stuck mobs if adjacent tiles are all occupied. Adding terrain features or obstacles without a real pathfinder would break mob flow entirely.

---

### 2.5 Legacy Exori/Heal/Guard constants are dead code with no removal plan

**What it is:** `ExoriMinCooldownTotalMs`, `ExoriCooldownTotalMs`, `ExoriMasCooldownTotalMs`, `HealCooldownTotalMs`, `GuardCooldownTotalMs`, and matching `WeaponIds` / `DisplayNames` entries all remain in `ArenaConfig.cs`. Avalanche also has live damage constants (`AvalancheDamage=3`, `AvalancheRangeTilesManhattan=3`) but is not in any kit.

**Where it lives:** [ArenaConfig.cs:137–166](../backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L137)

**What slows down:** Auditing ArenaConfig for active constants vs dead code requires cross-referencing against all kit definitions. New developers will attempt to understand these constants and follow incorrect mental models. The file is already 1,377 lines and growing.

---

### 2.6 Undocumented `/arena-select` route

**What it is:** A separate `/arena-select` route exists alongside `/arena-prep`. Its purpose, navigation entry point, and relationship to the arena-prep flow are not documented anywhere.

**Where it lives:** [arena-select-page.component.ts](../frontend/src/app/pages/arena-select/arena-select-page.component.ts)

**What slows down:** Unknown whether this is a replacement in progress, a legacy route, or an alternate flow. Any routing refactor must treat it as a black box.

---

## Section 3 — Game Feel / Balance Gaps

Systems that are implemented but likely need tuning or are incomplete from a gameplay perspective.

---

### 3.1 Spawn pacing curve has a slow start and potential late-game wall

The mob count lerps linearly from 2 (at t=0) to 10 (at t=180s). In a 3-minute run, the first ~60 seconds has 2–4 mobs alive. This is a long low-pressure opening for a short-form run format. At the same time, the elite spawn chance ramps from 25% to 90% — converging with the max mob count ramp in the final 30–45 seconds creates a potential pressure spike where nearly every spawn is an elite. A non-linear mob count curve (slow start, faster mid, soft cap at the end) would better match the intended short-run pacing.

---

### 3.2 Player power scaling vs mob scaling is unverified

Mob HP multiplies from 1.0× to 3.2× over the run; mob damage from 0.70× to 2.6×. Zone 5 adds a 4.5× HP multiplier on top, producing late Zone 5 mobs at roughly 14.4× base HP. Player DPS scales through cards (up to 12 picks, 4 types × 3 stacks) and sigils, but there is no explicit formula or verified crossover point. Without server-side analytics (see §1.6), it is unknown whether Zone 5 is completable under normal conditions or whether specific card combinations are required to avoid a soft cap.

---

### 3.3 Card pool variety and run-to-run variance

With `MaxDistinctPassiveCards = 4` and `MaxCardSelectionsPerRun = 12`, every completed run converges to 3 stacks of 4 card types. The only variance is which 4 cards are offered. With 14 cards in the pool, this produces C(14,4) = 1001 possible endgame builds, but the mid-run experience (card offering order, stacking sequence) feels deterministic. The incompatible pair `arcane_tempo` + `overclocked_reflex` suggests at least one interaction was found to be unbalanced; the rest of the interaction space has not been documented as tested.

---

### 3.4 Elite archetypes lack individual identity

All 4 elite types (Masked Orc, Pumpkin Dude, Doc, Ice Zombie) share the same commander buff mechanic. Their individual ability slots are fully scaffolded (`AbilityCooldownMs`) but set to 99999ms — effectively disabled. Elites are currently just tankier, faster-hitting mobs with a buff aura. With elite spawn chance reaching 90% in late runs, the lack of elite behavioral variety makes the last minute of combat feel repetitive.

---

### 3.5 Passive card balance is undocumented

`GlobalCooldownReductionPercent` (capped at 60%) and `PercentAttackSpeedBonus` (affects signature AA cadence) are the two most impactful passive stats, but there is no documented baseline DPS target that these stats are tuned against. `PlayerShieldGainPerAction = 2` and `PlayerLifeLeechPercent = 30%` create significant survivability even before card selection. Whether these baseline values are intentional floors or placeholder values from early tuning is not recorded.

---

### 3.6 Ultimate gauge feel is asymmetric

The gauge fills via kills (12/kill → ~8 kills per ultimate) and damage taken (3 per damage point). Taking heavy damage accelerates ultimate availability, which rewards being hit. For Mirai this creates an interesting risk/reward loop (Blood Fang execution synergizes with Bleeding Mark stacks built up by surviving hits), but for Sylwen and Velvet it means their ultimates fire faster when the player is in danger — which trivializes the most dangerous moments rather than requiring skill to navigate them. The Level 1 → Level 2 → Level 3 threshold (3 and 6 cards) means the first 2–3 card picks are always Level 1 ultimates, which may feel weak regardless of timing.

---

## Section 4 — High-Value Opportunities

Features or improvements with strong impact relative to effort. All items fit the core identity: short runs, 7×7 positional combat, deterministic simulation.

---

### 4.1 Fix the Account Level / Zone unlock mismatch

**Effort:** S  
**What it solves:** This is the highest-leverage fix in the codebase. Zones 2–5, the boss system, and higher-tier sigil drops are all gated behind a progression wall that is currently unreachable. Reconciling the backend cap (10) with the frontend unlock levels (21/41/61/81) unlocks the entire mid-to-late game loop in a single data change.

**Approach:** Either raise `AccountLevelCap` to 100 and tune the XP curve accordingly, or lower the frontend unlock constants to `[1,2,4,6,8]` to match the backend. The XP formula `(n × 200) + 100` per level would need adjustment if the cap is extended.

---

### 4.2 Backend analytics receiver endpoint

**Effort:** S  
**What it solves:** All balance iteration currently requires manual player exports. A single `POST /api/v1/analytics/run-result` endpoint that persists the `RunResultLogger` payload server-side would enable kill-rate analysis, difficulty funnel mapping, and card pick frequency tracking. `RunResultLogger` already captures all required fields — only the server receiver is missing.

**Fit:** Does not touch the simulation; no determinism implications.

---

### 4.3 Activate and document `AntiRangedPressure`

**Effort:** S  
**What it solves:** Either remove the dead branch from the damage pipeline (simpler) or wire the buff to a card or kit mechanic (adds meaningful defensive strategy). The 20% ranged damage reduction is a non-trivial modifier already in the hot path. Clarifying its intent resolves an invisible gameplay variable and eliminates a dead branch from every ranged hit calculation.

**Fit:** Consistent with the design of passive cards granting survival tools.

---

### 4.4 Enable 2–3 elite abilities via config change

**Effort:** S  
**What it solves:** All 4 elite archetypes have ability scaffolding with 99999ms cooldowns. Enabling a distinct ability per elite type (e.g. Doc casting a heal on nearby mobs, Pumpkin Dude spawning a small AoE on death) requires only lowering the cooldown constant and verifying the existing damage/range values. This transforms late-run elite encounters from "tankier mobs" into encounters that require positional attention — directly serving the 7×7 positional identity.

**Fit:** Framework exists; no new event contracts or frontend FX required for a first pass.

---

### 4.5 Data-driven card pool (externalize from code)

**Effort:** S  
**What it solves:** Moving card definitions from C# object initializers to a JSON file in the API content root enables balance changes via config deployment rather than code deployment. The `CardDefinition` structure already exists — this is a serialization/deserialization change only. Enables rapid iteration on card values and future A/B testing of different pools.

**Fit:** Cards are purely passive modifiers; no simulation logic changes required.

---

### 4.6 Decompose `ArenaPageComponent` into focused sub-components

**Effort:** M  
**What it solves:** The ~5,000-line god component is the single largest maintenance risk in the frontend. Splitting into at minimum: `ArenaCanvasComponent` (rendering), `ArenaHudComponent` (HUD panels), `CardChoiceComponent` (card offer UI), and `RunResultComponent` (post-run overlay) reduces the blast radius of any single change and makes each concern independently testable.

**Fit:** Pure refactor; no gameplay changes. The Angular module boundaries (`engine`, `render`, `assets`, `ui`) already define the natural split points.

---

### 4.7 WebSocket / SignalR for battle step

**Effort:** M  
**What it solves:** Replacing HTTP polling with a persistent connection eliminates the 0–250ms command latency floor that makes manual skill casts (Q/W/E/R) feel sluggish. A persistent connection also eliminates the `battleRequestInFlight` serialization pattern and reduces per-tick server overhead from a full HTTP handshake to a frame dispatch. The simulation is already deterministic and event-driven — the transport layer change does not touch game logic.

**Fit:** The short-run format (3 minutes) means session management is simple. No persistent state across connections is required since the battle lives in `InMemoryBattleStore`.

---

### 4.8 Non-linear spawn pacing curve

**Effort:** S  
**What it solves:** A quadratic or sigmoid mob count curve (slow open → steep mid → soft late plateau) would create a more dramatic arc within the 3-minute run: a few seconds to orient, a fast escalation through the mid-game, and a sustained pressure peak rather than a gradual drift to 10 mobs. The pacing formula is entirely in [InMemoryBattleStore.ScalingAndDamage.cs:7–33](../backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.ScalingAndDamage.cs#L7) — one formula change with server-side telemetry (see §4.2) to validate the result.

**Fit:** Short runs reward fast feedback; a sharper pacing curve emphasizes the "each second counts" feel.

---

*End of document.*
