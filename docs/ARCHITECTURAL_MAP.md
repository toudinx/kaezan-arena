Kaezan Arena — Architectural Map
1. Battle Simulation Loop
Files: InMemoryBattleStore.cs (main, ~4300 lines) + 12 partial files (TickProcessingHelpers, TickCommandProcessingHelpers, SnapshotMapping, etc.)

Data flow per tick:


Client POST /step → StepBattle() → acquire lock →
  Phase 1: Cooldown countdowns (skills, GCD, move, mob combat)
  Phase 2: World state (TickPois, TickBuffs, EliteCommanderBuffs)
  Phase 3: Player input (no movement — player fixed at 3,3; targeting commands only)
  Phase 4: Mob behavior (TickMobMovement, TickMobCommitWindows)
  Phase 5: Decal cleanup
  Phase 6: Command resolution (targeting, assist auto-cast — all skills fire via assist)
  Phase 7: Combat (player AA → life leech → mob abilities → mob AAs → respawns)
→ Build BattleSnapshot → return JSON

Batch step support: StepBattle accepts optional stepCount (1–16). Currently MAX_TICK_DEBT=0, so frontend always sends stepCount=1. Higher values reduce HTTP request frequency.

Key classes: InMemoryBattleStore (orchestrator), StoredBattle (all mutable state), StoredActor (entity: position/hp/shield/facing), MobSlotState (mob slot lifecycle), BattleSnapshot (immutable DTO to client), IBattleStore (public contract).

Coupling issues:

God class: main file alone is ~4300 lines; the 7-phase tick order is implicit and order-dependent
Thread safety: single state.Sync lock guards all mutation; collections passed by reference through helpers
2. Spawn System
Files: InMemoryBattleStore.cs (TrySpawnMobInSlot, TickMobRespawns, BuildMobSlots), InMemoryBattleStore.ScalingAndDamage.cs (ResolveSpawnPacingDirector), InMemoryBattleStore.PoiSystem.cs (SummonMobsAroundPlayer)

Data flow:

StartBattle() → BuildMobSlots() → spawn up to EarlyMobConcurrentCap (6)
Every tick: TickMobRespawns() → decrements RespawnRemainingMs (750ms) → when 0: ResolveSpawnPacingDirector() checks cap → TrySpawnMobInSlot()
TrySpawnMobInSlot(): free tile at Chebyshev dist 2–4 from player → elite roll (25–90%) → scaled HP → MaintainEliteCommanderBuffs() if elite
Altar interaction: SummonMobsAroundPlayer() → sets RespawnRemainingMs = 0, spawns immediately
Archetype cycle: MeleeBrute → RangedArcher → MeleeDemon → RangedShaman (deterministic per slot)

Coupling issues: Elite buff management (apply/remove) tightly coupled to spawn and death; pacing director mixes time- and kill-based signals in one function

3. Combat / Damage System
Files: InMemoryBattleStore.cs (ApplyDamageToMob/Player, ApplyPlayerAutoAttack, ApplyMobAutoAttacks, ApplyMobAbilities), InMemoryBattleStore.ScalingAndDamage.cs (RollDamageForAttacker, ResolveScalingDirectorV2, ApplyOutgoingDamageModifiers)

Player → Mob pipeline:


Find target (Chebyshev ≤1) → ApplyOutgoingDamageModifiers (flat+%+DamageBoostBuff)
→ RollDamageForAttacker (0.90–1.10x variance) → ResolveHitKind (20% crit via CritRng)
→ ApplyDamageToMob → shield absorbs first → HP reduced
→ On death: remove from actors, start 750ms respawn, bestiary kill, XP grant, DeathEvent
→ ApplyPlayerFlatHpOnHit + GrantPlayerShield (+5) → ApplyPlayerLifeLeech
Mob → Player pipeline:


CanAutoAttack() per archetype → RollDamageForAttacker (0.85–1.15x)
→ ApplyDamageToPlayer → AntiRangedPressureBuff (−20% ranged) → shield → HP
→ On death: Kina reflect passive → RunEnded
Scaling: normalHpMult = lerp(1.0→3.2, t), normalDmgMult = lerp(1.0→2.6, t), elite ×1.35 HP / ×1.30 dmg, applied at spawn time only.

Coupling issues: Kina reflect nested in damage path (player takes damage → reflects → mob takes damage); life leech passed as ref through 5+ methods; all player base stats hardcoded

4. Skill System
Files: InMemoryBattleStore.cs (TryExecutePlayerSkillCast, ApplyAreaSquareSkill, ApplyFrontalMeleeSkill, EvaluateCombatAssist), InMemoryBattleStore.SkillLeveling.cs (cooldown formulas, upgrade order)

6 skills defined in ArenaConfig.cs: Exori (sq r=1, 10dmg, 1200ms), Exori Mas (diamond r=2, 7dmg, 2000ms), Exori Min (frontal, 15dmg, 800ms), Avalanche (ground sq, 3dmg, 2500ms), Heal (22% maxHp, 7000ms), Guard (10% maxHp shield, 10000ms)

Starting skills (from run start): Exori Min, Heal, Guard.
Unlockable via level-up skill cards: Exori, Exori Mas, Avalanche.

Cast pipeline (all via assist — no manual casting):


Assist evaluates each tick → defensive (Guard → Heal) → offensive (Avalanche→ExoriMas→Exori→ExoriMin)
→ Validate cooldowns (skill + GCD) → route by skillId (switch-case)
→ AoE: build tile set → ApplyDamageToMob per mob in shape
→ Heal/Guard: modify player HP/shield
→ ApplyPlayerCooldownsForCast() → set skill + GCD cooldown
Leveling: upgradeIndex = (runLevel-1) % 6 → fixed order: Heal→Guard→Exori→ExoriMin→ExoriMas→Avalanche. Each level −4% cooldown; passive cards add GlobalCooldownReductionPercent (max −60%).

Assist trigger thresholds (configurable):

Guard fires when HP < 60% (AssistDefaultGuardAtHpPercent)
Heal fires when HP < 40% (AssistDefaultHealAtHpPercent)
Max 1 auto-cast/tick (AssistDefaultMaxAutoCastsPerTick)

Coupling issues: Skills are switch-case (not polymorphic); adding a skill requires editing the switch; assist system mixed into combat resolution phase

5. Card / Chest System
Files: InMemoryBattleStore.cs (CardPool array, TryOfferCardChoice, RollCardOffer, CanOfferCard, ApplyCardEffects, ChooseCard), InMemoryBattleStore.PoiSystem.cs (chest interaction triggers card offer)

Card structure: CardDefinition { Id, RarityWeight (30–110), MaxStacks (1 for skill cards, 3 for passive cards), ScalingParams, Effects { FlatDamageBonus, PercentDamageBonus, PercentAttackSpeedBonus, PercentMaxHpBonus, FlatHpOnHit, GlobalCooldownReductionPercent }, IsSkillCard, SkillId }. Pool: 18 passive cards + 3 skill cards (Exori, Exori Mas, Avalanche), 1 incompatible pair.

Two offer sources — CardOfferSource enum:

CardOfferSource.LevelUp: offers skill cards (if skill not yet owned) + passive cards
CardOfferSource.Chest: offers passive cards only (skill cards excluded via CanOfferCard)

Passive card caps enforced by CanOfferCard:

MaxDistinctPassiveCards = 4 (max 4 distinct passive types per run)
MaxStacks per card = 3

Flow:


Level-up OR Chest opened → TryOfferCardChoice(source):
  Guard (no pending, <12 total) → RollCardOffer(source) (weighted random 3)
  → PendingCardChoice created → battle PAUSED → CardChoiceOfferedEvent

ChooseCard(): validate → ApplyCardEffects() → stack scaling (100% / 75–90%)
  → if IsSkillCard: add skill to state.Skills → skill immediately usable via assist
  → mutates PlayerModifiers immediately → recalculates all skill cooldowns
  → clears PendingCardChoice → battle resumes
Chest spawn: Normal chest every 65s (90% chance, max 3/run, 10s lifetime, left-click to open); species chest on bestiary threshold (150–180 kills first, +300–350 after); altar every 9s (35%, 1 active max, left-click to activate).

Coupling issues: Card pool hardcoded inline; species chest blocked if any normal chest POI active; card selection immediately mutates cooldowns mid-run

6. Movement System
Files: InMemoryBattleStore.MovementRules.cs (mob pathfinding), InMemoryBattleStore.cs (TickMobMovement)

Player movement: NONE. Player is fixed at tile (3,3). The move_player command type still exists in the protocol but is not sent by the frontend.

Mob pathfinding approach: Greedy 1-step lookahead only. BuildGreedyStepCandidates() generates 1–2 candidates based on delta direction; IsWalkableTile() checks bounds + occupancy; no A*, no BFS.

Mob movement:

Melee: TryGetFirstWalkableGreedyStepTowardTarget() (approach toward player at center)
Ranged: TryChooseRangedBandMove() → approach if dist≥4, retreat if dist≤1, TryGetFirstWalkableBandOrbitStep() to maintain dist 2–3
Deterministic neighbor order: [Up, UpRight, Right, DownRight, Down, DownLeft, Left, UpLeft]

Coupling issues: Mobs can get stuck behind each other (no resolution); ranged orbit has no AoE avoidance

7. Telemetry / Event System
Files (backend): BattleEventDto.cs (base + 28 derived event records); emission is inline throughout all partial files.

28 event types: FxSpawn, DamageNumber, AttackFx, HealNumber, Reflect, Death, BuffApplied, AssistCast, PoiInteracted, InteractFailed, AltarActivated, SpeciesChestSpawned/Opened, CardChoiceOffered, CardChosen, EliteSpawned, EliteBuff Applied/Removed, EliteDied, LevelUp, XpGained, CritText, RunEnded.

Flow:


Any system → events.Add(new XxxEventDto(...))
All events collected per tick → BattleSnapshot.Events → JSON to client
→ ArenaEngine.applyBattleStep() processes events (visuals, HUD)
→ RunResultLogger.recordStep() accumulates metrics → localStorage (max 30 runs)
Frontend RunResultLogger (run-result-logger.ts): tracks seed, duration, end reason, final level, XP, kills, chests, cards chosen (ordered), min/max HP/shield, damage dealt/taken/healed, drops, species cores.

Coupling issues: No backend persistence (all analytics client-side); no event bus (finding all emitters requires grep); no sampling (large run = large event list per tick)

8. Frontend Rendering Pipeline
Files: arena-page.component.ts (~5000 lines), arena-engine.ts, arena-engine.types.ts, canvas-layered-renderer.ts

Game loop (fixed timestep):


animationLoop(RAF) → delta = clamp(Δt, 0, 250ms)
→ accumulator += delta
→ while accumulator ≥ 16.67ms: runSimulationStep() → engine.update()
   [max 8 steps/frame, prevents spiral of death]
→ CanvasLayeredRenderer.render() [async, after simulation]
Scene graph (ArenaScene): tiles[], sprites[], actorsById (Map), skillsById, decals[], damageNumbers[], fxInstances[], attackFxInstances[]

Render layers: ground → groundFx → actors → hitFx → ui (Canvas2D)

Coupling issues: ArenaPageComponent is a ~5000-line god component (API, game loop, state, HUD, logging all colocated); assets load lazily on first render (pop-in); all processing on main thread

9. Angular-to-Backend Communication Layer
Files: battle-api.service.ts, account-api.service.ts

Protocol: REST over HTTP, vanilla fetch(), JSON. No WebSocket/SignalR — client polls every game tick.

Endpoints: POST /start, POST /step (with optional stepCount 1–16), POST /choose-card, POST /interact

Command types per step: cast_skill (not used — all via assist), interact_poi (left-click), set_target (right-click), set_ground_target, set_assist_config, pause/resume

Note: move_player command exists in protocol but is not currently sent. Player is fixed at center.

Batch step:

stepCount parameter allows sending multiple ticks per request.
MAX_TICK_DEBT = 0 currently → stepCount=1, one request per 250ms tick.
Increasing MAX_TICK_DEBT batches ticks: debt=1 → 500ms/req, debt=4 → 1.25s/req.

Backend event → DOM flow:


POST /step → BattleApiService → ArenaPageComponent.stepBattleSafe()
→ runInAngularZone() → applyBattlePayload() → ArenaEngine.applyBattleStep()
→ syncUiMetaState() → template bindings → CanvasLayeredRenderer.render()
Coupling issues: Every game tick = one HTTP round trip (latency directly caps playability); no retry/backoff on network failure; clientTick mismatch detection exists but no automatic resync

Summary: Top Architectural Concerns
Concern	Severity	Location
Backend god class (4300+ lines, 12 partials)	High	InMemoryBattleStore.cs
Frontend god component (5000+ lines)	High	arena-page.component.ts
HTTP polling per tick (latency-bound gameplay)	Medium	battle-api.service.ts
No backend analytics persistence	Medium	All of backend
Greedy pathfinding (mobs get stuck)	Medium	MovementRules.cs
Skills as switch-case (not extensible)	Medium	InMemoryBattleStore.cs
Card pool hardcoded inline	Low	InMemoryBattleStore.cs
Life leech as ref through 5+ methods	Low	Damage pipeline
Client-side analytics only (30-run cap)	Low	run-result-logger.ts

Resolved concerns:
150+ hardcoded constants	FIXED	All constants now in ArenaConfig.cs