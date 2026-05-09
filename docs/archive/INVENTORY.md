# Kaezan Arena — Codebase Inventory

Generated: 2026-05-09  
Source of truth: `README.md` + live codebase. Older docs (`AI_CONTEXT.md`, `ARCHITECTURAL_MAP.md`, `GDD_TDD.md`) used only for divergence comparison.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| **DONE** | Fully implemented and matches documentation |
| **PARTIAL** | Core implemented; known gaps or stubs present |
| **STUB** | Scaffolding only; no real behaviour |
| **NOT_STARTED** | No code found |

---

## System Inventory

### 1. Arena / Grid System

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:10–13](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L10)
- [InMemoryBattleStore.MovementRules.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.MovementRules.cs)

**Key constants:**
```
Width = 7, Height = 7
PlayerTileX = 3, PlayerTileY = 3
MobSpawnRingMinDistance = 2, MobSpawnRingMaxDistance = 4
PoiSpawnMaxChebyshev = 2
```

**Notes:** Chebyshev distance used throughout for range checks, spawn rings, and POI placement. One entity per tile enforced via `IsWalkableTile()`. Border tiles (x=0/6, y=0/6) are walls; mobs cannot occupy them. No divergence from README.

**Assessment:** Rock-solid 7×7 grid; all positioning math is Chebyshev; player is immovable at (3,3).

---

### 2. Tick System

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:7–9, 929–931](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L7)
- [InMemoryBattleStore.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (batch loop)

**Key constants:**
```
DefaultStepDeltaMs = 250
MinStepDeltaMs     = 50
MaxStepDeltaMs     = 2000
MaxBatchStepCount  = 16
```

**Notes:** `MAX_TICK_DEBT` referenced in documentation and `AI_CONTEXT.md` but is not a real code constant — it is a conceptual description of setting `stepCount > 1`. Commands apply only on the final sub-tick of a batch; all earlier sub-ticks run empty. Frontend schedules requests using the `stepDeltaMs` value returned by the backend.

**Divergence:** `MAX_TICK_DEBT` does not exist as a symbol in the codebase. The README description ("MAX_TICK_DEBT = 0 → one HTTP request per tick") is a conceptual alias for `stepCount=1`.

**Assessment:** Tick pipeline is complete and configurable; batch stepping works correctly.

---

### 3. Player

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:18–35](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L18)
- [arena-pointer.helpers.ts](frontend/src/app/pages/arena/arena-pointer.helpers.ts)

**Key constants:**
```
PlayerBaseHp               = 120
PlayerAutoAttackCooldownMs = 800
PlayerAttackCooldownFloorMs = 1
PlayerGlobalCooldownMs     = 800
PlayerAutoAttackDamage     = 8
PlayerShieldGainPerAction  = 2
PlayerLifeLeechPercent     = 30
```

**Notes:** Player is fixed at (3,3). `move_player` command type exists in protocol and in `ArenaConfig.MovePlayerCommandType` but is not sent by the frontend. Right-click → `set_target` command. Left-click POI → `interact_poi` command. Manual skill casts via Q/W/E/R send `cast_skill` commands for the active character's kit slots.

**Assessment:** Fixed-center player is complete; all controls operate as documented.

---

### 4. Auto-Attack / Assist System

**Status:** DONE

**Primary files:**
- [InMemoryBattleStore.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (assist priority arrays, `EvaluateCombatAssist`)
- [ArenaConfig.cs:698–707](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L698)

**Key constants:**
```
AssistDefaultMaxAutoCastsPerTick = 1
AssistDefaultHealAtHpPercent     = 40
AssistDefaultGuardAtHpPercent    = 60
```

**Assist priority (character-specific, from KitDefinition + assist evaluation):**
- Mirai: Signature AA (RendClaw) on AA cooldown lane → Primal Roar → Collapse Field; Ultimate (Blood Fang) checked first when gauge is full
- Sylwen: Signature AA (WhisperShot) on AA cooldown lane → Gale Pierce → Wind Break; Ultimate (Thornfall) auto-fires
- Velvet: Signature AA (VoidChain) on AA cooldown lane → Umbral Path → Death Strike; Ultimate (StormCollapse) auto-fires

**Notes:** Signature AAs fire on the dedicated player AA cooldown slot, not through the skill assist pool. Max 1 assist cast per tick. Heal and Guard still exist as IDs in config but are excluded from all current kits and the assist pool.

**Assessment:** Per-character assist priority fully implemented; max-1-cast-per-tick enforced.

---

### 5. Weapon Kit System

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:984–1157](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L984)

**KitDefinition structure** (Skill1, Skill2, Skill3, Ultimate):
```
Mirai:  PrimalRoar / CollapseField / RendClaw        / Blood Fang (skill:ultimate)
Sylwen: WhisperShot / GalePierce  / WindBreak        / Thornfall
Velvet: VoidChain  / UmbralPath   / DeathStrike      / StormCollapse
```

**Notes:** Each character has exactly 3 kit skills + 1 ultimate = 4 total. Signature AA is a separate lane (`SignatureAutoAttackWeaponIdByCharacterId`) not counted as a kit slot. The "1 free slot" concept from older docs is superseded by the ultimate gauge system; no run-time free weapon slot is currently implemented.

**Divergence:** `AI_CONTEXT.md` and `GDD_TDD.md` describe Mirai's kit as "Exori Min + Exori + Exori Mas" — this is the old weapon naming. The current kit is Primal Roar + Collapse Field + Rend Claw. `FixedWeaponKitByCharacterId` for Sylwen and Velvet contains 4 entries (including the ultimate), while Mirai has 3. This is a data-structure inconsistency: Mirai's ultimate is `UltimateConfig.UltimateSkillId` (shared), while Sylwen's and Velvet's ultimates are character-specific skill IDs embedded in the fixed kit list.

**Assessment:** Kit structure is fully operational; naming mismatch vs old docs is cosmetic only.

---

### 6. Skill System

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:137–166, 1024–1101](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L137)
- [InMemoryBattleStore.SkillLeveling.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.SkillLeveling.cs)

**Legacy Exori constants (still present, used for legacy/weapon slot):**
```
ExoriMinCooldownTotalMs  = 800ms
ExoriCooldownTotalMs     = 1200ms
ExoriMasCooldownTotalMs  = 2000ms
AvalancheCooldownTotalMs = 2500ms
HealCooldownTotalMs      = 7000ms
GuardCooldownTotalMs     = 10000ms
```

**Character skill cooldowns (SkillConfig):**
```
MiraiRendClawCooldownMs     = 2800ms
MiraiPrimalRoarCooldownMs   = 4000ms
MiraiCollapseFieldCooldownMs = 5000ms
SylwenWhisperShotCooldownMs = 2000ms
SylwenGalePierceCooldownMs  = 3600ms
SylwenWindBreakCooldownMs   = 5000ms
SylwenThornfallCooldownMs   = 5000ms
VelvetVoidChainCooldownMs   = 2400ms
VelvetUmbralPathCooldownMs  = 4000ms
VelvetDeathStrikeCooldownMs = 3200ms
```

**Leveling formula:** 4% cooldown reduction per skill level, capped at 32% (`SkillCooldownReductionPerLevelPercent`, `SkillCooldownReductionMaxPercent`). Passive card `GlobalCooldownReductionPercent` applies separately, capped at 60%.

**Notes:** Exori/Heal/Guard constants are legacy; they remain because the old weapon ID system still references them via `WeaponIds` and `DisplayNames`. The active simulation uses character-specific skill configs from `SkillConfig`. Avalanche still has functional damage constants (`AvalancheDamage=3`, `AvalancheRangeTilesManhattan=3`) but is not part of any current character kit.

**Assessment:** Character skills fully implemented; legacy Exori constants are harmless dead weight.

---

### 7. Ultimate Slot

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:168–174](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L168)
- [InMemoryBattleStore.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (`TryFireUltimate`, `ResolveUltimateLevel`)

**Key constants:**
```
UltimateConfig.GaugeMax         = 100
UltimateConfig.GaugePerKill     = 12
UltimateConfig.GaugePerDamageTaken = 3  (per damage point received)
UltimateLevelTwoCardThreshold   = 3     (cards collected for Level 2)
UltimateLevelThreeCardThreshold = 6     (cards collected for Level 3)
```

**Level progression:**
- Level 1: < 3 cards collected
- Level 2: 3–5 cards
- Level 3: ≥ 6 cards

**Notes:** Gauge starts at 0 each run. Auto-fires when gauge reaches 100. Manual `R` key sends `TryFireUltimate`; skips silently when gauge < max. Thornfall skips if no valid target exists. Blood Fang skips if no living mobs exist (gauge not consumed). Storm Collapse always fires on gauge fill.

**Assessment:** Gauge-based ultimate fully functional with three level tiers and per-character behaviour.

---

### 8. Card System

**Status:** DONE

**Primary files:**
- [InMemoryBattleStore.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (CardPool, `TryOfferCardChoice`, `ChooseCard`)
- [ArenaConfig.cs:635–646](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L635)

**Key constants:**
```
MaxCardOfferCount         = 3
MaxCardSelectionsPerRun   = 12
MaxDistinctPassiveCards   = 4
MaxGlobalCooldownReductionPercent = 60
```

**Sources:**
- `CardOfferSource.LevelUp` → passive cards (and historically skill cards, now postponed)
- `CardOfferSource.Chest` → passive cards only

**Notes:** Battle pauses on card offer (`PendingCardChoice`). Incompatible pair present: `arcane_tempo` + `overclocked_reflex`. Card stack scaling uses `BaseStackMultiplierPercent` / `AdditionalStackMultiplierPercent`. Applying a card immediately recalculates all skill cooldowns. Pool contains 14+ unique passive card definitions.

**Assessment:** Card system is complete; all caps enforced; two-source (level-up / chest) logic works correctly.

---

### 9. Chest / POI System

**Status:** DONE

**Primary files:**
- [InMemoryBattleStore.PoiSystem.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.PoiSystem.cs)
- [ArenaConfig.cs:756–784](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L756)

**Key constants:**
```
Normal Chest:
  ChestSpawnCheckMs         = 65,000ms (65s interval)
  InitialChestSpawnCheckAtMs = 45,000ms (first eligible at 45s)
  ChestSpawnChancePercent    = 90%
  MaxChestsPerRun            = 3
  ChestLifetimeMs            = 10,000ms

Altar:
  AltarSpawnCheckMs          = 9,000ms (9s interval)
  AltarSpawnChancePercent    = 35%
  AltarLifetimeMs            = 10,000ms
  AltarCooldownMs            = 12,000ms
  AltarSummonSpawnCount      = 2

Species Chest:
  SpeciesChestLifetimeMs     = 10,000ms
  First at: BestiaryFirstChestBaseKills=150 ± 30
  Increment: BestiaryChestIncrementBaseKills=300 ± 50
```

**Notes:** POI spawn constraint is Chebyshev ≤ 2 from player. Mimic system (see Undocumented Findings) can replace a normal chest at 20% chance.

**Assessment:** All three POI types (chest, altar, species chest) are fully implemented with correct timings.

---

### 10. Enemy Spawn System

**Status:** DONE

**Primary files:**
- [InMemoryBattleStore.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (`TrySpawnMobInSlot`, `TickMobRespawns`, `BuildMobSlots`)
- [InMemoryBattleStore.ScalingAndDamage.cs:7–33](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.ScalingAndDamage.cs#L7)

**Key constants:**
```
MobRespawnDelayMs   = 750ms
EarlyMobConcurrentCap = 2   (at t=0)
MaxAliveMobs        = 10    (at t=180s)
RunDurationMs       = 180,000ms
```

**Pacing formulas:**
```
maxAliveMobs = lerp(EarlyMobConcurrentCap → MaxAliveMobs, normalizedRunProgress)
             + min(1, totalKills / 70)   [kill-driven bonus]
             clamped to [2, 10]

eliteSpawnChance = 25% + floor(40 * normalizedRunProgress) + min(25, totalKills/8)
                 clamped to [25%, 90%]
```

**Archetype cycle (13 species):** MeleeBrute → RangedArcher → MeleeDemon → RangedShaman → MeleeSkeleton → MeleeWogol → MeleeWarrior → MeleeZombie → MeleeTinyZombie → RangedImp → RangedSwampy → RangedMuddy → MeleeSlug (deterministic, per slot)

**Notes:** Boss spawn pauses mob spawning for `BossConfig.SpawnPauseDurationMs = 5,000ms`. Spawn ring is Chebyshev 2–4 from player.

**Assessment:** Pacing curve is complete and data-driven; all 13 normal archetypes plus 4 elite archetypes are registered.

---

### 11. Elite System

**Status:** DONE

**Primary files:**
- [InMemoryBattleStore.EliteCommanderSystem.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.EliteCommanderSystem.cs)
- [ArenaConfig.cs:659–665](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L659)

**Key constants:**
```
EliteCommanderMaxBuffTargets          = 3
EliteCommanderDamageBonusPercent      = 40%
EliteCommanderAttackSpeedBonusPercent = 30%
EliteCommanderHpRegenPerTick          = 2
EliteCommanderDamageReductionPercent  = 20%
```

**Elite archetypes (4):** EliteMaskedOrc (120 HP), ElitePumpkinDude (100 HP), EliteDoc (90 HP), EliteIceZombie (110 HP)

**Notes:** All 4 elite ability cooldowns are `99999ms` — abilities are effectively disabled; the commander buff system drives all elite special behaviour (regen via `EliteCommanderHpRegenPerTick`, damage bonus, etc.). Buff target priority: same species first, then any. Buffs are removed immediately on elite death; `EliteBuffRemovedEventDto` events are fired per target. No stacking of buffs between multiple elites.

**Assessment:** Commander buff system fully functional; elite ability slots are placeholder (99999ms cooldown).

---

### 12. Combat / Damage Pipeline

**Status:** DONE

**Primary files:**
- [InMemoryBattleStore.ScalingAndDamage.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.ScalingAndDamage.cs)
- [InMemoryBattleStore.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (`ApplyDamageToMob`, `ApplyDamageToPlayer`)

**Pipeline (player → mob):**
```
baseDamage
  + FlatDamageBonus (cards + sigils)
  × (1 + PercentDamageBonus/100)
  × (1 + DamageBoostBuffPercent/100) if buff active
  × RNG [0.90, 1.10]
  → CritRoll (20% → ×2)
  × ElementalModifier (1.30 weak / 0.70 resist / 1.0 neutral)
  → Shield absorbs first → HP reduced
  → On death: bestiary +1 kill, XP grant, respawn timer
  → PlayerFlatHpOnHit + shield regen
  → LifeLeech (30% of damage dealt → player HP)
```

**Pipeline (mob → player):**
```
baseDamage × RNG [0.85, 1.15]
  × AntiRangedPressure (-20% if active, ranged only)
  → Shield absorbs first → HP reduced
  → RunEnded if HP ≤ 0
```

**Key constants:**
```
CriticalHitChancePercent = 20%
PlayerLifeLeechPercent   = 30%
MobHpMultStart=1.0 → MobHpMultEnd=3.2   (lerp over run duration)
MobDmgMultStart=0.70 → MobDmgMultEnd=2.6
EliteHpMultiplierFactor  = 1.35×
EliteDmgMultiplierFactor = 1.30×
RunLevelHpSeasoningPerLevel = 1.5% (enabled)
```

**Assessment:** Full shield→HP pipeline correct; crit, leech, and elemental modifiers all wired.

---

### 13. Elemental System

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:524–615](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L524)

**6 elements:** Fire, Ice, Earth, Energy, Physical, Holy

**Element chart:**
```
Fire    → weak: Ice,      resist: Earth
Ice     → weak: Energy,   resist: Fire
Earth   → weak: Fire,     resist: Ice
Energy  → weak: Physical, resist: Energy (self-resistant)
Physical / Holy → no chart entry (no weakness/resistance defined)
```

**Key constants:**
```
WeaknessMultiplier          = 1.30×
ResistanceMultiplier        = 0.70×
DailyElementBonusMultiplier = 1.15× (+15% HP and damage for matching mobs)
```

**Daily rotation:** Fire → Ice → Earth → Energy (cycling by `date.DayNumber % 4`)

**Notes:** `Holy` element exists in `ElementType` enum and is assigned to `HealElement` but has no entry in the element chart (neutral damage against all). Physical and Holy are effectively neutral-element attackers.

**Assessment:** Elemental system complete; Holy element is a cosmetic placeholder with no combat interaction.

---

### 14. Elemental Arenas

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:552–583](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L552)
- [arena-elemental-page.component.ts](frontend/src/app/pages/arena-elemental/arena-elemental-page.component.ts)

**4 arenas:**
| Arena ID | Display Name | Element | Core Drop | Core % | Dust Drop | Dust % |
|---|---|---|---|---|---|---|
| `arena:forge_of_ash` | Forge of Ash | Fire | `material:ember_core` | 12% | `material:ember_dust` | 8% |
| `arena:frozen_vault` | Frozen Vault | Ice | `material:frost_core` | 12% | `material:frost_dust` | 8% |
| `arena:grove_of_ruin` | Grove of Ruin | Earth | `material:stone_core` | 12% | `material:stone_dust` | 8% |
| `arena:storm_sanctum` | Storm Sanctum | Energy | `material:volt_core` | 12% | `material:volt_dust` | 8% |

**Notes:** All mob `AttackElement` values are forced to the arena element. Mobs whose natural element matches gain the `DailyElementBonusMultiplier` (+15%). Sigil drops suppressed in elemental arenas. Core and dust drops carry `RewardKind = "material"` → `CharacterInventory.MaterialStacks`. Home Hub shows 4 cards navigating to `/arena?arenaId=<id>`.

**Assessment:** All four arenas fully defined and data-driven; no divergences.

---

### 15. Sigil System

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:205–398](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L205)

**5 slots (level ranges):**
```
Slot 1 (Hollow):    Lv  1–20
Slot 2 (Brave):     Lv 21–40
Slot 3 (Awakened):  Lv 41–60
Slot 4 (Exalted):   Lv 61–80
Slot 5 (Ascendant): Lv 81–95
```

**Drop:** `SigilDropChancePercent = 8%` per kill; only 4 species drop sigils: MeleeBrute, RangedArcher, MeleeDemon, RangedShaman.

**Stat profiles by definition:**
- `sigil_def:melee_brute` → HP + LifeLeech
- `sigil_def:ranged_archer` → CritChance + CritDamage
- `sigil_def:melee_demon` → FlatDamage + PercentDamage
- `sigil_def:ranged_shaman` → PercentDamage + CooldownReduction

**Stat caps:** CritChance +50%, CritDamage +300%, LifeLeech +50%.

**Ascendant unlock:** Requires Bestiary Rank 5 (100 kills) in ALL 13 Hollow species for tier 0 (slot 1). Tiers 1–4 future (`TierSpecies[1..4]` are empty arrays).

**Notes:** Account-wide inventory, equip/unequip only on Characters page. Slot prerequisites enforced (slot N requires slot N-1 equipped). Zone index drives sigil level range for drops. `HpBonusPerSigilLevel = 2`.

**Assessment:** Sigil system complete for Hollow tier; Brave–Ascendant tier species unlock conditions are `NOT_STARTED` (empty arrays).

---

### 16. Mastery System

**Status:** PARTIAL

**Primary files:**
- [ArenaConfig.cs:176–203](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L176)

**Key constants:**
```
MasteryLevelCap              = 10
XpPerRunCompleted            = 100
XpPerKill                    = 2
XpRequiredPerLevelBase       = 80
XpRequiredPerLevelMultiplier = 120
  → XP for level N→N+1 = 80 + (N-1)×120
HollowEssenceCostForMilestone1 = 20  (Lv 10→11 requires Hollow Essence)
MilestoneLevelInterval       = 10
```

**Sigil slot unlock levels:**
```
Lv 1 → 1 slot, Lv 2 → 2 slots, Lv 4 → 3 slots, Lv 6 → 4 slots, Lv 8 → 5 slots
```

**Milestone rewards (per milestone index 0=Lv10, 1=Lv20, etc.):**
```
Kaeros:        [30, 40, 50, 60, 100]
EchoFragments: [200, 350, 500, 700, 1000]
```

**Divergence from README:** README states "slot unlocks every 10 levels" — the actual unlock schedule is at levels 1, 2, 4, 6, 8 (not every 10 levels). The `MilestoneLevelInterval=10` governs *reward* milestones (Kaeros/Echo), not sigil slot unlocks.

**Assessment:** XP curve, essence barrier, and milestone rewards implemented; slot unlock schedule is every-2-to-4-levels not every-10 as README implies.

---

### 17. Account Level System

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:468–484](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L468)
- [arena-prep-page.component.ts:13](frontend/src/app/pages/arena-prep/arena-prep-page.component.ts#L13)

**Backend constants:**
```
ZoneConfig.AccountLevelCap         = 10
ZoneConfig.AccountLevelToUnlockZone = [1, 2, 4, 6, 8]
ZoneConfig.AccountXpPerRunCompleted = 50
ZoneConfig.AccountXpPerKill         = 1
XpRequiredForLevel(n)               = (n × 200) + 100
```

**Frontend unlock gates:**
```
ZONE_UNLOCK_LEVELS = [1, 21, 41, 61, 81]
```

**Divergences:**
1. README says "Account Level Lv 1–100" — backend `AccountLevelCap` is 10, not 100.
2. Backend zone unlock thresholds `[1,2,4,6,8]` do not match frontend `[1,21,41,61,81]`. The frontend value governs which zones are shown as locked on the prep screen; the backend value is a secondary check. These must be reconciled.

**Assessment:** System operational but backend cap (10) and frontend unlock levels (21/41/61/81) are inconsistent — the frontend gating is stricter than the backend.

---

### 18. Zone System

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:468–484](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L468)

**5 zones:**
| Zone | Name | HP Mult | Dmg Mult | Account Lv (backend) | Account Lv (frontend) |
|---|---|---|---|---|---|
| 1 | Hollow | 1.0× | 1.0× | 1 | 1 |
| 2 | Brave | 1.5× | 1.4× | 2 | 21 |
| 3 | Awakened | 2.2× | 2.0× | 4 | 41 |
| 4 | Exalted | 3.2× | 2.8× | 6 | 61 |
| 5 | Ascendant | 4.5× | 3.8× | 8 | 81 |

**Mob aura tiers** (render only, same sprite): Hollow=none, Brave=green glow, Awakened=blue aura, Exalted=purple aura, Ascendant=orange-gold aura.

**Notes:** Zone multipliers apply on top of run-time scaling. Sigil level ranges also map 1:1 to zone index.

**Assessment:** Zone multipliers and aura tiers complete; unlock gating has backend/frontend mismatch (see System 17).

---

### 19. Daily Contracts System

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:509–522](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L509)
- [home-page.component.ts](frontend/src/app/pages/home/home-page.component.ts) (daily modal)

**Key constants:**
```
DailyContractCount          = 3
KaerosRewardPerContract     = 20
AccountXpRewardPerContract  = 80
```

**Contract types (6):**
`complete_run`, `reach_run_level`, `kill_count`, `open_chests`, `kill_elites`, `daily_element_run`

**Notes:** Resets at 00:00 UTC. At least one contract is tied to the active daily element. Home Hub widget auto-rotates every 5s, suspends 12s after manual interaction. Contracts are deterministic per account per UTC day.

**Assessment:** Fully implemented including the daily element integration.

---

### 20. Bestiary System

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:486–507](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L486)
- [InMemoryBattleStore.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (bestiary kill tracking)
- [bestiary-page.component.ts](frontend/src/app/pages/bestiary/bestiary-page.component.ts)

**Rank thresholds:** `[0, 10, 30, 60, 100]` kills → Ranks 1–5

**Species tracked:** 13 normal + 4 elite + 3 boss = **20 total**

**Notes:** Kills tracked per species on `AccountState`. Species chests trigger at total-kills thresholds (first at 150±30, then +300±50 each). `runStartBestiaryKills` captured at `beginNewRun()` for run-delta calculation. Loot discovery tracked per character per species. Bestiary now lives as a tab under the Kaelis page, not a top-level route. Ascendant unlock condition evaluated after every drop award.

**Assessment:** Kill tracking, rank system, species chests, and Ascendant conditions all functional.

---

### 21. Character System

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:1122–1128](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L1122)
- [characters-page.component.ts](frontend/src/app/pages/characters/characters-page.component.ts)

**3 playable characters:** Mirai (`character:mirai`), Sylwen (`character:sylwen`), Velvet (`character:velvet`)

**Character attributes:** Name, CharacterId, MasteryLevel, MasteryXp, Equipment (weapon, armor), Inventory, AscendantSigilSlotsUnlocked.

**Frontend roster order:** Fixed: Mirai → Sylwen → Velvet. Active character defaults to `character:mirai`.

**Notes:** Art remapping by ID: `character:mirai` uses former Kaelis Vex art; `character:velvet` uses former Kaelis Dawn art; Sylwen unchanged. Selecting active character on Characters page carries into Arena start via `playerId`.

**Assessment:** 3-character roster fully implemented; legacy characters have been removed.

---

### 22. Kaeros Currency

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:196–197, 509–513](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L196)

**Sources only:**
- Daily contracts: 20 Kaeros × up to 3/day = 60/day max
- Mastery milestones (per milestone): `[30, 40, 50, 60, 100]`

**Not from:** Mob kills, chest opens, or any baseline run rewards.

**Assessment:** Kaeros economy matches README — contract + milestone gating enforced.

---

### 23. Echo Fragments Currency

**Status:** DONE

**Primary files:**
- [ArenaConfig.cs:198, 407](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs#L198)

**Sources:**
- Mastery milestones: `[200, 350, 500, 700, 1000]` per milestone
- Mimic kill bonus: `MimicConfig.EchoFragmentsBonusDrop = 40`

**Notes:** Displayed on Bestiary tab header. Used for crafting/progression (full spending logic not fully visible in scanned files).

**Assessment:** Currency sourcing is implemented; spending/crafting pipeline not fully audited.

---

### 24. Ranged Weapon Infrastructure

**Status:** PARTIAL (LOS stubbed)

**Primary files:**
- [InMemoryBattleStore.RangedHelpers.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.RangedHelpers.cs)
- Frontend: [ProjectileAnimator](frontend/src/app/pages/arena/) (within arena engine)

**Key constants:**
```
AutoAttackRangedMaxRange        = 7 (Chebyshev)
RangedProjectileSpeedTiles      = 10.0 tiles/s
RangedDefaultCooldownMs         = 800ms
ShotgunKnockbackTiles           = 1
ShotgunVisualProjectileCount    = 5
VoidRicochetMaxBounces          = 3
VoidRicochetMaxTotalTiles       = 40
```

**Active ranged weapons:** SigilBolt, Shotgun, VoidRicochet (Sylwen), plus character skill projectiles (WhisperShot, GalePierce, RendClaw, VoidChain, UmbralPath, DeathStrike).

**Stub:** `HasLineOfSight()` always returns `true` — LOS check is fully stubbed pending destructible obstacles.

**Events:** `ranged_projectile_fired` (`RangedProjectileFiredEventDto`) and `mob_knocked_back` (`MobKnockedBackEventDto`) fully defined and emitted.

**Assessment:** Ranged infrastructure is solid; LOS is an intentional stub with documented activation condition.

---

### 25. Run Telemetry / RunResultLogger

**Status:** DONE

**Primary files:**
- [run-result-logger.ts](frontend/src/app/shared/) (exact path: `frontend/src/app/shared/run-results/run-result-logger.ts`)

**Fields captured:** battleSeed, stepDeltaMs, duration, endReason, runLevelFinal, xpTotalGained, killsTotal, eliteKills, chestsOpened, cardsChosen (ordered), damageDealtTotal, damageTakenTotal, healingDoneTotal, playerMinHp, playerMaxHpObserved, echoFragmentsDelta, itemsAwarded, speciesCores, pacing telemetry (timeToFirstDamage, timeToFirstElite, peakSimultaneousMobs, etc.), lowHp windows.

**Storage:** IndexedDB (`kaezan_run_results_v1`), cap = 30 runs.

**Notes:** `runPlayerMinHp` is captured via `RunResultLogger.finalizeIfEnded()` → `tryFinalizeRunResult()`. Backend persistence is absent; all analytics are client-side.

**Assessment:** All key fields captured as documented; 30-run client-side cap is the only limitation.

---

### 26. Replay System

**Status:** DONE

**Primary files:**
- [InMemoryBattleStore.Replay.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.Replay.cs)
- [BattleV1Controller.cs](backend/src/KaezanArena.Api/Controllers/BattleV1Controller.cs) (export/import endpoints)

**Replay format (`BattleReplayDto`):** seed, arenaId, playerId, actions[] where each action is either `step` (clientTick, stepCount, commands[]) or `choose_card`.

**Commands captured:** type, skillId, dir, targetEntityId, paused, groundTileX, groundTileY, poiId, assistConfig.

**Endpoints:** `POST /api/v1/battle/replay/export`, `POST /api/v1/battle/replay/import`

**Notes:** Import re-runs action timeline deterministically. Frontend exposes Export/Import/Play under a collapsed `<details>` in the Run Results overlay (`[DEV]` disclosure). Replays do not alter economy.

**Assessment:** Full replay pipeline implemented; determinism validated via seed + command timeline.

---

### 27. Run Results Screen

**Status:** DONE

**Primary files:**
- [arena-page.component.ts](frontend/src/app/pages/arena/arena-page.component.ts) (post-run overlay rendered when `isRunEnded`)
- [run-result-logger.ts](frontend/src/app/shared/)

**Sections:**
- **A** — Outcome header: VICTORY (teal) or DEFEAT (coral), subtitle reason, inline meta (duration, level, kills, elites)
- **B** — Key stats grid: Kills, Elites, DamageDealt, DamageTaken, MinHP, XPGained, EchoFragments, PrimalCore; conditional Chests/Equipment tiles
- **C** — Build summary: card pills (hidden when no cards)
- **D** — Bestiary Progress: top-3 species by kills delta; NEW RANK pills
- **Actions:** "RUN AGAIN" / "EXIT TO PREP"
- **[DEV]** collapsed `<details>`: Export/Import/Play Replay, Copy JSON, Export Runs

**Notes:** All data from existing component properties; `runPlayerMinHp` reset alongside other run counters. Bestiary delta = `bestiaryEntry.killsTotal − runStartBestiaryKills[species]`.

**Assessment:** Post-run screen complete with all documented sections.

---

### 28. Simulation Invariants

**Status:** DONE

**Primary files:**
- [InMemoryBattleStore.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (`ValidateInvariants`)

**Enforced invariants:**
- Grid bounds: `IsInBounds()` — x ∈ [0, 6], y ∈ [0, 6]
- One entity per tile: `IsWalkableTile()` — no two actors on same tile
- HP ≥ 0: clamped in damage application (`Math.Max(0, ...)`)
- Shield ≥ 0: clamped
- HP ≤ maxHp: clamped

**Notes:** ValidateInvariants runs after each tick. Violations are logged/thrown as simulation errors.

**Assessment:** All five invariants enforced; runs after every tick.

---

### 29. Deterministic RNG

**Status:** DONE

**Primary files:**
- [InMemoryBattleStore.RngStreams.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.RngStreams.cs)
- [InMemoryBattleStore.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs) (seed generation)

**4 independent RNG streams:** `battleRng` (general), `poiRng` (POI spawns), `bestiaryRng` (bestiary drops), `critRng` (crit rolls). Each seeded from the battle seed.

**Seed generation:** SHA256-based hash of start parameters (`DeterministicSeed.FromParts`).

**Daily element:** Derived from `DateOnly.FromDateTime(DateTime.UtcNow)` — only UTC date, no game-tick time.

**Notes:** No real-world time enters gameplay simulation. Deterministic neighbour order for mob movement: `[Up, UpRight, Right, DownRight, Down, DownLeft, Left, UpLeft]` (fixed array).

**Assessment:** Full deterministic RNG with four isolated streams; replay validation is the primary audit mechanism.

---

### 30. Frontend Rendering Pipeline

**Status:** DONE

**Primary files:**
- [canvas-layered-renderer.ts](frontend/src/app/pages/arena/) (within arena render folder)
- [arena-engine.ts](frontend/src/app/pages/arena/) (within arena engine folder)
- [arena-page.component.ts](frontend/src/app/pages/arena/arena-page.component.ts) (~5,000-line god component)

**Render layers (5, Canvas2D):** `ground` → `groundFx` → `actors` → `hitFx` → `ui`

**Game loop:** RAF → `delta = clamp(Δt, 0, 250ms)` → accumulator → while accumulator ≥ 16.67ms: `runSimulationStep()` → `engine.update()` (max 8 steps/frame) → `CanvasLayeredRenderer.render()`.

**Scene graph:** tiles[], sprites[], actorsById (Map), skillsById, decals[], damageNumbers[], fxInstances[], attackFxInstances[].

**Notes:** All gameplay simulation on main thread. Asset lazy-load on first render (pop-in risk). `ArenaPageComponent` is a ~5,000-line god component (noted concern in `ARCHITECTURAL_MAP.md`).

**Assessment:** Rendering pipeline fully functional; god-component coupling is a known architectural concern.

---

### 31. HTTP Polling / Batch Step

**Status:** DONE

**Primary files:**
- [BattleV1Controller.cs](backend/src/KaezanArena.Api/Controllers/BattleV1Controller.cs)
- [battle-api.service.ts](frontend/src/app/)

**Endpoint:** `POST /api/v1/battle/step`

**Request fields:** BattleId, ClientTick (optional), StepCount (1–16), Commands[]

**Batch step logic:** Commands apply only on the final sub-tick; all prior sub-ticks run empty. `MaxBatchStepCount = 16`.

**Notes:** Currently `stepCount=1` per tick (4 req/s at 250ms). No WebSocket or SignalR. `battleRequestInFlight` flag prevents concurrent requests; loot awarding is fire-and-forget after each step response to prevent game-loop stalls.

**Assessment:** Polling pipeline complete; HTTP-per-tick latency bound is a known medium-severity architectural concern.

---

### 32. ArenaConfig.cs

**Status:** DONE

**File:** [ArenaConfig.cs](backend/src/KaezanArena.Api/Battle/ArenaConfig.cs) (1,377 lines)

**Centralized in ArenaConfig:** Grid dimensions, player stats, skill cooldowns, skill damage values, mob configs (all 13 normal + 4 elite archetypes), boss configs, zone multipliers, spawn pacing, card caps, elemental system, elemental arena definitions, sigil system, mastery config, bestiary rank thresholds, contract config, mimic config, boss config, FX IDs, all stable entity IDs and display names.

**Frontend-local constants (acceptable):** FX animation durations in `arena-engine.ts` (visual-only, non-gameplay), projectile tint colors read from ArenaConfig via generated API client.

**No backend hardcoding violations detected.**

**Assessment:** ArenaConfig is the single authoritative source for all backend gameplay constants.

---

### 33. Home Hub

**Status:** DONE

**Primary files:**
- [home-page.component.ts](frontend/src/app/pages/home/home-page.component.ts)
- [home-main-navigation.component.ts](frontend/src/app/pages/home/components/home-main-navigation/home-main-navigation.component.ts)
- [home-top-left-hud.component.ts](frontend/src/app/pages/home/components/home-top-left-hud/home-top-left-hud.component.ts)
- [home-top-right-actions.component.ts](frontend/src/app/pages/home/components/home-top-right-actions/home-top-right-actions.component.ts)
- [home-character-stage.component.ts](frontend/src/app/pages/home/components/home-character-stage/home-character-stage.component.ts)

**Components confirmed:** Navigation rail (Arena / Kaelis / Backpack / Recruit), top-right utilities (Mail / Daily / Settings / Event), Daily Contracts modal (3 contracts, daily element widget, auto-rotates 5s, 12s suspension on manual), active Kaelis summary, account progress.

**Notes:** 4 elemental arena cards displayed, clicking navigates to `/arena?arenaId=<id>`. Background has 3 themes (Void, Crimson, Azure). "Today's Element" highlighted with tooltip and counter-element guidance.

**Assessment:** Home Hub fully implemented with all documented sections.

---

### 34. Arena Prep Route

**Status:** DONE

**Primary files:**
- [arena-prep-page.component.ts](frontend/src/app/pages/arena-prep/arena-prep-page.component.ts)

**Route:** `/arena-prep`

**Features confirmed:** Zone selection (5 zones, unlock levels `[1, 21, 41, 61, 81]` from frontend constant, persisted in localStorage), last run summary (level, damage, kills, chests, duration, end reason), compact active Kaelis summary (portrait, level, mastery), Start Run CTA (routes to `/arena` with selected zoneIndex and playerId), equipment display (weapon + element, armor).

**Notes:** Also contains elemental arena cards. Zone selection key: `kaezan_zone_selection_v1` in localStorage.

**Assessment:** Arena Prep route complete with all documented pre-run features.

---

### 35. Account State Persistence

**Status:** DONE

**Primary files:**
- [JsonFileAccountStatePersistence.cs](backend/src/KaezanArena.Api/Account/JsonFileAccountStatePersistence.cs)
- [IAccountStatePersistence.cs](backend/src/KaezanArena.Api/Account/IAccountStatePersistence.cs)

**Storage format:** One JSON file per account. File name: `{sanitizedAccountId}.{SHA256[0:12]}.json`.

**Data structure (`PersistedAccountData`):** `State` (AccountStateDto) + `AwardedBySourceKeyByCharacter` (Dict of awarded drops per source key, used for idempotent awarding).

**Write strategy:** Atomic — write to `.tmp` file, then `File.Move` with overwrite. Thread-safe via `lock(_sync)`.

**Configuration:** Default path `backend/src/KaezanArena.Api/.data/accounts`; override via `AccountState:StorageDirectory` in config/env. `Path.GetFullPath()` applied.

**Notes:** On startup, if directory or files are missing, backend seeds accounts in memory. `LoadAll()` normalises blank accountId to `"dev_account"`.

**Assessment:** JSON persistence is production-grade with atomic writes and thread safety.

---

## Summary Table

| # | System | Status | Primary File(s) |
|---|--------|--------|-----------------|
| 1 | Arena / Grid | DONE | ArenaConfig.cs:10–13, MovementRules.cs |
| 2 | Tick System | DONE | ArenaConfig.cs:7–9, InMemoryBattleStore.cs |
| 3 | Player | DONE | ArenaConfig.cs:18–35 |
| 4 | Auto-attack / Assist | DONE | InMemoryBattleStore.cs (assist evaluation) |
| 5 | Weapon Kit System | DONE | ArenaConfig.cs:984–1157 |
| 6 | Skill System | DONE | ArenaConfig.cs:137–166, SkillLeveling.cs |
| 7 | Ultimate Slot | DONE | ArenaConfig.cs:168–174, InMemoryBattleStore.cs |
| 8 | Card System | DONE | InMemoryBattleStore.cs (CardPool), ArenaConfig.cs:635 |
| 9 | Chest / POI System | DONE | InMemoryBattleStore.PoiSystem.cs, ArenaConfig.cs:756 |
| 10 | Enemy Spawn System | DONE | InMemoryBattleStore.ScalingAndDamage.cs:7–33 |
| 11 | Elite System | DONE | InMemoryBattleStore.EliteCommanderSystem.cs |
| 12 | Combat / Damage Pipeline | DONE | InMemoryBattleStore.ScalingAndDamage.cs |
| 13 | Elemental System | DONE | ArenaConfig.cs:524–615 |
| 14 | Elemental Arenas | DONE | ArenaConfig.cs:552–583 |
| 15 | Sigil System | PARTIAL | ArenaConfig.cs:205–398 (Brave–Ascendant tiers: NOT_STARTED) |
| 16 | Mastery System | PARTIAL | ArenaConfig.cs:176–203 (slot unlock schedule mismatch) |
| 17 | Account Level System | DONE | ArenaConfig.cs:468–484 (backend/frontend mismatch) |
| 18 | Zone System | DONE | ArenaConfig.cs:468–484 |
| 19 | Daily Contracts | DONE | ArenaConfig.cs:509–522 |
| 20 | Bestiary System | DONE | ArenaConfig.cs:486–507, InMemoryBattleStore.cs |
| 21 | Character System | DONE | ArenaConfig.cs:1122–1157 |
| 22 | Kaeros Currency | DONE | ArenaConfig.cs:196, 509 |
| 23 | Echo Fragments | DONE | ArenaConfig.cs:198, 407 |
| 24 | Ranged Infrastructure | PARTIAL | InMemoryBattleStore.RangedHelpers.cs (LOS=STUB) |
| 25 | Run Telemetry | DONE | run-result-logger.ts |
| 26 | Replay System | DONE | InMemoryBattleStore.Replay.cs, BattleV1Controller.cs |
| 27 | Run Results Screen | DONE | arena-page.component.ts (post-run overlay) |
| 28 | Simulation Invariants | DONE | InMemoryBattleStore.cs (ValidateInvariants) |
| 29 | Deterministic RNG | DONE | InMemoryBattleStore.RngStreams.cs |
| 30 | Frontend Rendering | DONE | canvas-layered-renderer.ts, arena-engine.ts |
| 31 | HTTP Polling / Batch Step | DONE | BattleV1Controller.cs, battle-api.service.ts |
| 32 | ArenaConfig.cs | DONE | ArenaConfig.cs (1,377 lines) |
| 33 | Home Hub | DONE | home-page.component.ts + sub-components |
| 34 | Arena Prep Route | DONE | arena-prep-page.component.ts |
| 35 | Account State Persistence | DONE | JsonFileAccountStatePersistence.cs |

---

## Undocumented Findings

Significant code findings not mentioned anywhere in README.md:

### Mimic System
- **File:** [InMemoryBattleStore.MimicSystem.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.MimicSystem.cs)
- Normal chest spawn has a **20% chance** of becoming a dormant mimic (`PoiTypeMimicDormant`) instead.
- Mimic stats: HP=60, AutoAttackDamage=3, AutoAttackCooldownMs=1200.
- Killing a mimic awards `EchoFragmentsBonusDrop = 40` bonus Echo Fragments.
- `MaxActiveMimics = 1` (only one mimic active at a time).
- Not mentioned anywhere in README.

### Boss System
- **File:** [InMemoryBattleStore.BossSystem.cs](backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.BossSystem.cs)
- 3 bosses defined in `BossConfig.Bosses`:
  - **The Demon Lord** — HP 400, Zones [1,2], Fire element, weak to Ice
  - **Plague Titan** — HP 500, Zones [3,4], Earth element, weak to Fire
  - **The Ascendant** — HP 350, Zone [5], Energy element, weak to Physical
- Boss spawns at `BossConfig.SpawnTimeSeconds = 165` (2:45 into the run).
- Boss spawn pauses normal mob spawns for `SpawnPauseDurationMs = 5,000ms`.
- Boss has `PhysicalResistance = 0.70f` (takes only 70% of physical damage).
- Killing the boss triggers `RunEndReasonVictoryBoss` victory condition.
- README documents win conditions but does not describe the boss system or its zone routing.

### Arena Select Page
- **File:** [arena-select-page.component.ts](frontend/src/app/pages/arena-select/arena-select-page.component.ts)
- A separate `/arena-select` route exists alongside `/arena-prep`. Its relationship to the prep flow is not documented in README.

### Legacy Exori/Heal/Guard Constants Still Present
- `ExoriCooldownTotalMs`, `ExoriMasCooldownTotalMs`, `ExoriMinCooldownTotalMs`, `HealCooldownTotalMs`, `GuardCooldownTotalMs`, and their corresponding weapon IDs / display names all remain in `ArenaConfig.cs`.
- These are holdovers from the pre-character-kit skill system. Heal and Guard are still in `WeaponIds` and `DisplayNames` despite being removed from all kits.
- No current character kit references them for active combat, but they remain as potential dead code.

### Several Mob Abilities Have 99999ms Cooldown (Effectively Disabled)
- MeleeSkeleton, MeleeTinyZombie, MeleeSlug, EliteMaskedOrc, ElitePumpkinDude, EliteDoc, EliteIceZombie all have `AbilityCooldownMs = 99999`.
- These mobs have damage values and ranges defined for their abilities but will never actually cast them in a run. Ability scaffolding exists but is placeholdered.

### `RunMidgameTargetMs` Constant
- `RunMidgameTargetMs = RunDurationMs / 2 = 90,000ms` exists in `ArenaConfig.cs:16` but its usage in pacing is not explicitly described in README.

### `AntiRangedPressure` Player Buff
- `AntiRangedPressureBuffId` and `AntiRangedPressureReductionPercent = 20%` reduce incoming ranged damage by 20% when the buff is active.
- This buff is referenced in the damage pipeline but its source (what activates it) is not documented in README.

### `PlayerShieldGainPerAction = 2`
- Player gains 2 shield points per offensive action (documented in ArenaConfig but not in README's player stats section).

### Frontend RNG Streams Architecture
- 4 separate `System.Random` instances seeded from the battle seed, ensuring different gameplay subsystems (general, POI, bestiary, crit) never share RNG state. This prevents RNG coupling between systems when one system's consumption changes.

### `InitialChestSpawnCheckAtMs = 45,000ms`
- First chest eligibility check is at 45 seconds (not at run start). Subsequent checks are every 65 seconds. Not stated in README.

### Zone-Driven Sigil Level Ranges
- Zone index maps directly to sigil tier level range (Zone 1 → Hollow Lv 1–20, Zone 5 → Ascendant Lv 81–95). Sigil drops from runs in higher zones produce higher-level sigils. This mechanic is not explicitly described in README.

### `VoidRicochetMaxTotalTiles = 40`
- Void Ricochet has a hard cap of 40 total tiles traversed (all bounce segments combined), preventing infinite ricochet loops. Not mentioned in README.

---

*This document was generated by a full codebase scan. For architectural concerns, see [ARCHITECTURAL_MAP.md](ARCHITECTURAL_MAP.md).*
