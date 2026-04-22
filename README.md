# Kaezan Arena Monorepo

Long-term repository for Kaezan Arena with backend, frontend, docs, and tooling.

## Structure

- `backend/` ASP.NET Core + Clean Architecture project layout
- `frontend/` Angular workspace with Home Hub, Arena Prep, Kaelis, Backpack, Recruit, and live Arena pages
- `docs/` architecture and asset/license documentation
- `tools/` helper scripts for asset and project workflows

## Prerequisites

- .NET SDK 8+
- Node.js 22+
- npm 10+
- Docker Desktop (for future compose flow)

## Run Backend

```powershell
cd backend/src/KaezanArena.Api
dotnet run --launch-profile https
```

This profile exposes both:
- `https://localhost:7174`
- `http://localhost:5168`

Health check:

```text
GET http://localhost:5168/health
```

OpenAPI (used for frontend client generation):

```text
http://localhost:5168/swagger/v1/swagger.json
```

Account state persistence (backend):
- Account state is persisted to JSON files on disk.
- Default storage directory: `backend/src/KaezanArena.Api/.data/accounts` (relative to the API content root).
- Configure a custom directory with `AccountState:StorageDirectory` in configuration/environment variables.
- If the directory or files are missing, backend starts safely and seeds accounts in memory as before.

## Run Frontend

```powershell
cd frontend
npm install
npm run api:generate
npm run start
```

Frontend includes routing (`/`, `/arena-prep`, `/kaelis`, `/backpack`, `/recruit`, `/arena`), Tailwind setup, and Arena module boundaries (`assets`, `engine`, `render`, `ui`).
If you change `frontend/proxy.conf.json`, restart the frontend dev server (`npm run start`) so proxy updates take effect.
The frontend dev proxy forwards `/api/*` to `https://localhost:7174` (self-signed cert allowed via `secure: false` in dev proxy config).

`api:generate` requires backend running. The generator script first checks `OPENAPI_URL` (if set), then defaults to `http://localhost:5168/swagger/v1/swagger.json`.

Generator choice: `openapi-typescript` + `openapi-fetch` for a lightweight, framework-agnostic, type-safe client with minimal lock-in. Generated code is isolated under `frontend/src/app/api/generated`.

## Future Docker Compose Flow

```powershell
docker compose up --build
```

Current `docker-compose.yml` is a development skeleton with backend (`5080`) and frontend (`4200`) services.

## Navigation

The app uses a single top shell provided by `AppShellComponent` and keeps primary out-of-arena navigation in the Home Hub action rail (Arena / Kaelis / Backpack / Recruit). The root `App` component (`app.html`) contains only the `<router-outlet>` - no secondary nav. The live arena gameplay route (`/arena`) renders outside the shell (full-screen game view).
Bestiary is now part of the Kaelis experience (Kaelis tabs: Overview / Loadout / Bestiary), not a top-level sibling page.
Backpack uses a dedicated full page at `/backpack` for inventory management.

## Home Page Hub

The Home page is a dark game hub with:

- **Center showcase:** Active Kaelis summary.
- **Right action rail:** Large navigation cards for Arena / Kaelis / Backpack / Recruit.
- **Top-right utilities:** Mail / Daily / Settings / Event shortcuts.
- **Bottom compact status:** Hub-to-prep guidance plus account progress.

Daily opens the Daily Contracts modal. Mail, Settings, and Event open lightweight utility overlays from Home (not standalone routes).

Arena run setup no longer lives on `/`; it lives on `/arena-prep`.

## Arena Preparation Route

`/arena-prep` is the dedicated pre-run screen and contains:

- Zone selection.
- Start Run CTA (routes into live gameplay at `/arena` with selected `zoneIndex`).
- Last run summary.
- Compact active Kaelis summary.

## Kaelis Bestiary Tab

Bestiary now lives as a Kaelis tab (`/kaelis/:id?tab=bestiary`) and always uses the currently selected Kaelis context from the Kaelis parent screen.

- **Header context:** Bestiary heading + current Kaelis identity + Echo Fragments balance.
- **Stats row:** Tracked species / Unlocked / Total kills â€” numbers large, labels small, in dark tiles.
- **LEFT â€” Species list:** Each row shows display name, optional "Rank N" amber pill (rank > 0), kill count, kills-to-next label, and a progress bar (`linear-gradient` teal). Selected species highlighted with teal border.
- **CENTER â€” Species hero + loot:** Large species hero, rank/progress block, and discovered loot cards grouped by slot.
- **RIGHT â€” Progression actions:** Species-scoped crafting progression per Kaelis: `Craft Weapon` (when none exists), then `Refine Weapon` (unified owned-weapon list + refine actions).
- No raw species IDs visible; catalog display names are shown for all known species.

## Characters Page

The Kaelis page is a dark-themed parent experience with a persistent left selector rail and internal tabs:

- **Tabs:** `Overview`, `Loadout`, and `Bestiary` are subviews under Kaelis.
- **LEFT â€” Kaelis selector rail:** Fixed 3-character roster in this order: `Mirai`, `Sylwen`, `Velvet`.
- **Overview/Loadout tabs:** Keep portrait/identity and Kaelis detail blocks (stats, loadout, actions).
- **Bestiary tab:** Renders the bestiary system as a Kaelis-scoped subview instead of a separate top-level page.

Arena preparation now lives on `/arena-prep` with focused zone selection, Start Run, compact Kaelis context, and last-run summary.

## Run Results Screen

After each run ends (`isRunEnded`), a full-screen dark overlay replaces the arena:

- **Section A â€” Outcome header:** Large "VICTORY" (teal) or "DEFEAT" (coral), subtitle reason, inline meta line showing duration, level, kills, and elites.
- **Section B â€” Key stats grid:** Responsive 4-column grid of stat tiles covering Kills, Elites, Damage Dealt, Damage Taken, Min HP, XP Gained, Echo Fragments (net, color-coded), Primal Core. Chests and Equipment tiles are shown conditionally when non-zero.
- **Section C â€” Build summary:** Section header "Build Â· N cards" with all chosen card names as pills. Hidden when no cards were selected.
- **Section D â€” Bestiary Progress:** Top 3 species by kills gained this run, each row showing kills delta and a "NEW RANK N" amber pill when a milestone was crossed. Hidden if no kills were registered.
- **Actions:** "RUN AGAIN" (teal primary) and "EXIT TO PREP" (muted secondary).
- **[DEV] disclosure:** Collapsed `<details>` element containing Export Replay, Import Replay, Play Imported Replay, Copy Last/All Run JSON, Export Runs. Collapsed by default; native HTML toggle â€” no Angular state needed.
- Subtle footer: "Run result logged and stored."

Data source: all stats are read from existing component properties (`combatTotalDamageDealt`, `combatTotalDamageTaken`, `economyTotalXpGained`, etc.). `runPlayerMinHp` is captured from `RunResultLogger.finalizeIfEnded()` in `tryFinalizeRunResult()` and reset alongside other run counters.

Bestiary delta calculation: `runStartBestiaryKills` is captured from the account state at `beginNewRun()` before resetting `bestiaryEntries`. Post-run delta = `bestiaryEntry.killsTotal âˆ’ runStartBestiaryKills[species]`.

## Elemental Arenas

Four permanent Elemental Arenas, always accessible regardless of Account Level. All mobs have their element forced to the arena's element. Primary source of Elemental Core and Dust materials for weapon enchantment.

| Arena | Element | Core Drop | Dust Drop |
|---|---|---|---|
| Forge of Ash | Fire | EmberCore (12%) | EmberDust (8%) |
| Frozen Vault | Ice | FrostCore (12%) | FrostDust (8%) |
| Grove of Ruin | Earth | StoneCore (12%) | StoneDust (8%) |
| Storm Sanctum | Energy | VoltCore (12%) | VoltDust (8%) |

- All mob `AttackElement` values are overridden to the arena's forced element in the snapshot.
- Mobs whose **natural** element matches the forced element gain +15% HP and +15% damage (same bonus as the daily rotation).
- Sigil drops are suppressed in Elemental Arenas.
- Core and Dust drop events carry `RewardKind = "material"` and are added to `CharacterInventory.MaterialStacks`.
- Arena IDs follow the `arena:` prefix convention: `arena:forge_of_ash`, `arena:frozen_vault`, `arena:grove_of_ruin`, `arena:storm_sanctum`.
- All definitions are data-driven in `ArenaConfig.ElementalArenaConfig`.
- Home Hub shows 4 elemental arena cards in a row; clicking one navigates to `/arena?arenaId=<id>`.

## Current Gameplay

- Player is fixed at the center tile (3,3) - no WASD movement
- Signature Auto Attack: each character automatically fires their signature attack every player attack cycle (uses the player auto-attack cooldown slot, not GCD, and is excluded from the Assist skill cast pool)
  - `Velvet` -> `Void Chain`
  - `Sylwen` -> `Whisper Shot`
  - `Mirai` -> `Rend Claw`
- Signature AA cadence scales with passive-card `PercentAttackSpeedBonus` (faster attack speed -> lower signature AA cooldown, down to the configured attack cooldown floor)
- Kit skill cooldowns (Exori Min, Exori, Exori Mas, and character kit skills) are not affected by attack speed; they use `GlobalCooldownReductionPercent` instead
- Q/W/E/R trigger immediate manual `cast_skill` commands for active character kit slots (Skill 1/2/3/Ultimate)
- Manual casts follow normal cooldown and GCD checks; if a skill is on cooldown the keypress is ignored
- `R` manual cast is routed through backend `TryFireUltimate` for the active character ultimate; it fires only when `UltimateGauge >= ArenaConfig.UltimateConfig.GaugeMax`, otherwise it silently skips (no error)
- Assist continues firing other skills normally after a manual cast
- Loot awarding (`awardLootSources`) is fire-and-forget after each `stepBattle` response; `battleRequestInFlight` is released before loot HTTP work starts, preventing game-loop stalls during mass-kill moments (for example, Blood Fang)
- Account progression now includes Account Level + Account XP (Lv. 1-100), earned from runs and kills
- Zone selection happens before each run (Zone 1-5), with unlock gates at Account Lv. 1/21/41/61/81
- Zone multipliers scale mob HP and outgoing damage on top of normal run scaling
- Mob visual tier aura is derived from run zone (same sprite, no texture edits):
  - Zone 1 / Hollow: no aura
  - Zone 2 / Brave: subtle green glow
  - Zone 3 / Awakened: medium blue aura
  - Zone 4 / Exalted: strong purple aura
  - Zone 5 / Ascendant: intense orange-gold aura
- Daily Contracts system assigns 3 deterministic account-specific contracts per UTC day (resets at midnight UTC)
- Zone Arenas use a UTC-daily rotating element seed (Fire / Ice / Earth / Energy):
  - Rotation is deterministic per UTC date and shared by all players.
  - Mobs whose attack element matches the daily element gain +15% HP and +15% damage.
  - Home Hub highlights "Today's Element" with tooltip guidance, and at least one daily contract is tied to the active element.
- Kaeros is primarily earned through Daily Contracts completion (not regular kill/run baseline rewards)
- Completing Daily Contracts also grants Account XP rewards in addition to Kaeros
- Character progression uses Mastery (Mastery Level + Mastery XP), earned from run completion and kills
- Mastery milestones every 10 levels grant Kaeros, Echo Fragments, and additional Sigil slots (up to 5)
- The first mastery barrier is at level 10: progression to level 11 requires spending Hollow Essence
- Sigils are account-wide inventory items and are equipped per character in 5 ordered slots
  - Slot tiers are fixed by level range: Hollow (1-20), Brave (21-40), Awakened (41-60), Exalted (61-80), Ascendant (81-95)
  - Slot prerequisites apply: slot N requires slot N-1 already equipped
  - Mob kills roll Sigil drops independently at 8% per kill (species-based), currently generating Hollow-tier levels (1-20)
  - Dropped Sigils go directly to account inventory during runs; equip/unequip remains in Characters page only
- **Ascendant Unlock System:** Each Sigil slot tier has an Ascendant unlock condition based on Bestiary mastery
  - Unlock condition: Rank 5 (100 kills) in ALL species of that tier â€” evaluated per character after every drop award
  - Hollow tier (Slot 1) requires Rank 5 in: Melee Brute, Ranged Archer, Melee Demon, Hollow Shaman
  - Future tiers (Braveâ€“Ascendant) will add more species as they are implemented
  - Tier-to-species mapping is data-driven: `ArenaConfig.BestiaryConfig.TierSpecies` is the single source of truth
  - Ascendant unlock state is tracked in `CharacterState.AscendantSigilSlotsUnlocked` (per character, per tier index)
  - Progress is exposed via `AscendantTierProgressDto` in every `CharacterStateDto` response
  - Bestiary page shows per-tier Ascendant progress below the species list
  - Characters page Loadout tab shows Ascendant unlock state inline in each Sigil slot card
- Each playable character has a **fixed 3-slot kit** + **1 Ultimate slot**
  - Frontend roster now has exactly 3 playable entries in fixed order: `Mirai`, `Sylwen`, `Velvet`
  - Mirai kit: Primal Roar + Collapse Field + Rend Claw (Ultimate: Blood Fang)
  - Sylwen kit: Whisper Shot + Gale Pierce + Wind Break (Ultimate: Thornfall)
  - Velvet kit: Void Chain + Umbral Path + Death Strike (Ultimate: Storm Collapse)
  - Selecting the active character on Characters page carries into Arena start (`playerId`) and activates that character kit
  - Frontend active-character fallback defaults to `character:mirai`
  - Active character is always one of: `character:mirai`, `character:sylwen`, or `character:velvet`
  - Character art is remapped by ID only (no file moves/renames): `character:mirai` uses the former Kaelis Vex art, `character:sylwen` is unchanged, and `character:velvet` uses the former Kaelis Dawn art
  - Ultimate gauge starts at **0** each run and auto-fires when full
  - Ultimates evolve during the run based on total cards collected:
    - Level 1: fewer than 3 cards collected
    - Level 2: 3 to 5 cards collected
    - Level 3: 6 or more cards collected
  - Assist order is kit-driven per active character; Ultimate auto-casts when ready (Mirai priority checks Ultimate first, then offensive skills)
    - Mirai: Blood Fang (Ultimate) -> Primal Roar -> Collapse Field
    - Sylwen: Gale Pierce -> Wind Break -> Thornfall (Ultimate)
    - Velvet: Umbral Path -> Death Strike -> Storm Collapse (Ultimate)
  - Manual cast hotkey slot mapping (from backend character catalog fixed kit order):
    - `Q` = Skill 1
    - `W` = Skill 2
    - `E` = Skill 3
    - `R` = Ultimate
  - Per-character slot mapping:
    - Mirai: `Q` Primal Roar, `W` Collapse Field, `E` Rend Claw
    - Sylwen: `Q` Whisper Shot, `W` Gale Pierce, `E` Wind Break, `R` Thornfall
    - Velvet: `Q` Void Chain, `W` Umbral Path, `E` Death Strike, `R` Storm Collapse
  - Wind Break active: Whisper Shot cadence is doubled from its current calculated value (effective cooldown `/ 2.0`), attack speed cap is removed for the buff duration, and Sylwen projectiles pierce while the frenzy is active
  - Focus (FocusStacks + DeadeyeConsecutiveHits) resets on both target switch and locked target death; a `focus_reset` event (mob ID) is emitted on both paths
  - `bleeding_mark_updated` event (mob ID + stack count) is emitted whenever Mirai updates Bleeding Mark stacks (apply or consume/reset)
  - `corrosion_updated` event (mob ID + stack count) is emitted after every Velvet skill hit that applies Corrosion
  - Frontend kit-mechanic FX are fully wired:
    - Stack indicators above mobs: Bleeding Mark (amber `â–²N`) and Corrosion (purple `âœ¦N`)
    - Focus indicator below locked target: teal pip row (caps at `6+`)
    - Headshot: white flash + `HEADSHOT` floating text
    - Crowd control: rotating dashed stun ring (amber) and pulsing immobilize tile border (teal)
    - Collapse Field: pulled-mob slide animation + amber radial burst centered on player + red reflect aura on player (`#ef4444`) while reflect is active
    - Reflect aura glow is rendered with concentric multi-stroke rings instead of `shadowBlur` to avoid per-frame compositing lag
    - Void Chain: aggressive chain-lightning pass with 5px main arcs + secondary 2px parallel arcs, 700ms visibility, 36px hit pulses, inner hit flashes, and short border shimmer flashes per jump
    - Umbral Path: 14px heavy projectile (60% fill, 3px border) with 160ms travel, impact ring + 6-ray splash, and a stronger trail overlay (45%â†’75% pulsing fill, 2px solid perimeter, persistent centerline)
    - Death Strike: heavy 12px projectile with element-color border, 8-line radial impact burst (24px lines), and an added expanding impact fill circle
    - Storm Collapse: activation flashes the target-centered diamond tiles with white border (`#ffffff`, `2px`, `300ms`, no fill); detonation keeps per-mob expanding rings + purple `xN` stack text + purple scaled damage numbers; Levels 2/3 additionally pulse the local diamond perimeter in `#7F77DD` (`2px`, `200ms`, staggered pulses) for mobs that consumed stacks
    - Wind Break: teal player glow border while active + teal pierce trail rendering for Sylwen projectiles
    - Sylwen skill-specific FX: Whisper Shot now renders the `fx.projectile.arrow` (`weapon_arrow`) sprite oriented to projectile travel (`tileSize * 0.8`, 220ms travel) with two ghost trailing copies and a 6-line impact star + flash; Gale Pierce now renders as a concave sweeping wave arc (`tileSize * 0.9` width, 350ms travel) with wake trail, X-slash hit marks, and end-of-path ring/radiating lines; Thornfall uses a cross zone with solid white perimeter outline (Level 1: r=1, Levels 2/3: r=2), and Level 3 adds subtle red tile-floor tint (`rgba(239, 68, 68, 0.15)`) plus sprite rain
    - Character-aware ranged auto-attack FX: Sylwen `auto_attack_ranged` now renders `weapon_arrow` sprite oriented to travel direction (`tileSize * 0.6`, 150ms) with a small 4-line hit burst; Velvet `auto_attack_ranged` now renders a rotating arcane orb (inner orb + dashed ring, 180ms) with an expanding hit ring
    - Mob melee auto-attack readability: player-hit impacts now render `skull` sprite on the player tile (hitFx layer, 400ms fade)
  - Thornfall ultimate dispatches through `TryExecuteSylwenThornfall` (`BuildThornfallCrossTiles` + decal registration + level-driven radius/stun behavior); when no valid target exists, the ultimate cast is skipped
  - Rend Claw adapts to all 8 facing directions with fan logic derived from the locked/nearest target position, producing correct 3-tile fans for cardinal and diagonal facings alike
  - Skill name floating text is restored above the player on every assist cast for all characters (white, 11 px, rises 20 px, 800 ms duration with fade starting at 500 ms); a new cast replaces any previous text still visible; display names come from `AssistCastEventDto.DisplayName` populated server-side via `ArenaConfig.DisplayNames`
    - **BALANCE-1 â€” Combat pacing:** All player skill cooldowns and mob auto-attack cooldowns have been doubled; Global Cooldown increased from 400 ms to 800 ms. Affected constants (all in `ArenaConfig.cs`): `PlayerGlobalCooldownMs`; all nine `SkillConfig.*CooldownMs` values (Mirai: Rend Claw, Primal Roar, Collapse Field; Sylwen: Whisper Shot, Gale Pierce, Wind Break; Velvet: Void Chain, Umbral Path, Death Strike); all mob AA cooldown constants (Melee Brute, Ranged Archer, Melee Demon, Ranged Shaman, Melee Skeleton, Melee Wogol, Melee Warrior, Melee Zombie, Tiny Zombie, Ranged Imp, Ranged Swampy, Ranged Muddy, Melee Slug, Elite Masked Orc, Elite Pumpkin Dude, Elite Doc, Frost Revenant); and boss `AutoAttackCooldownMs` inline values for Demon Lord (800 â†’ 1600), Plague Titan (1000 â†’ 2000), and The Ascendant (1200 â†’ 2400). Ultimate gauge-based skills are unchanged.
  - Arena HUD now includes:
    - Collapsible `STATS` panel (collapsed by default) bound to snapshot `effectivePlayerStats` values
    - Enhanced Ultimate panel with gauge fraction, amber `READY` pulse at full gauge, and character-specific ultimate description
    - Active Cards panel showing chosen passive cards with stack counts (`Ã—N`) and teal border at max stacks
    - Locked target info panel (on right-click lock) with target name, HP bar (green/amber/red), element/weakness/resistance badges, and Bleeding Mark/Corrosion/Focus stack chips
    - Compact active-effects row showing only current effects: `WB` (Wind Break), `IMM` (immobilize present), `STN` (stun present)
    - Helper panel dynamic kit rows (`Q/W/E/R`) with backend display names and live cooldown bars from snapshot skill state
    - Signature AA HUD cooldown (Rend Claw / Whisper Shot / Void Chain) is mapped from `PlayerAttackCooldownRemainingMs` + `ResolvePlayerAutoAttackCooldownMs(state)` into signature `SkillStateDto` entries
    - `top-hud__buffs` is always rendered in the DOM to prevent top HUD height collapse and canvas reflow/resize flashes when buffs appear or expire
- **Mirai Kit (Backend):**
  - Passive `Bleeding Mark`: Mirai attacks build stacks on target; stacks increase subsequent Mirai skill damage and reset on mob death.
  - `Rend Claw` (Signature AA): frontal 3-tile cone based on current facing (diagonal facings use adaptive 3-tile cone), applies Bleeding Mark, and fires on the player AA cooldown slot (not assist pool). **Only fires when at least one mob is within Chebyshev range 1 (adjacent tiles); skipped without cooldown reset when no mob is in range.**
  - `Primal Roar`: AoE burst hitting all 8 adjacent tiles simultaneously (Chebyshev distance = 1, full square ring around the player), applies Bleeding Mark to every mob hit.
  - `Collapse Field` (Skill 2, Assist-enabled):
    - Pull target selection is deterministic and stable: all living mobs are sorted by Chebyshev distance from the player (closest first), with `ActorId` as tiebreaker.
    - Pull resolution is processed in that order, one mob at a time, updating occupancy immediately after each step.
    - Each mob pulls directly toward player tile `(3,3)` using per-step sign deltas on X/Y, stopping when adjacent (`r=1`) or blocked.
    - Mobs already adjacent are not pulled, but are still targeted by the post-pull impact.
    - After all pulls resolve, every targeted mob receives Collapse Field damage and `5000ms` stun if it survives.
    - Player gains reflect for `3000ms`: returns `30%` of incoming damage to the attacking mob as direct damage (no crit/modifiers), while active.
  - Ultimate `Blood Fang`: gauge-based ultimate centered on locked target (fallback: nearest living mob by Chebyshev distance; if no mobs exist, it does not fire and gauge is not consumed).
    - Geometry: target-centered square `r=1` (`max(|dx|, |dy|) <= 1`), in-bounds tiles only (3x3, up to 9 tiles).
    - Level 1 (`<3` cards): AoE only (`BloodFangBaseDamage = 18`) on all mobs in the square.
    - Level 2 (`3-5` cards): Level 1 AoE + consumes Bleeding Mark on each hit mob, dealing extra stack damage (`BloodFangStackDamage = 4` per consumed stack), then resets consumed stacks to `0`.
    - Level 3 (`>=6` cards): Level 2 behavior + execution check after damage: survivors at or below `15%` max HP are instantly executed only if they had stacks before consumption; each executed mob spreads `3` Bleeding Mark stacks to adjacent living mobs (Chebyshev distance `1`).
- **Sylwen Kit (Backend):**
  - Passive `Deadeye Grace`: Whisper Shot builds `FocusStacks` and `DeadeyeConsecutiveHits` on hit; Focus grants flat Whisper Shot bonus damage; every 3rd hit is a Headshot (2x damage + `1000ms` stun).
  - `Whisper Shot`: full-range projectile with locked-target-first selection; during Wind Break, projectiles pierce all mobs in the projectile path while Focus/Headshot counters continue accumulating.
  - `Gale Pierce`: full-range directional line shot that pierces all mobs in line, pushes each hit mob back by 1 tile when walkable, and stuns only displaced mobs for `3000ms` (3s).
  - `Wind Break`: pushes mobs outward until Chebyshev distance `r=2` from the player (mobs already at `r>=2` do not move), stuns only displaced mobs for `5000ms` (5s), and applies a `5000ms` frenzy that doubles Whisper Shot cadence, removes the attack speed cap while active, and enables projectile pierce.
  - Ultimate `Thornfall`: sustained ranged ground-zone centered on locked/nearest target, applying periodic damage over `5000ms` with level progression by cards collected: Level 1 cross `r=1`, Level 2 cross `r=2`, Level 3 cross `r=2` + stuns mobs that enter the area for `3000ms`.
- **Velvet Kit (Backend):**
  - Passive `Arcane Decay`: every Velvet skill hit adds `+1` `CorrosionStacks` on the target mob; Velvet damage is amplified by `+5%` per corrosion stack with no time decay.
  - `Void Chain`: chain projectile that starts on locked/nearest target, then keeps jumping to the nearest not-yet-hit mob within Chebyshev range `3`.
  - `Umbral Path`: pierces from player to arena edge in the exact player-to-target direction (cardinal or diagonal), applies `r=1` splash damage across the full path, and leaves a persistent 3-tile-wide trail that deals periodic damage and applies Corrosion each tick.
  - `Death Strike`: single-target projectile whose final damage is amplified by existing Corrosion stacks on the target. Plays sprite FX effect 633 (Part 13) centered on the target tile on impact.
  - Ultimate `Storm Collapse`: activates whenever the ultimate gauge is full - no stack condition required. Target resolution uses locked target first, with nearest-mob fallback. Geometry is resolved by `ResolveUltimateLevel()` using card thresholds (Level 1: `<3`; Level 2: `3-5`; Level 3: `>=6` cards), always centered on that resolved target. Diamond radii: Level 1 = `r=2`, Level 2 = `r=2`, Level 3 = `r=3` using Manhattan distance (`|dx| + |dy| <= r`). All mobs in the target-centered diamond take `VelvetStormCollapseAoeBaseDamage`. Stack detonation is local only: Levels 2/3 consume and detonate Corrosion stacks only for mobs inside the same diamond; Level 1 has no stack detonation.
- Per-mob passive/CC state is tracked on `StoredActor`: `BleedingMarkStacks`, `CorrosionStacks`, `FocusStacks`, `DeadeyeConsecutiveHits`, `IsStunned`/`StunRemainingMs`, and `IsImmobilized`/`ImmobilizeRemainingMs`.
- Tick behavior for crowd control:
  - Stunned mobs skip movement and auto-attacks.
  - Immobilized mobs skip movement but can still auto-attack.
- Ultimate behavior is character-specific and level-gated by cards collected (`ResolveUltimateLevel()`).
- Heal and Guard removed from kit - survivability comes from passive cards only
- **Left-click** a POI (chest, altar) to interact
- **Right-click** a mob to lock it as the priority target
- Level-up and chest card choices draw from the same passive-only card pool
- Chest card choices offer passive cards only (max 4 distinct types, max 3 stacks per type)
- All simulation constants are in `backend/src/KaezanArena.Api/Battle/ArenaConfig.cs`
- Ranged weapon infrastructure is implemented and shared by all ranged weapons:
  - Shared backend helpers: `HasLineOfSight` (stubbed), `ResolveRangedTarget`, `ApplyRangedDamageToMob`
  - Shared battle event contracts: `ranged_projectile_fired` (`RangedProjectileFiredEventDto`) and `mob_knocked_back` (`MobKnockedBackEventDto`)
  - Frontend visuals: `ProjectileAnimator` + mob knockback slide animation (render-only FX)
  - LOS obstacle checks are intentionally stubbed now and will activate when destructible obstacles are implemented
  - Active ranged weapons today: Sigil Bolt (single target), Shotgun (dragon-wave cone AoE + knockback), and Void Ricochet (bounce + pierce segments)
  - Void Ricochet projectiles are emitted per segment and rendered sequentially segment-by-segment on the frontend

## Frontend FX Sprites

The following `anim_strip_rows` FX assets are registered in `frontend/src/assets/packs/arena_v1_0x72_bdragon/asset-pack.json`:

- `fx.skill.thornfall_arrow` -> `fx/rpg_effect_all_free/Part 9/448.png` (`64x64`, `rowCount: 10`, `row: 0`)
- `fx.skill.umbral_flame` -> `fx/rpg_effect_all_free/Part 10/467.png` (`64x64`, `rowCount: 10`, `row: 1`)
- `fx.skill.death_strike_crystal` -> `fx/rpg_effect_all_free/Part 13/623.png` (`64x64`, `rowCount: 10`, `row: 1`)

These are used by frontend combat FX as follows:

- Thornfall cross tiles: sprite arrow rain (`448`) on `groundFx`, with solid white cross-perimeter outline (Level 1 `r=1`, Levels 2/3 `r=2`); Level 3 also applies subtle red floor tint (`rgba(239, 68, 68, 0.15)`).
- Umbral Path trail: sprite flame trail (`467`) on `groundFx`, while keeping perimeter stroke and centerline overlay.
- Death Strike impact: sprite crystal burst (`623`) on `hitFx`, layered on top of the existing radial burst + expanding impact circle.
- Sprite row selection for `448` / `467` / `623` now follows active weapon element (fire/ice/earth/energy/physical).

## Stable ID System

All weapon, character, and species IDs are defined as named constants in `backend/src/KaezanArena.Api/Battle/ArenaConfig.cs`:

- `ArenaConfig.WeaponIds` - stable weapon/skill IDs (e.g. `WeaponIds.ExoriMin = "weapon:exori_min"`)
- `ArenaConfig.SkillIds` - hero skill IDs for fixed kits (Mirai, Sylwen, Velvet)
- `ArenaConfig.PassiveIds` - hero passive IDs for fixed kits
- `ArenaConfig.KitIds` - fixed-kit IDs (e.g. `kit:mirai`, `kit:sylwen`, `kit:velvet`)
- `ArenaConfig.CharacterIds` - stable character IDs (e.g. `CharacterIds.Mirai = "character:mirai"`) for the 3 playable roster entries: Mirai, Sylwen, Velvet
- `ArenaConfig.SpeciesIds` - mob species ID strings used in snapshots and the account bestiary

`ArenaConfig.DisplayNames` is the **single source of truth** for all entity display names, keyed by the stable IDs above. No display name strings should appear anywhere else in the codebase.

The `SkillStateDto` carries a `displayName` field (populated server-side) so Angular components never need their own name mappings.

`ArenaConfig.KitDefinition` defines the fixed-kit shape (`KitId`, `PassiveId`, `Skill1Id`, `Skill2Id`, `Skill3Id`, `UltimateId`), and `ArenaConfig.Kits` now contains `Mirai`, `Sylwen`, and `Velvet` kit definitions.

`ArenaConfig.SkillConfig` centralizes numeric constants for Mirai/Sylwen/Velvet skill cooldowns, damage values, durations, and passive scaling.

## Code Style

- Follow `.editorconfig` at repository root.
- Keep backend layering strict: `Domain <- Application <- Infrastructure <- Api`.
- Keep frontend arena boundaries strict: `engine`, `render`, `assets`, `ui`.
- Use semantic asset IDs; only resolver/preloader modules should map to concrete file paths.

## Asset Mapping Helper

Use the semi-automatic mapper to propose semantic IDs from extracted pack files:

```powershell
node tools/assets/propose-asset-pack.mjs
```

Details (manual spritesheet config + merge flow): `docs/ASSET_MAPPER.md`.
