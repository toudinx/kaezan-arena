using System.Collections.Concurrent;
using System.Threading;
using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed class InMemoryBattleStore : IBattleStore
{
    // Deterministic simulation delta per battle step.
    private const int StepDeltaMs = 250;
    private const int MobRespawnDelayMs = 750;
    private const int PlayerMoveCooldownMs = 300;
    private const int PlayerAutoAttackCooldownMs = 800;
    private const int PlayerGlobalCooldownMs = 400;
    private const int PlayerBaseHp = 120;
    private const int MobSpawnRingMinDistance = 2;
    private const int MobSpawnRingMaxDistance = 4;
    private const int EarlyMobConcurrentCap = 6;
    private const int EarlyMobConcurrentCapDurationMs = 75000;
    private const int RangedPreferredDistanceMin = 2;
    private const int RangedPreferredDistanceMax = 3;
    private const int RangedApproachDistance = 4;
    private const int RangedCommitWindowTicks = 2;
    private const int PlayerAutoAttackDamage = 3;
    private const int PlayerShieldGainPerAction = 5;
    private const int PlayerLifeLeechPercent = 30;
    private const double PlayerDamageVarianceMinMultiplier = 0.90d;
    private const double PlayerDamageVarianceMaxMultiplier = 1.10d;
    private const double MobDamageVarianceMinMultiplier = 0.85d;
    private const double MobDamageVarianceMaxMultiplier = 1.15d;
    private const int CriticalHitChancePercent = 20;
    private const int CritTextDurationMs = 800;
    private const string CritTextLabel = "CRIT!";
    private const int MeleeSwingDurationMs = 120;
    private const int RangedProjectileDurationMs = 220;
    private const int DeathBurstDurationMs = 320;
    private const int CorpseDecalLifetimeMs = 1200;

    private const string ExoriSkillId = "exori";
    private const string ExoriMasSkillId = "exori_mas";
    private const string ExoriMinSkillId = "exori_min";
    private const string HealSkillId = "heal";
    private const string GuardSkillId = "guard";
    private const string AvalancheSkillId = "avalanche";
    private const string ExoriFxId = "fx.skill.exori";
    private const string ExoriMasFxId = "fx.skill.exori_mas";
    private const string ExoriMinFxId = "fx.skill.exori_min";
    private const string HealFxId = "fx.hit.small";
    private const string GuardFxId = "fx.hit.small";
    private const string AvalancheFxId = "fx.skill.exori_mas";
    // TODO(prompt20): Remove temporary skill-specific elements after validating row-based FX rendering.
    private const ElementType ExoriElement = ElementType.Fire;
    private const ElementType ExoriMasElement = ElementType.Energy;
    private const ElementType ExoriMinElement = ElementType.Ice;
    private const ElementType HealElement = ElementType.Holy;
    private const ElementType GuardElement = ElementType.Energy;
    private const ElementType AvalancheElement = ElementType.Ice;
    private const ElementType DefaultMobElement = ElementType.Physical;
    private const string MobCleaveFxId = "fx.mob.brute.cleave";
    private const string MobPowerShotFxId = "fx.mob.archer.power_shot";
    private const string MobDemonBeamFxId = "fx.mob.demon.beam";
    private const string MobDragonBreathFxId = "fx.mob.dragon.breath";
    private const int ExoriCooldownTotalMs = 1200;
    private const int ExoriMasCooldownTotalMs = 2000;
    private const int ExoriMinCooldownTotalMs = 800;
    private const int HealCooldownTotalMs = 7000;
    private const int GuardCooldownTotalMs = 10000;
    private const int AvalancheCooldownTotalMs = 2500;
    private const int AvalancheDamage = 3;       
    private const int AvalancheRangeTilesManhattan = 3;
    private const int HealPercentOfMaxHp = 22;
    private const int GuardPercentOfMaxHp = 15;
    private const int KinaReflectPercent = 20;
    private const int KinaRangedReflectMultiplier = 2;
    private const string PlayerClassKina = "kina";
    private const int RunInitialLevel = 1;
    private const int RunInitialXp = 0;
    private const int NormalMobKillXp = 10;
    private const int EliteMobKillXp = 10;
    private const int RunLevelXpBase = 25;
    private const int RunLevelXpIncrementPerLevel = 15;
    private const int MaxCardOfferCount = 3;
    private const int MaxCardSelectionsPerRun = 8;
    private const int MaxGlobalCooldownReductionPercent = 60;
    private const int RunDurationTargetSeconds = 480;
    private const long RunDurationTargetMs = RunDurationTargetSeconds * 1000L;
    private const double MobHpMultStart = 1.0d;
    private const double MobHpMultEnd = 2.2d;
    private const double MobDmgMultStart = 1.0d;
    private const double MobDmgMultEnd = 1.8d;
    private const double EliteHpMultiplierFactor = 1.25d;
    private const double EliteDmgMultiplierFactor = 1.15d;
    private const int EliteCommanderMaxBuffTargets = 3;
    private const int EliteCommanderDamageBonusPercent = 40;
    private const int EliteCommanderAttackSpeedBonusPercent = 30;

    private const string StatusStarted = "started";
    private const string StatusDefeat = "defeat";
    private const string StatusVictory = "victory";
    private const string RunEndReasonVictoryTime = "victory_time";
    private const string RunEndReasonDefeatDeath = "defeat_death";

    private const string FacingUp = "up";
    private const string FacingUpRight = "up_right";
    private const string FacingDown = "down";
    private const string FacingDownRight = "down_right";
    private const string FacingLeft = "left";
    private const string FacingRight = "right";
    private const string FacingDownLeft = "down_left";
    private const string FacingUpLeft = "up_left";

    private const string CastSkillCommandType = "cast_skill";
    private const string SetFacingCommandType = "set_facing";
    private const string MovePlayerCommandType = "move_player";
    private const string InteractPoiCommandType = "interact_poi";
    private const string SetTargetCommandType = "set_target";
    private const string SetGroundTargetCommandType = "set_ground_target";
    private const string SetAssistConfigCommandType = "set_assist_config";
    private const string SetPausedCommandType = "set_paused";

    private const string AssistReasonAutoHeal = "auto_heal";
    private const string AssistReasonAutoGuard = "auto_guard";
    private const string AssistReasonAutoOffense = "auto_offense";
    private const string AssistOffenseModeCooldownSpam = "cooldown_spam";
    private const string AssistOffenseModeSmart = "smart";
    private const int AssistDefaultHealAtHpPercent = 40;
    private const int AssistDefaultGuardAtHpPercent = 60;
    private const int AssistDefaultMaxAutoCastsPerTick = 1;

    private const string UnknownCommandReason = "unknown_command";
    private const string UnknownSkillReason = "unknown_skill";
    private const string UnknownDirectionReason = "unknown_direction";
    private const string InvalidGroundTargetReason = "invalid_ground_target";
    private const string NoTargetReason = "no_target";
    private const string OutOfRangeReason = "out_of_range";
    private const string CooldownReason = "cooldown";
    private const string GlobalCooldownReason = "global_cooldown";
    private const string MoveBlockedReason = "move_blocked";
    private const string UnknownPoiReason = "unknown_poi";
    private const string PlayerDeadReason = "player_dead";
    private const string NotStartedReason = "not_started";
    private const string DefeatReason = "defeat";
    private const string PausedReason = "paused";
    private const string AwaitingCardChoiceReason = "awaiting_card_choice";
    private const string EndReasonDeath = "death";
    private const string EndReasonTime = "time";
    private const string PoiTypeChest = "chest";
    private const string PoiTypeSpeciesChest = "species_chest";
    private const string PoiTypeAltar = "altar";
    private const string HealingAmplifierBuffId = "healing_amplifier";
    private const string AntiRangedPressureBuffId = "anti_ranged_pressure";
    private const string ThornsBoostBuffId = "thorns_boost";
    private const string DamageBoostBuffId = "damage_boost";
    private const int AltarSpawnCheckMs = 9000;
    private const int AltarSpawnChancePercent = 35;
    private const int AltarLifetimeMs = 10000;
    private const int AltarCooldownMs = 12000;
    private const int AltarSummonSpawnCount = 2;
    private const int ChestSpawnCheckMs = 7000;
    private const int ChestSpawnChancePercent = 40;
    private const int ChestLifetimeMs = 10000;
    private const int SpeciesChestLifetimeMs = 10000;
    private const int HealAmplifierDurationMs = 8000;
    private const int AntiRangedPressureDurationMs = 8000;
    private const int ThornsBoostDurationMs = 8000;
    private const int DamageBoostDurationMs = 6000;
    private const int HealAmplifierBonusPercent = 10;
    private const int AntiRangedPressureReductionPercent = 20;
    private const int ThornsBoostBonusPercent = 30;
    private const int DamageBoostBonusPercent = 25;
    private const int BestiaryFirstChestBaseKills = 10;
    private const int BestiaryFirstChestRandomInclusiveMax = 4;
    private const int BestiaryChestIncrementBaseKills = 12;
    private const int BestiaryChestIncrementRandomInclusiveMax = 6;
    private const string InitialChestPoiId = "poi.chest.0000";

    private static readonly MobArchetype[] SpawnArchetypeCycle =
    [
        MobArchetype.MeleeBrute,
        MobArchetype.RangedArcher,
        MobArchetype.MeleeDemon,
        MobArchetype.RangedDragon
    ];
    private static readonly string[] AssistOffenseSkillPriority =
    [
        AvalancheSkillId,
        ExoriMasSkillId,
        ExoriSkillId,
        ExoriMinSkillId
    ];
    private static readonly IReadOnlyDictionary<string, bool> DefaultAssistAutoSkills =
        new Dictionary<string, bool>(StringComparer.Ordinal)
        {
            [ExoriSkillId] = true,
            [ExoriMinSkillId] = true,
            [ExoriMasSkillId] = true,
            [AvalancheSkillId] = true
        };
    private static readonly IReadOnlyDictionary<MobArchetype, string> SpeciesByArchetype =
        new Dictionary<MobArchetype, string>
        {
            [MobArchetype.MeleeBrute] = "melee_brute",
            [MobArchetype.RangedArcher] = "ranged_archer",
            [MobArchetype.MeleeDemon] = "melee_demon",
            [MobArchetype.RangedDragon] = "ranged_dragon"
        };
    private static readonly IReadOnlyDictionary<string, MobArchetype> ArchetypeBySpecies =
        SpeciesByArchetype.ToDictionary(
            pair => pair.Value,
            pair => pair.Key,
            StringComparer.Ordinal);
    private static readonly IReadOnlyList<CardDefinition> CardPool =
    [
        new(
            Id: "colossus_heart",
            Name: "Colossus Heart",
            Description: "+40% max HP and +6 damage.",
            Effects: new CardEffectBundle(FlatDamageBonus: 6, PercentMaxHpBonus: 40)),
        new(
            Id: "bloodletter_edge",
            Name: "Bloodletter Edge",
            Description: "+22% damage and +2 HP on hit.",
            Effects: new CardEffectBundle(PercentDamageBonus: 22, FlatHpOnHit: 2)),
        new(
            Id: "frenzy_clockwork",
            Name: "Frenzy Clockwork",
            Description: "+35% attack speed and +8% damage.",
            Effects: new CardEffectBundle(PercentDamageBonus: 8, PercentAttackSpeedBonus: 35)),
        new(
            Id: "butcher_mark",
            Name: "Butcher Mark",
            Description: "+12 flat damage.",
            Effects: new CardEffectBundle(FlatDamageBonus: 12)),
        new(
            Id: "vampiric_spikes",
            Name: "Vampiric Spikes",
            Description: "+4 HP on hit and +10% max HP.",
            Effects: new CardEffectBundle(PercentMaxHpBonus: 10, FlatHpOnHit: 4)),
        new(
            Id: "overclocked_reflex",
            Name: "Overclocked Reflex",
            Description: "+25% global cooldown reduction and +20% attack speed.",
            Effects: new CardEffectBundle(PercentAttackSpeedBonus: 20, GlobalCooldownReductionPercent: 25)),
        new(
            Id: "warlord_banner",
            Name: "Warlord Banner",
            Description: "+18% damage and +20% max HP.",
            Effects: new CardEffectBundle(PercentDamageBonus: 18, PercentMaxHpBonus: 20)),
        new(
            Id: "titan_grip",
            Name: "Titan Grip",
            Description: "+10 flat damage and +20% attack speed.",
            Effects: new CardEffectBundle(FlatDamageBonus: 10, PercentAttackSpeedBonus: 20)),
        new(
            Id: "arcane_tempo",
            Name: "Arcane Tempo",
            Description: "+30% global cooldown reduction.",
            Effects: new CardEffectBundle(GlobalCooldownReductionPercent: 30)),
        new(
            Id: "crushing_momentum",
            Name: "Crushing Momentum",
            Description: "+16% damage and +16% attack speed.",
            Effects: new CardEffectBundle(PercentDamageBonus: 16, PercentAttackSpeedBonus: 16)),
        new(
            Id: "iron_fortress",
            Name: "Iron Fortress",
            Description: "+55% max HP.",
            Effects: new CardEffectBundle(PercentMaxHpBonus: 55)),
        new(
            Id: "executioner_oath",
            Name: "Executioner Oath",
            Description: "+30% damage.",
            Effects: new CardEffectBundle(PercentDamageBonus: 30)),
        new(
            Id: "sanguine_engine",
            Name: "Sanguine Engine",
            Description: "+3 HP on hit and +15% attack speed.",
            Effects: new CardEffectBundle(FlatHpOnHit: 3, PercentAttackSpeedBonus: 15)),
        new(
            Id: "battle_hymn",
            Name: "Battle Hymn",
            Description: "+8 flat damage and +20% global cooldown reduction.",
            Effects: new CardEffectBundle(FlatDamageBonus: 8, GlobalCooldownReductionPercent: 20))
    ];
    private static readonly IReadOnlyDictionary<string, CardDefinition> CardById =
        CardPool.ToDictionary(card => card.Id, StringComparer.Ordinal);

    private readonly ConcurrentDictionary<string, StoredBattle> _battles = new();
    private int _sequence;
    private static readonly IReadOnlyDictionary<MobArchetype, MobArchetypeConfig> MobConfigs =
        new Dictionary<MobArchetype, MobArchetypeConfig>
        {
            [MobArchetype.MeleeBrute] = new(
                MaxHp: 90,
                MoveCooldownMs: 500,
                AutoAttackRangeTiles: 1,
                AutoAttackDamage: 2,
                AutoAttackCooldownMs: 1000,
                AbilityDamage: 5,
                AbilityRangeTiles: 1,
                AbilityCooldownMs: 2500,
                AbilityFxId: MobCleaveFxId),
            [MobArchetype.RangedArcher] = new(
                MaxHp: 70,
                MoveCooldownMs: 500,
                AutoAttackRangeTiles: 4,
                AutoAttackDamage: 1,
                AutoAttackCooldownMs: 1250,
                AbilityDamage: 3,
                AbilityRangeTiles: 4,
                AbilityCooldownMs: 2800,
                AbilityFxId: MobPowerShotFxId),
            [MobArchetype.MeleeDemon] = new(
                MaxHp: 104,
                MoveCooldownMs: 500,
                AutoAttackRangeTiles: 1,
                AutoAttackDamage: 2,
                AutoAttackCooldownMs: 1000,
                AbilityDamage: 6,
                AbilityRangeTiles: 4,
                AbilityCooldownMs: 3000,
                AbilityFxId: MobDemonBeamFxId),
            [MobArchetype.RangedDragon] = new(
                MaxHp: 100,
                MoveCooldownMs: 500,
                AutoAttackRangeTiles: 4,
                AutoAttackDamage: 1,
                AutoAttackCooldownMs: 1250,
                AbilityDamage: 4,
                AbilityRangeTiles: 3,
                AbilityCooldownMs: 3600,
                AbilityFxId: MobDragonBreathFxId)
        };
    private static readonly IReadOnlyDictionary<MobArchetype, IMobBehavior> MobBehaviors =
        new Dictionary<MobArchetype, IMobBehavior>
        {
            [MobArchetype.MeleeBrute] = new MeleeBruteBehavior(),
            [MobArchetype.RangedArcher] = new RangedArcherBehavior(),
            [MobArchetype.MeleeDemon] = new MeleeDemonBehavior(),
            [MobArchetype.RangedDragon] = new RangedDragonBehavior()
        };

    public BattleSnapshot StartBattle(string arenaId, string playerId, int? seed)
    {
        var normalizedArena = string.IsNullOrWhiteSpace(arenaId) ? "arena" : arenaId.Trim();
        var normalizedPlayer = string.IsNullOrWhiteSpace(playerId) ? "player" : playerId.Trim();
        var battleIndex = Interlocked.Increment(ref _sequence);
        var battleId = $"battle-v1-{battleIndex:D4}";
        var resolvedSeed = seed ?? GenerateSeed(battleIndex);
        var battleRng = new Random(resolvedSeed);
        var poiRng = new Random(GeneratePoiSeed(resolvedSeed));
        var bestiaryRng = new Random(GenerateBestiarySeed(resolvedSeed));
        var critRng = new Random(GenerateCritSeed(resolvedSeed));
        var mobSlots = BuildMobSlots();
        var bestiary = BuildInitialBestiaryEntries(mobSlots, bestiaryRng);

        var state = new StoredBattle(
            battleId: battleId,
            arenaId: normalizedArena,
            playerActorId: normalizedPlayer,
            playerClassId: ResolvePlayerClassId(normalizedPlayer),
            seed: resolvedSeed,
            rng: battleRng,
            poiRng: poiRng,
            bestiaryRng: bestiaryRng,
            critRng: critRng,
            tick: 0,
            playerFacingDirection: FacingUp,
            battleStatus: StatusStarted,
            isRunEnded: false,
            runEndReason: null,
            runEndedAtMs: null,
            isPaused: false,
            runXp: RunInitialXp,
            runLevel: RunInitialLevel,
            totalKills: 0,
            eliteKills: 0,
            chestsOpened: 0,
            playerMoveCooldownRemainingMs: 0,
            playerAttackCooldownRemainingMs: 0,
            playerGlobalCooldownRemainingMs: 0,
            nextChestSpawnCheckAtMs: ChestSpawnCheckMs,
            nextAltarSpawnCheckAtMs: AltarSpawnCheckMs,
            nextAltarInteractAllowedAtMs: 0,
            nextPoiSequence: 1,
            lockedTargetEntityId: null,
            groundTargetTileX: null,
            groundTargetTileY: null,
            assistConfig: BuildDefaultAssistConfig(),
            actors: new Dictionary<string, StoredActor>(StringComparer.Ordinal)
            {
                [normalizedPlayer] = new StoredActor(
                    actorId: normalizedPlayer,
                    kind: "player",
                    mobType: null,
                    isElite: false,
                    buffSourceEliteId: null,
                    facingDirection: FacingUp,
                    tileX: ArenaConfig.PlayerTileX,
                    tileY: ArenaConfig.PlayerTileY,
                    hp: PlayerBaseHp,
                    maxHp: PlayerBaseHp,
                    shield: 0,
                    maxShield: ComputePlayerMaxShield(maxHp: PlayerBaseHp),
                    mobSlotIndex: null)
            },
            skills: new Dictionary<string, StoredSkill>(StringComparer.Ordinal)
            {
                [ExoriSkillId] = new StoredSkill(ExoriSkillId, cooldownRemainingMs: 0, cooldownTotalMs: ExoriCooldownTotalMs),
                [ExoriMasSkillId] = new StoredSkill(ExoriMasSkillId, cooldownRemainingMs: 0, cooldownTotalMs: ExoriMasCooldownTotalMs),
                [ExoriMinSkillId] = new StoredSkill(ExoriMinSkillId, cooldownRemainingMs: 0, cooldownTotalMs: ExoriMinCooldownTotalMs),
                [HealSkillId] = new StoredSkill(HealSkillId, cooldownRemainingMs: 0, cooldownTotalMs: HealCooldownTotalMs),
                [GuardSkillId] = new StoredSkill(GuardSkillId, cooldownRemainingMs: 0, cooldownTotalMs: GuardCooldownTotalMs),
                [AvalancheSkillId] = new StoredSkill(AvalancheSkillId, cooldownRemainingMs: 0, cooldownTotalMs: AvalancheCooldownTotalMs)
            },
            equippedWeaponElement: null,
            decals: [],
            activeBuffs: new Dictionary<string, StoredBuff>(StringComparer.Ordinal),
            pois: BuildInitialPois(),
            mobSlots: mobSlots,
            bestiary: bestiary,
            pendingSpeciesChestArchetype: null,
            playerModifiers: new PlayerModifiers(),
            pendingCardChoice: null,
            selectedCardIds: [],
            cardSelectionsGranted: 0,
            nextCardChoiceSequence: 1);

        var initialMobCap = GetMaxAliveMobsForTick(state.Tick);
        foreach (var slot in state.MobSlots.Values.OrderBy(value => value.SlotIndex))
        {
            if (slot.SlotIndex > initialMobCap)
            {
                continue;
            }

            TrySpawnMobInSlot(state, slot);
        }

        _battles[battleId] = state;
        return ToSnapshot(state, [], []);
    }

    public BattleSnapshot StepBattle(string battleId, int? clientTick, IReadOnlyList<BattleCommandDto>? commands)
    {
        if (string.IsNullOrWhiteSpace(battleId) || !_battles.TryGetValue(battleId.Trim(), out var state))
        {
            throw new KeyNotFoundException($"Battle '{battleId}' was not found.");
        }

        lock (state.Sync)
        {
            if (state.IsRunEnded)
            {
                state.TickEventCounter = 0;
                return ToSnapshot(state, [], []);
            }

            if (!IsStarted(state))
            {
                state.Tick += 1;
                state.TickEventCounter = 0;
                var rejectedCommandResults = BuildStatusRejectedCommandResults(state, commands);
                return ToSnapshot(state, [], rejectedCommandResults);
            }

            var preAppliedPauseResults = ApplyPauseCommands(state, commands);
            if (state.IsPaused)
            {
                var pausedCommandResults = BuildPausedCommandResults(commands, preAppliedPauseResults);
                return ToSnapshot(state, [], pausedCommandResults);
            }

            if (state.PendingCardChoice is not null)
            {
                var awaitingCardChoiceResults = BuildAwaitingCardChoiceCommandResults(commands, preAppliedPauseResults);
                return ToSnapshot(state, [], awaitingCardChoiceResults);
            }

            state.Tick += 1;
            state.TickEventCounter = 0;
            var events = new List<BattleEventDto>();
            if (TryEndRunIfNeeded(state, events))
            {
                var preAppliedOnlyResults = preAppliedPauseResults.Values
                    .OrderBy(result => result.Index)
                    .ToList();
                return ToSnapshot(state, events, preAppliedOnlyResults);
            }

            TickSkillCooldowns(state);
            TickPlayerGlobalCooldown(state);
            TickPlayerMoveCooldown(state);
            TickPlayerAutoAttackCooldown(state);
            TickMobCombatCooldowns(state);
            TickPois(state, events);
            TickBuffs(state);
            MaintainEliteCommanderBuffs(state, events);

            var pendingLifeLeechHeal = 0;
            var hasExplicitFacingCommand = false;
            var hasManualCastSkillCommand = false;
            var preAppliedMovementResults = ApplyMoveCommandsBeforeMobMovement(
                state,
                commands,
                ref hasExplicitFacingCommand);
            var preAppliedCommandResults = MergePreAppliedCommandResults(preAppliedPauseResults, preAppliedMovementResults);
            TickMobMovement(state);
            TickMobCommitWindows(state);
            TickDecals(state);
            var commandResults = ApplyCommands(
                state,
                commands,
                events,
                ref pendingLifeLeechHeal,
                ref hasExplicitFacingCommand,
                ref hasManualCastSkillCommand,
                preAppliedCommandResults);
            EvaluateCombatAssist(state, events, ref pendingLifeLeechHeal, hasManualCastSkillCommand);
            // Deterministic facing priority per tick:
            // 1) explicit facing updates from command processing (move_player / set_facing / set_ground_target)
            // 2) otherwise face the effective auto-attack target
            if (!hasExplicitFacingCommand)
            {
                UpdatePlayerFacingTowardEffectiveAutoAttackTarget(state);
            }

            if (!IsDefeat(state))
            {
                ApplyPlayerAutoAttack(state, events, ref pendingLifeLeechHeal);
                ApplyPlayerLifeLeech(state, events, pendingLifeLeechHeal);
            }

            if (!IsDefeat(state))
            {
                ApplyMobAbilities(state, events);
            }

            if (!IsDefeat(state))
            {
                ApplyMobAutoAttacks(state, events);
            }

            if (!state.IsRunEnded)
            {
                TickMobRespawns(state, events);
            }

            return ToSnapshot(state, events, commandResults);
        }
    }

    public BattleSnapshot ChooseCard(string battleId, string choiceId, string selectedCardId)
    {
        if (string.IsNullOrWhiteSpace(battleId) || !_battles.TryGetValue(battleId.Trim(), out var state))
        {
            throw new KeyNotFoundException($"Battle '{battleId}' was not found.");
        }

        var normalizedChoiceId = NormalizeChoiceId(choiceId);
        if (normalizedChoiceId is null)
        {
            throw new ArgumentException("choiceId is required.", nameof(choiceId));
        }

        var normalizedSelectedCardId = NormalizeCardId(selectedCardId);
        if (normalizedSelectedCardId is null)
        {
            throw new ArgumentException("selectedCardId is required.", nameof(selectedCardId));
        }

        lock (state.Sync)
        {
            if (!IsStarted(state))
            {
                throw new InvalidOperationException("Battle is not in a started state.");
            }

            var pendingChoice = state.PendingCardChoice;
            if (pendingChoice is null)
            {
                throw new InvalidOperationException("No pending card choice exists for this battle.");
            }

            if (!string.Equals(pendingChoice.ChoiceId, normalizedChoiceId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("choiceId does not match the current pending card choice.");
            }

            if (!pendingChoice.OfferedCardIds.Contains(normalizedSelectedCardId, StringComparer.Ordinal))
            {
                throw new InvalidOperationException("selectedCardId is not part of the current offer.");
            }

            if (!CardById.TryGetValue(normalizedSelectedCardId, out var selectedCard))
            {
                throw new InvalidOperationException($"Card '{normalizedSelectedCardId}' was not found in the card pool.");
            }

            if (state.SelectedCardIds.Contains(selectedCard.Id, StringComparer.Ordinal))
            {
                throw new InvalidOperationException($"Card '{selectedCard.Id}' has already been selected in this run.");
            }

            var player = GetPlayerActor(state);
            if (player is null)
            {
                throw new InvalidOperationException("Player actor is missing.");
            }

            ApplyCardEffects(state, player, selectedCard);
            state.SelectedCardIds.Add(selectedCard.Id);
            state.PendingCardChoice = null;

            var events = new List<BattleEventDto>
            {
                new CardChosenEventDto(
                    ChoiceId: pendingChoice.ChoiceId,
                    Card: ToCardOfferDto(selectedCard))
            };

            return ToSnapshot(state, events, []);
        }
    }

    public bool TryGetBattleSeed(string battleId, out int seed)
    {
        seed = 0;
        if (string.IsNullOrWhiteSpace(battleId) || !_battles.TryGetValue(battleId.Trim(), out var state))
        {
            return false;
        }

        seed = state.Seed;
        return true;
    }

    private static BattleSnapshot ToSnapshot(
        StoredBattle state,
        IReadOnlyList<BattleEventDto> events,
        IReadOnlyList<CommandResultDto> commandResults)
    {
        AssertBattleInvariants(state);

        var actors = state.Actors.Values
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => new ActorStateDto(
                ActorId: actor.ActorId,
                Kind: actor.Kind,
                MobType: actor.MobType,
                IsElite: actor.IsElite,
                IsBuffedByElite: actor.BuffSourceEliteId is not null,
                BuffSourceEliteId: actor.BuffSourceEliteId,
                TileX: actor.TileX,
                TileY: actor.TileY,
                Hp: actor.Hp,
                MaxHp: actor.MaxHp,
                Shield: actor.Shield,
                MaxShield: actor.MaxShield))
            .ToList();

        var skills = state.Skills.Values
            .OrderBy(skill => skill.SkillId, StringComparer.Ordinal)
            .Select(skill => new SkillStateDto(
                SkillId: skill.SkillId,
                CooldownRemainingMs: skill.CooldownRemainingMs,
                CooldownTotalMs: ResolveSkillCooldownTotalMs(state, skill)))
            .ToList();

        var decals = state.Decals
            .OrderBy(decal => decal.CreatedTick)
            .ThenBy(decal => decal.EntityId, StringComparer.Ordinal)
            .ThenBy(decal => decal.TileY)
            .ThenBy(decal => decal.TileX)
            .Select(decal => new BattleDecalDto(
                EntityId: decal.EntityId,
                DecalKind: decal.DecalKind,
                EntityType: decal.EntityType,
                MobType: decal.MobType,
                TileX: decal.TileX,
                TileY: decal.TileY,
                SpriteKey: decal.SpriteKey,
                RemainingMs: decal.RemainingMs,
                TotalMs: decal.TotalMs,
                CreatedTick: decal.CreatedTick))
            .ToList();
        var groundTargetPos = state.GroundTargetTileX is int groundX && state.GroundTargetTileY is int groundY
            ? new BattleTilePosDto(groundX, groundY)
            : null;
        var effectiveTargetEntityId = ResolveEffectivePlayerAutoAttackTargetEntityId(state);
        var xpToNextLevel = GetXpToNextLevel(state.RunLevel);
        var nowMs = GetElapsedMsForTick(state.Tick);
        var isRunEnded = state.IsRunEnded;
        var isGameOver = isRunEnded;
        var endReason = ResolveLegacyEndReason(state.RunEndReason);
        var timeSurvivedMs = state.RunEndedAtMs ?? nowMs;
        var currentMobHpMult = ResolveCurrentMobHpMult(state);
        var currentMobDmgMult = ResolveCurrentMobDmgMult(state);
        var activeBuffs = state.ActiveBuffs.Values
            .Where(buff => buff.ExpiresAtMs > nowMs)
            .OrderBy(buff => buff.BuffId, StringComparer.Ordinal)
            .Select(buff => new BattleBuffDto(
                BuffId: buff.BuffId,
                RemainingMs: (int)Math.Max(0, buff.ExpiresAtMs - nowMs)))
            .ToList();
        var bestiary = state.Bestiary
            .OrderBy(entry => (int)entry.Key)
            .Select(entry => new BestiaryEntryDto(
                Species: GetSpeciesId(entry.Key),
                KillsTotal: entry.Value.KillsTotal,
                NextChestAtKills: entry.Value.NextChestAtKills))
            .ToList();
        var activePois = state.Pois.Values
            .Where(poi => poi.ExpiresAtMs > nowMs)
            .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
            .Select(poi => new BattlePoiDto(
                PoiId: poi.PoiId,
                Type: poi.Type,
                Pos: new BattleTilePosDto(poi.TileX, poi.TileY),
                RemainingMs: (int)Math.Max(0, poi.ExpiresAtMs - nowMs),
                Species: poi.Species,
                Metadata: poi.Metadata is null
                    ? null
                    : new Dictionary<string, string>(poi.Metadata, StringComparer.Ordinal)))
            .ToList();
        var offeredCards = state.PendingCardChoice is null
            ? []
            : state.PendingCardChoice.OfferedCardIds
                .Select(cardId => CardById.TryGetValue(cardId, out var definition) ? definition : null)
                .Where(definition => definition is not null)
                .Select(definition => ToCardOfferDto(definition!))
                .ToList();
        var selectedCards = state.SelectedCardIds
            .Select(cardId => CardById.TryGetValue(cardId, out var definition) ? definition : null)
            .Where(definition => definition is not null)
            .Select(definition => ToCardOfferDto(definition!))
            .ToList();
        var playerGlobalCooldownTotalMs = ResolvePlayerGlobalCooldownMs(state);

        return new BattleSnapshot(
            BattleId: state.BattleId,
            Tick: state.Tick,
            Actors: actors,
            Skills: skills,
            GlobalCooldownRemainingMs: state.PlayerGlobalCooldownRemainingMs,
            GlobalCooldownTotalMs: playerGlobalCooldownTotalMs,
            AltarCooldownRemainingMs: (int)Math.Max(0, state.NextAltarInteractAllowedAtMs - nowMs),
            Seed: state.Seed,
            FacingDirection: state.PlayerFacingDirection,
            BattleStatus: state.BattleStatus,
            IsGameOver: isGameOver,
            EndReason: endReason,
            IsRunEnded: isRunEnded,
            RunEndReason: state.RunEndReason,
            RunEndedAtMs: state.RunEndedAtMs,
            RunXp: state.RunXp,
            RunLevel: state.RunLevel,
            XpToNextLevel: xpToNextLevel,
            TotalKills: state.TotalKills,
            EliteKills: state.EliteKills,
            ChestsOpened: state.ChestsOpened,
            TimeSurvivedMs: timeSurvivedMs,
            RunTimeMs: nowMs,
            RunDurationMs: RunDurationTargetMs,
            CurrentMobHpMult: currentMobHpMult,
            CurrentMobDmgMult: currentMobDmgMult,
            EffectiveTargetEntityId: effectiveTargetEntityId,
            LockedTargetEntityId: state.LockedTargetEntityId,
            GroundTargetPos: groundTargetPos,
            AssistConfig: ToAssistConfigDto(state.AssistConfig),
            PlayerBaseElement: GetPlayerBaseElement(state),
            WeaponElement: state.EquippedWeaponElement,
            Decals: decals,
            ActiveBuffs: activeBuffs,
            Bestiary: bestiary,
            PendingSpeciesChest: state.PendingSpeciesChestArchetype is null
                ? null
                : GetSpeciesId(state.PendingSpeciesChestArchetype.Value),
            ActivePois: activePois,
            IsAwaitingCardChoice: state.PendingCardChoice is not null,
            PendingChoiceId: state.PendingCardChoice?.ChoiceId,
            OfferedCards: offeredCards,
            SelectedCards: selectedCards,
            Events: events,
            CommandResults: commandResults);
    }

    private static Dictionary<int, MobSlotState> BuildMobSlots()
    {
        var slots = new Dictionary<int, MobSlotState>();
        for (var slotIndex = 1; slotIndex <= ArenaConfig.MaxAliveMobs; slotIndex += 1)
        {
            var archetype = SpawnArchetypeCycle[(slotIndex - 1) % SpawnArchetypeCycle.Length];
            slots[slotIndex] = new MobSlotState(
                slotIndex: slotIndex,
                actorId: BuildMobActorId(slotIndex),
                kind: "mob",
                archetype: archetype,
                isElite: IsEliteSlot(slotIndex),
                respawnRemainingMs: 0,
                attackCooldownRemainingMs: 0,
                abilityCooldownRemainingMs: 0,
                moveCooldownRemainingMs: 0,
                commitTicksRemaining: 0);
        }

        return slots;
    }

    private static Dictionary<string, StoredPoi> BuildInitialPois()
    {
        return new Dictionary<string, StoredPoi>(StringComparer.Ordinal)
        {
            [InitialChestPoiId] = new StoredPoi(
                poiId: InitialChestPoiId,
                type: PoiTypeChest,
                tileX: ArenaConfig.PlayerTileX + 1,
                tileY: ArenaConfig.PlayerTileY,
                expiresAtMs: ChestLifetimeMs,
                species: null,
                metadata: null)
        };
    }

    private static Dictionary<MobArchetype, StoredBestiaryEntry> BuildInitialBestiaryEntries(
        IReadOnlyDictionary<int, MobSlotState> mobSlots,
        Random bestiaryRng)
    {
        var entries = new Dictionary<MobArchetype, StoredBestiaryEntry>();
        var archetypes = mobSlots.Values
            .Select(slot => slot.Archetype)
            .Distinct()
            .OrderBy(archetype => (int)archetype)
            .ToList();
        foreach (var archetype in archetypes)
        {
            entries[archetype] = new StoredBestiaryEntry(
                killsTotal: 0,
                nextChestAtKills: ComputeInitialBestiaryThreshold(bestiaryRng));
        }

        return entries;
    }

    private static int GenerateSeed(int battleIndex)
    {
        unchecked
        {
            return 0x5F3759DF + battleIndex * 7919;
        }
    }

    private static int GeneratePoiSeed(int battleSeed)
    {
        unchecked
        {
            return (battleSeed * 486187739) ^ 0x2C1B3C6D;
        }
    }

    private static int GenerateBestiarySeed(int battleSeed)
    {
        unchecked
        {
            return (battleSeed * 92821) ^ 0x41D2A7C3;
        }
    }

    private static int GenerateCritSeed(int battleSeed)
    {
        unchecked
        {
            return (battleSeed * 214013) ^ 0x1A2B3C4D;
        }
    }

    private static int GetXpToNextLevel(int runLevel)
    {
        var clampedLevel = Math.Max(RunInitialLevel, runLevel);
        return RunLevelXpBase + ((clampedLevel - RunInitialLevel) * RunLevelXpIncrementPerLevel);
    }

    private static int ComputeInitialBestiaryThreshold(Random bestiaryRng)
    {
        return BestiaryFirstChestBaseKills + bestiaryRng.Next(BestiaryFirstChestRandomInclusiveMax + 1);
    }

    private static int ComputeBestiaryThresholdIncrement(Random bestiaryRng)
    {
        return BestiaryChestIncrementBaseKills + bestiaryRng.Next(BestiaryChestIncrementRandomInclusiveMax + 1);
    }

    private static string ResolvePlayerClassId(string playerActorId)
    {
        // MVP: every current run uses Kina. Keep this hook to make class selection explicit/extensible.
        _ = playerActorId;
        return PlayerClassKina;
    }

    private static StoredAssistConfig BuildDefaultAssistConfig()
    {
        return new StoredAssistConfig(
            enabled: false,
            autoHealEnabled: true,
            healAtHpPercent: AssistDefaultHealAtHpPercent,
            autoGuardEnabled: true,
            guardAtHpPercent: AssistDefaultGuardAtHpPercent,
            autoOffenseEnabled: true,
            offenseMode: AssistOffenseModeCooldownSpam,
            autoSkills: CopyAutoSkillMap(DefaultAssistAutoSkills),
            maxAutoCastsPerTick: AssistDefaultMaxAutoCastsPerTick);
    }

    private static AssistConfigDto ToAssistConfigDto(StoredAssistConfig config)
    {
        return new AssistConfigDto(
            Enabled: config.Enabled,
            AutoHealEnabled: config.AutoHealEnabled,
            HealAtHpPercent: config.HealAtHpPercent,
            AutoGuardEnabled: config.AutoGuardEnabled,
            GuardAtHpPercent: config.GuardAtHpPercent,
            AutoOffenseEnabled: config.AutoOffenseEnabled,
            OffenseMode: config.OffenseMode,
            AutoSkills: CopyAutoSkillMap(config.AutoSkills),
            MaxAutoCastsPerTick: config.MaxAutoCastsPerTick);
    }

    private static StoredAssistConfig SanitizeAssistConfig(AssistConfigDto? requested, StoredAssistConfig fallback)
    {
        if (requested is null)
        {
            return fallback.Clone();
        }

        var offenseMode = NormalizeAssistOffenseMode(requested.OffenseMode) ?? fallback.OffenseMode;
        var autoSkills = SanitizeAssistAutoSkills(requested.AutoSkills, fallback.AutoSkills);

        return new StoredAssistConfig(
            enabled: requested.Enabled ?? fallback.Enabled,
            autoHealEnabled: requested.AutoHealEnabled ?? fallback.AutoHealEnabled,
            healAtHpPercent: ClampAssistHpPercent(requested.HealAtHpPercent ?? fallback.HealAtHpPercent),
            autoGuardEnabled: requested.AutoGuardEnabled ?? fallback.AutoGuardEnabled,
            guardAtHpPercent: ClampAssistHpPercent(requested.GuardAtHpPercent ?? fallback.GuardAtHpPercent),
            autoOffenseEnabled: requested.AutoOffenseEnabled ?? fallback.AutoOffenseEnabled,
            offenseMode: offenseMode,
            autoSkills: autoSkills,
            maxAutoCastsPerTick: ClampAssistMaxAutoCasts(requested.MaxAutoCastsPerTick ?? fallback.MaxAutoCastsPerTick));
    }

    private static IReadOnlyDictionary<string, bool> SanitizeAssistAutoSkills(
        IReadOnlyDictionary<string, bool>? requested,
        IReadOnlyDictionary<string, bool> fallback)
    {
        var sanitized = new Dictionary<string, bool>(StringComparer.Ordinal);
        foreach (var skillId in AssistOffenseSkillPriority)
        {
            if (requested is not null && requested.TryGetValue(skillId, out var requestedEnabled))
            {
                sanitized[skillId] = requestedEnabled;
                continue;
            }

            if (fallback.TryGetValue(skillId, out var fallbackEnabled))
            {
                sanitized[skillId] = fallbackEnabled;
                continue;
            }

            sanitized[skillId] = true;
        }

        return sanitized;
    }

    private static Dictionary<string, bool> CopyAutoSkillMap(IReadOnlyDictionary<string, bool> source)
    {
        return source.ToDictionary(entry => entry.Key, entry => entry.Value, StringComparer.Ordinal);
    }

    private static string? NormalizeAssistOffenseMode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim().ToLowerInvariant();
        return normalized switch
        {
            AssistOffenseModeCooldownSpam => AssistOffenseModeCooldownSpam,
            AssistOffenseModeSmart => AssistOffenseModeSmart,
            _ => null
        };
    }

    private static int ClampAssistHpPercent(int value)
    {
        return Math.Clamp(value, 1, 99);
    }

    private static int ClampAssistMaxAutoCasts(int value)
    {
        return Math.Clamp(value, 1, 3);
    }

    private static int ComputePlayerMaxShield(int maxHp)
    {
        return (int)Math.Floor(maxHp * 0.8d);
    }

    private static int ResolvePlayerMaxHp(StoredBattle state)
    {
        return Math.Max(
            1,
            ApplyPercentIncrease(
                PlayerBaseHp,
                Math.Max(0, state.PlayerModifiers.PercentMaxHpBonus)));
    }

    private static int ResolvePlayerAutoAttackCooldownMs(StoredBattle state)
    {
        return Math.Max(
            1,
            ApplyPercentReduction(
                PlayerAutoAttackCooldownMs,
                Math.Max(0, state.PlayerModifiers.PercentAttackSpeedBonus)));
    }

    private static int ResolvePlayerGlobalCooldownMs(StoredBattle state)
    {
        var reductionPercent = Math.Clamp(
            state.PlayerModifiers.GlobalCooldownReductionPercent,
            0,
            MaxGlobalCooldownReductionPercent);
        return Math.Max(1, ApplyPercentReduction(PlayerGlobalCooldownMs, reductionPercent));
    }

    private static int ResolveSkillCooldownTotalMs(StoredBattle state, StoredSkill skill)
    {
        var reductionPercent = Math.Clamp(
            state.PlayerModifiers.GlobalCooldownReductionPercent,
            0,
            MaxGlobalCooldownReductionPercent);
        return Math.Max(1, ApplyPercentReduction(skill.CooldownTotalMs, reductionPercent));
    }

    private static ElementType GetPlayerBaseElement(StoredBattle state)
    {
        return state.EquippedWeaponElement ?? ElementType.Physical;
    }

    private static MobArchetypeConfig GetMobConfig(MobArchetype archetype)
    {
        if (MobConfigs.TryGetValue(archetype, out var config))
        {
            return config;
        }

        throw new InvalidOperationException($"Unknown mob archetype '{archetype}'.");
    }

    private static IMobBehavior GetMobBehavior(MobArchetype archetype)
    {
        if (MobBehaviors.TryGetValue(archetype, out var behavior))
        {
            return behavior;
        }

        throw new InvalidOperationException($"Mob behavior was not registered for archetype '{archetype}'.");
    }

    private static IReadOnlyList<CommandResultDto> BuildStatusRejectedCommandResults(
        StoredBattle state,
        IReadOnlyList<BattleCommandDto>? commands)
    {
        var commandResults = new List<CommandResultDto>();
        if (commands is null || commands.Count == 0)
        {
            return commandResults;
        }

        var reason = string.Equals(state.BattleStatus, StatusDefeat, StringComparison.Ordinal)
            ? DefeatReason
            : NotStartedReason;

        for (var index = 0; index < commands.Count; index += 1)
        {
            var command = commands[index];
            var commandType = NormalizeCommandType(command.Type);
            commandResults.Add(new CommandResultDto(index, commandType, false, reason));
        }

        return commandResults;
    }

    private static IReadOnlyDictionary<int, CommandResultDto> ApplyPauseCommands(
        StoredBattle state,
        IReadOnlyList<BattleCommandDto>? commands)
    {
        if (commands is null || commands.Count == 0)
        {
            return new Dictionary<int, CommandResultDto>();
        }

        var commandResults = new Dictionary<int, CommandResultDto>();
        for (var index = 0; index < commands.Count; index += 1)
        {
            var command = commands[index];
            var commandType = NormalizeCommandType(command.Type);
            if (!string.Equals(commandType, SetPausedCommandType, StringComparison.Ordinal))
            {
                continue;
            }

            if (!command.Paused.HasValue)
            {
                commandResults[index] = new CommandResultDto(index, commandType, false, UnknownCommandReason);
                continue;
            }

            state.IsPaused = command.Paused.Value;
            commandResults[index] = new CommandResultDto(index, commandType, true, null);
        }

        return commandResults;
    }

    private static IReadOnlyList<CommandResultDto> BuildPausedCommandResults(
        IReadOnlyList<BattleCommandDto>? commands,
        IReadOnlyDictionary<int, CommandResultDto> preAppliedPauseResults)
    {
        var commandResults = new List<CommandResultDto>();
        if (commands is null || commands.Count == 0)
        {
            return commandResults;
        }

        for (var index = 0; index < commands.Count; index += 1)
        {
            if (preAppliedPauseResults.TryGetValue(index, out var preAppliedResult))
            {
                commandResults.Add(preAppliedResult);
                continue;
            }

            var commandType = NormalizeCommandType(commands[index].Type);
            commandResults.Add(new CommandResultDto(index, commandType, false, PausedReason));
        }

        return commandResults;
    }

    private static IReadOnlyList<CommandResultDto> BuildAwaitingCardChoiceCommandResults(
        IReadOnlyList<BattleCommandDto>? commands,
        IReadOnlyDictionary<int, CommandResultDto> preAppliedPauseResults)
    {
        var commandResults = new List<CommandResultDto>();
        if (commands is null || commands.Count == 0)
        {
            return commandResults;
        }

        for (var index = 0; index < commands.Count; index += 1)
        {
            if (preAppliedPauseResults.TryGetValue(index, out var preAppliedResult))
            {
                commandResults.Add(preAppliedResult);
                continue;
            }

            var commandType = NormalizeCommandType(commands[index].Type);
            commandResults.Add(new CommandResultDto(index, commandType, false, AwaitingCardChoiceReason));
        }

        return commandResults;
    }

    private static IReadOnlyDictionary<int, CommandResultDto> MergePreAppliedCommandResults(
        IReadOnlyDictionary<int, CommandResultDto> left,
        IReadOnlyDictionary<int, CommandResultDto> right)
    {
        if (left.Count == 0)
        {
            return right;
        }

        if (right.Count == 0)
        {
            return left;
        }

        var merged = new Dictionary<int, CommandResultDto>(left.Count + right.Count);
        foreach (var entry in left)
        {
            merged[entry.Key] = entry.Value;
        }

        foreach (var entry in right)
        {
            merged[entry.Key] = entry.Value;
        }

        return merged;
    }

    private static IReadOnlyDictionary<int, CommandResultDto> ApplyMoveCommandsBeforeMobMovement(
        StoredBattle state,
        IReadOnlyList<BattleCommandDto>? commands,
        ref bool hasExplicitFacingCommand)
    {
        if (commands is null || commands.Count == 0)
        {
            return new Dictionary<int, CommandResultDto>();
        }

        var latestMoveCommandIndex = -1;
        for (var index = 0; index < commands.Count; index += 1)
        {
            var commandType = NormalizeCommandType(commands[index].Type);
            if (string.Equals(commandType, MovePlayerCommandType, StringComparison.Ordinal))
            {
                latestMoveCommandIndex = index;
            }
        }

        if (latestMoveCommandIndex < 0)
        {
            return new Dictionary<int, CommandResultDto>();
        }

        var commandResults = new Dictionary<int, CommandResultDto>();
        for (var index = 0; index < commands.Count; index += 1)
        {
            var command = commands[index];
            var commandType = NormalizeCommandType(command.Type);
            if (!string.Equals(commandType, MovePlayerCommandType, StringComparison.Ordinal))
            {
                continue;
            }

            if (index != latestMoveCommandIndex)
            {
                // Deterministic rule: keep only the latest move command for the tick.
                commandResults[index] = new CommandResultDto(index, commandType, true, null);
                continue;
            }

            var moved = TryExecutePlayerMoveCommand(state, command.Dir, out var failReason);
            if (moved)
            {
                hasExplicitFacingCommand = true;
            }

            commandResults[index] = new CommandResultDto(index, commandType, moved, failReason);
        }

        return commandResults;
    }

    private static bool TryExecutePlayerMoveCommand(
        StoredBattle state,
        string? rawDirection,
        out string? failReason)
    {
        failReason = null;
        var direction = NormalizeDirection(rawDirection);
        if (direction is null)
        {
            failReason = UnknownDirectionReason;
            return false;
        }

        if (state.PlayerMoveCooldownRemainingMs > 0)
        {
            failReason = CooldownReason;
            return false;
        }

        var player = GetPlayerActor(state);
        if (player is null)
        {
            failReason = NoTargetReason;
            return false;
        }

        if (!TryGetDirectionDelta(direction, out var deltaX, out var deltaY))
        {
            failReason = UnknownDirectionReason;
            return false;
        }

        var destinationX = player.TileX + deltaX;
        var destinationY = player.TileY + deltaY;
        if (!IsTileOpenForPlayerMovement(state, player.ActorId, destinationX, destinationY))
        {
            failReason = MoveBlockedReason;
            return false;
        }

        player.TileX = destinationX;
        player.TileY = destinationY;
        state.PlayerFacingDirection = direction;
        state.PlayerMoveCooldownRemainingMs = PlayerMoveCooldownMs;
        return true;
    }

    private static bool TryGetDirectionDelta(string direction, out int deltaX, out int deltaY)
    {
        deltaX = 0;
        deltaY = 0;
        switch (direction)
        {
            case FacingUp:
                deltaY = -1;
                return true;
            case FacingUpRight:
                deltaX = 1;
                deltaY = -1;
                return true;
            case FacingRight:
                deltaX = 1;
                return true;
            case FacingDownRight:
                deltaX = 1;
                deltaY = 1;
                return true;
            case FacingDown:
                deltaY = 1;
                return true;
            case FacingDownLeft:
                deltaX = -1;
                deltaY = 1;
                return true;
            case FacingLeft:
                deltaX = -1;
                return true;
            case FacingUpLeft:
                deltaX = -1;
                deltaY = -1;
                return true;
            default:
                return false;
        }
    }

    private static bool IsTileOpenForPlayerMovement(
        StoredBattle state,
        string playerActorId,
        int tileX,
        int tileY)
    {
        if (!IsInBounds(tileX, tileY))
        {
            return false;
        }

        return !state.Actors.Values.Any(actor =>
            !string.Equals(actor.ActorId, playerActorId, StringComparison.Ordinal) &&
            actor.TileX == tileX &&
            actor.TileY == tileY);
    }

    private static IReadOnlyList<CommandResultDto> ApplyCommands(
        StoredBattle state,
        IReadOnlyList<BattleCommandDto>? commands,
        List<BattleEventDto> events,
        ref int pendingLifeLeechHeal,
        ref bool hasExplicitFacingCommand,
        ref bool hasManualCastSkillCommand,
        IReadOnlyDictionary<int, CommandResultDto> preAppliedCommandResults)
    {
        var commandResults = new List<CommandResultDto>();
        if (commands is null || commands.Count == 0)
        {
            return commandResults;
        }

        for (var index = 0; index < commands.Count; index += 1)
        {
            var command = commands[index];
            var commandType = NormalizeCommandType(command.Type);

            if (preAppliedCommandResults.TryGetValue(index, out var preAppliedResult))
            {
                commandResults.Add(preAppliedResult);
                continue;
            }

            if (string.Equals(commandType, SetFacingCommandType, StringComparison.Ordinal))
            {
                var normalizedDirection = NormalizeDirection(command.Dir);
                if (normalizedDirection is null)
                {
                    commandResults.Add(new CommandResultDto(index, commandType, false, UnknownDirectionReason));
                    continue;
                }

                state.PlayerFacingDirection = normalizedDirection;
                hasExplicitFacingCommand = true;
                commandResults.Add(new CommandResultDto(index, commandType, true, null));
                continue;
            }

            if (string.Equals(commandType, MovePlayerCommandType, StringComparison.Ordinal))
            {
                // move_player commands are consumed in the pre-mob movement phase.
                commandResults.Add(new CommandResultDto(index, commandType, false, UnknownCommandReason));
                continue;
            }

            if (string.Equals(commandType, SetTargetCommandType, StringComparison.Ordinal))
            {
                var normalizedTargetId = string.IsNullOrWhiteSpace(command.TargetEntityId)
                    ? null
                    : command.TargetEntityId.Trim();

                if (normalizedTargetId is null)
                {
                    state.LockedTargetEntityId = null;
                    commandResults.Add(new CommandResultDto(index, commandType, true, null));
                    continue;
                }

                if (!state.Actors.TryGetValue(normalizedTargetId, out var lockedTarget) ||
                    !string.Equals(lockedTarget.Kind, "mob", StringComparison.Ordinal))
                {
                    // Invalid lock requests are normalized into a deterministic clear lock.
                    state.LockedTargetEntityId = null;
                    commandResults.Add(new CommandResultDto(index, commandType, true, null));
                    continue;
                }

                state.LockedTargetEntityId = normalizedTargetId;
                commandResults.Add(new CommandResultDto(index, commandType, true, null));
                continue;
            }

            if (string.Equals(commandType, SetGroundTargetCommandType, StringComparison.Ordinal))
            {
                var hasGroundTileX = command.GroundTileX.HasValue;
                var hasGroundTileY = command.GroundTileY.HasValue;
                if (!hasGroundTileX && !hasGroundTileY)
                {
                    state.GroundTargetTileX = null;
                    state.GroundTargetTileY = null;
                    commandResults.Add(new CommandResultDto(index, commandType, true, null));
                    continue;
                }

                if (!hasGroundTileX || !hasGroundTileY)
                {
                    commandResults.Add(new CommandResultDto(index, commandType, false, InvalidGroundTargetReason));
                    continue;
                }

                var targetTileX = command.GroundTileX!.Value;
                var targetTileY = command.GroundTileY!.Value;
                if (!IsInBounds(targetTileX, targetTileY))
                {
                    commandResults.Add(new CommandResultDto(index, commandType, false, InvalidGroundTargetReason));
                    continue;
                }

                state.GroundTargetTileX = targetTileX;
                state.GroundTargetTileY = targetTileY;
                var groundTargetPlayer = GetPlayerActor(state);
                if (groundTargetPlayer is not null)
                {
                    state.PlayerFacingDirection = ResolveFacingDirectionTowardTile(
                        groundTargetPlayer.TileX,
                        groundTargetPlayer.TileY,
                        targetTileX,
                        targetTileY,
                        state.PlayerFacingDirection);
                    hasExplicitFacingCommand = true;
                }

                commandResults.Add(new CommandResultDto(index, commandType, true, null));
                continue;
            }

            if (string.Equals(commandType, SetAssistConfigCommandType, StringComparison.Ordinal))
            {
                state.AssistConfig = SanitizeAssistConfig(command.AssistConfig, state.AssistConfig);
                commandResults.Add(new CommandResultDto(index, commandType, true, null));
                continue;
            }

            if (string.Equals(commandType, InteractPoiCommandType, StringComparison.Ordinal))
            {
                var interacted = TryExecutePoiInteraction(state, events, command.PoiId, out var interactionFailReason);
                commandResults.Add(new CommandResultDto(index, commandType, interacted, interactionFailReason));
                continue;
            }

            if (!string.Equals(commandType, CastSkillCommandType, StringComparison.Ordinal))
            {
                commandResults.Add(new CommandResultDto(index, commandType, false, UnknownCommandReason));
                continue;
            }

            hasManualCastSkillCommand = true;
            var normalizedSkillId = NormalizeSkillId(command.SkillId);
            if (string.IsNullOrEmpty(normalizedSkillId))
            {
                commandResults.Add(new CommandResultDto(index, commandType, false, UnknownSkillReason));
                continue;
            }

            var castResult = TryExecutePlayerSkillCast(state, events, normalizedSkillId, ref pendingLifeLeechHeal);
            commandResults.Add(new CommandResultDto(index, commandType, castResult.Success, castResult.Reason));
        }

        return commandResults;
    }

    private static bool TryExecutePoiInteraction(
        StoredBattle state,
        List<BattleEventDto> events,
        string? rawPoiId,
        out string? failReason)
    {
        failReason = null;
        var normalizedPoiId = NormalizePoiId(rawPoiId);
        if (normalizedPoiId is null)
        {
            failReason = UnknownPoiReason;
            events.Add(new InteractFailedEventDto(null, UnknownPoiReason));
            return false;
        }

        var player = GetPlayerActor(state);
        if (player is null || player.Hp <= 0)
        {
            failReason = PlayerDeadReason;
            events.Add(new InteractFailedEventDto(normalizedPoiId, PlayerDeadReason));
            return false;
        }

        if (!state.Pois.TryGetValue(normalizedPoiId, out var poi))
        {
            failReason = UnknownPoiReason;
            events.Add(new InteractFailedEventDto(normalizedPoiId, UnknownPoiReason));
            return false;
        }

        var nowMs = GetElapsedMsForTick(state.Tick);
        if (poi.ExpiresAtMs <= nowMs)
        {
            state.Pois.Remove(normalizedPoiId);
            failReason = UnknownPoiReason;
            events.Add(new InteractFailedEventDto(normalizedPoiId, UnknownPoiReason));
            return false;
        }

        if (string.Equals(poi.Type, PoiTypeAltar, StringComparison.Ordinal) &&
            nowMs < state.NextAltarInteractAllowedAtMs)
        {
            failReason = CooldownReason;
            events.Add(new InteractFailedEventDto(normalizedPoiId, CooldownReason));
            return false;
        }

        var distance = ComputeChebyshevDistance(player.TileX, player.TileY, poi.TileX, poi.TileY);
        if (distance > 1)
        {
            failReason = OutOfRangeReason;
            events.Add(new InteractFailedEventDto(normalizedPoiId, OutOfRangeReason));
            return false;
        }

        state.Pois.Remove(normalizedPoiId);
        events.Add(new PoiInteractedEventDto(
            PoiId: poi.PoiId,
            PoiType: poi.Type,
            TileX: poi.TileX,
            TileY: poi.TileY));

        if (string.Equals(poi.Type, PoiTypeChest, StringComparison.Ordinal))
        {
            state.ChestsOpened += 1;
            ApplyOrRefreshBuff(state, HealingAmplifierBuffId, HealAmplifierDurationMs);
            events.Add(new BuffAppliedEventDto(
                BuffId: HealingAmplifierBuffId,
                DurationMs: HealAmplifierDurationMs));
        }
        else if (string.Equals(poi.Type, PoiTypeSpeciesChest, StringComparison.Ordinal))
        {
            state.ChestsOpened += 1;
            var speciesArchetype = TryResolveArchetypeBySpecies(poi.Species);
            var (buffId, durationMs) = ResolveSpeciesChestBuff(speciesArchetype);
            ApplyOrRefreshBuff(state, buffId, durationMs);
            events.Add(new BuffAppliedEventDto(
                BuffId: buffId,
                DurationMs: durationMs));
            events.Add(new SpeciesChestOpenedEventDto(
                Species: poi.Species ?? "unknown",
                BuffId: buffId,
                DurationMs: durationMs));
        }
        else if (string.Equals(poi.Type, PoiTypeAltar, StringComparison.Ordinal))
        {
            state.NextAltarInteractAllowedAtMs = nowMs + AltarCooldownMs;
            var spawnedCount = SummonMobsAroundPlayer(state, AltarSummonSpawnCount, events);
            events.Add(new AltarActivatedEventDto(
                RequestedCount: AltarSummonSpawnCount,
                SpawnedCount: spawnedCount));
        }

        TrySpawnPendingSpeciesChest(state, events, nowMs);

        return true;
    }

    private static int SummonMobsAroundPlayer(StoredBattle state, int requestedCount, List<BattleEventDto> events)
    {
        if (requestedCount <= 0)
        {
            return 0;
        }

        var availableSlots = state.MobSlots.Values
            .Where(slot => !state.Actors.ContainsKey(slot.ActorId))
            .OrderBy(slot => slot.SlotIndex)
            .ToList();
        if (availableSlots.Count == 0)
        {
            return 0;
        }

        var targetCount = Math.Min(requestedCount, availableSlots.Count);
        var spawnedCount = 0;
        for (var index = 0; index < targetCount; index += 1)
        {
            var slot = availableSlots[index];
            slot.RespawnRemainingMs = 0;
            if (!TrySpawnMobInSlot(state, slot, events))
            {
                break;
            }

            spawnedCount += 1;
        }

        return spawnedCount;
    }

    private static void ApplyOrRefreshBuff(StoredBattle state, string buffId, int durationMs)
    {
        if (durationMs <= 0)
        {
            return;
        }

        var nowMs = GetElapsedMsForTick(state.Tick);
        state.ActiveBuffs[buffId] = new StoredBuff(
            buffId: buffId,
            expiresAtMs: nowMs + durationMs);
    }

    private static (string BuffId, int DurationMs) ResolveSpeciesChestBuff(MobArchetype? speciesArchetype)
    {
        if (speciesArchetype is MobArchetype.MeleeDemon or MobArchetype.RangedDragon)
        {
            return (DamageBoostBuffId, DamageBoostDurationMs);
        }

        if (speciesArchetype is MobArchetype.RangedArcher)
        {
            return (AntiRangedPressureBuffId, AntiRangedPressureDurationMs);
        }

        return (ThornsBoostBuffId, ThornsBoostDurationMs);
    }

    private static MobArchetype? TryResolveArchetypeBySpecies(string? species)
    {
        if (string.IsNullOrWhiteSpace(species))
        {
            return null;
        }

        return ArchetypeBySpecies.TryGetValue(species.Trim(), out var archetype)
            ? archetype
            : null;
    }

    private static SkillCastResult TryExecutePlayerSkillCast(
        StoredBattle state,
        List<BattleEventDto> events,
        string normalizedSkillId,
        ref int pendingLifeLeechHeal)
    {
        if (!state.Skills.TryGetValue(normalizedSkillId, out var skill))
        {
            return SkillCastResult.Fail(UnknownSkillReason);
        }

        if (skill.CooldownRemainingMs > 0)
        {
            return SkillCastResult.Fail(CooldownReason);
        }

        if (state.PlayerGlobalCooldownRemainingMs > 0)
        {
            return SkillCastResult.Fail(GlobalCooldownReason);
        }

        var player = GetPlayerActor(state);
        if (player is null)
        {
            return SkillCastResult.Fail(NoTargetReason);
        }

        if (string.Equals(normalizedSkillId, ExoriSkillId, StringComparison.Ordinal))
        {
            var hitAnyTarget = ApplyAreaSquareSkill(
                state,
                events,
                player,
                radius: 1,
                damage: 10,
                fxId: ExoriFxId,
                element: ExoriElement,
                ref pendingLifeLeechHeal);
            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, PlayerShieldGainPerAction);
            return SkillCastResult.Ok(hitAnyTarget ? null : NoTargetReason);
        }

        if (string.Equals(normalizedSkillId, ExoriMasSkillId, StringComparison.Ordinal))
        {
            var hitAnyTarget = ApplyAreaDiamondSkill(
                state,
                events,
                player,
                radius: 2,
                damage: 7,
                fxId: ExoriMasFxId,
                element: ExoriMasElement,
                ref pendingLifeLeechHeal);
            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, PlayerShieldGainPerAction);
            return SkillCastResult.Ok(hitAnyTarget ? null : NoTargetReason);
        }

        if (string.Equals(normalizedSkillId, ExoriMinSkillId, StringComparison.Ordinal))
        {
            var hitAnyTarget = ApplyFrontalMeleeSkill(
                state,
                events,
                player,
                damage: 15,
                fxId: ExoriMinFxId,
                element: ExoriMinElement,
                ref pendingLifeLeechHeal);
            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, PlayerShieldGainPerAction);
            return SkillCastResult.Ok(hitAnyTarget ? null : NoTargetReason);
        }

        if (string.Equals(normalizedSkillId, HealSkillId, StringComparison.Ordinal))
        {
            ApplySelfHealSkill(state, events, player);
            ApplyPlayerCooldownsForCast(state, skill);
            return SkillCastResult.Ok(null);
        }

        if (string.Equals(normalizedSkillId, GuardSkillId, StringComparison.Ordinal))
        {
            ApplyGuardSkill(events, player);
            ApplyPlayerCooldownsForCast(state, skill);
            return SkillCastResult.Ok(null);
        }

        if (string.Equals(normalizedSkillId, AvalancheSkillId, StringComparison.Ordinal))
        {
            var targetResolution = TryResolveAvalancheCastTarget(state, player);
            if (!targetResolution.HasTarget)
            {
                return SkillCastResult.Fail(targetResolution.FailReason ?? NoTargetReason);
            }

            var hitAnyTarget = ApplyGroundSquareSkillAt(
                state,
                events,
                targetResolution.TileX,
                targetResolution.TileY,
                radius: 1,
                damage: AvalancheDamage,
                fxId: AvalancheFxId,
                element: AvalancheElement,
                attacker: player,
                ref pendingLifeLeechHeal);
            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, PlayerShieldGainPerAction);
            return SkillCastResult.Ok(hitAnyTarget ? null : NoTargetReason);
        }

        return SkillCastResult.Fail(UnknownSkillReason);
    }

    private static void ApplyPlayerCooldownsForCast(StoredBattle state, StoredSkill skill)
    {
        skill.CooldownRemainingMs = ResolveSkillCooldownTotalMs(state, skill);
        state.PlayerGlobalCooldownRemainingMs = ResolvePlayerGlobalCooldownMs(state);
    }

    private static void EvaluateCombatAssist(
        StoredBattle state,
        List<BattleEventDto> events,
        ref int pendingLifeLeechHeal,
        bool hasManualCastSkillCommand)
    {
        if (hasManualCastSkillCommand)
        {
            return;
        }

        var assist = state.AssistConfig;
        if (!assist.Enabled)
        {
            return;
        }

        var player = GetPlayerActor(state);
        if (player is null || player.MaxHp <= 0 || player.Hp <= 0)
        {
            return;
        }

        var castsRemaining = Math.Max(0, assist.MaxAutoCastsPerTick);
        while (castsRemaining > 0)
        {
            if (TryApplyAssistDefensiveCast(state, events, player, assist, ref pendingLifeLeechHeal))
            {
                castsRemaining -= 1;
                continue;
            }

            if (TryApplyAssistOffensiveCast(state, events, player, assist, ref pendingLifeLeechHeal))
            {
                castsRemaining -= 1;
                continue;
            }

            break;
        }
    }

    private static bool TryApplyAssistDefensiveCast(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player,
        StoredAssistConfig assist,
        ref int pendingLifeLeechHeal)
    {
        var hpPercent = (int)Math.Floor((player.Hp * 100.0d) / player.MaxHp);

        if (assist.AutoGuardEnabled && hpPercent <= assist.GuardAtHpPercent)
        {
            if (TryApplyAssistSkillCast(state, events, GuardSkillId, AssistReasonAutoGuard, ref pendingLifeLeechHeal))
            {
                return true;
            }
        }

        if (assist.AutoHealEnabled && hpPercent <= assist.HealAtHpPercent)
        {
            if (TryApplyAssistSkillCast(state, events, HealSkillId, AssistReasonAutoHeal, ref pendingLifeLeechHeal))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TryApplyAssistOffensiveCast(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player,
        StoredAssistConfig assist,
        ref int pendingLifeLeechHeal)
    {
        if (!assist.AutoOffenseEnabled)
        {
            return false;
        }

        if (ResolveEffectivePlayerAutoAttackTarget(state, player) is null)
        {
            return false;
        }

        foreach (var skillId in AssistOffenseSkillPriority)
        {
            if (!assist.AutoSkills.TryGetValue(skillId, out var isEnabled) || !isEnabled)
            {
                continue;
            }

            if (TryApplyAssistSkillCast(state, events, skillId, AssistReasonAutoOffense, ref pendingLifeLeechHeal))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TryApplyAssistSkillCast(
        StoredBattle state,
        List<BattleEventDto> events,
        string skillId,
        string reason,
        ref int pendingLifeLeechHeal)
    {
        var castResult = TryExecutePlayerSkillCast(state, events, skillId, ref pendingLifeLeechHeal);
        if (!castResult.Success)
        {
            return false;
        }

        events.Add(new AssistCastEventDto(skillId, reason));
        return true;
    }

    private static void TickSkillCooldowns(StoredBattle state)
    {
        foreach (var skill in state.Skills.Values)
        {
            skill.CooldownRemainingMs = Math.Max(0, skill.CooldownRemainingMs - StepDeltaMs);
        }
    }

    private static void TickPlayerAutoAttackCooldown(StoredBattle state)
    {
        state.PlayerAttackCooldownRemainingMs = Math.Max(0, state.PlayerAttackCooldownRemainingMs - StepDeltaMs);
    }

    private static void TickPlayerMoveCooldown(StoredBattle state)
    {
        state.PlayerMoveCooldownRemainingMs = Math.Max(0, state.PlayerMoveCooldownRemainingMs - StepDeltaMs);
    }

    private static void TickPlayerGlobalCooldown(StoredBattle state)
    {
        state.PlayerGlobalCooldownRemainingMs = Math.Max(0, state.PlayerGlobalCooldownRemainingMs - StepDeltaMs);
    }

    private static void TickMobCombatCooldowns(StoredBattle state)
    {
        foreach (var slot in state.MobSlots.Values)
        {
            slot.AttackCooldownRemainingMs = Math.Max(0, slot.AttackCooldownRemainingMs - StepDeltaMs);
            slot.AbilityCooldownRemainingMs = Math.Max(0, slot.AbilityCooldownRemainingMs - StepDeltaMs);
        }
    }

    private static void TickMobMovement(StoredBattle state)
    {
        var player = GetPlayerActor(state);
        if (player is null)
        {
            return;
        }

        var mobs = state.Actors.Values
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();

        foreach (var mob in mobs)
        {
            if (!state.Actors.TryGetValue(mob.ActorId, out var liveMob))
            {
                continue;
            }

            if (liveMob.MobSlotIndex is not int slotIndex || !state.MobSlots.TryGetValue(slotIndex, out var slot))
            {
                continue;
            }

            var config = GetMobConfig(slot.Archetype);
            slot.MoveCooldownRemainingMs -= StepDeltaMs;
            while (slot.MoveCooldownRemainingMs <= 0)
            {
                slot.MoveCooldownRemainingMs += config.MoveCooldownMs;
                if (slot.MoveCooldownRemainingMs <= 0)
                {
                    slot.MoveCooldownRemainingMs = config.MoveCooldownMs;
                }

                var behavior = GetMobBehavior(slot.Archetype);
                if (!behavior.TryChooseMove(state, liveMob, player, slot, config, out var destination))
                {
                    break;
                }

                if (!TryMoveMobToTile(state, liveMob, destination))
                {
                    break;
                }
            }
        }
    }

    private static void TickMobCommitWindows(StoredBattle state)
    {
        foreach (var slot in state.MobSlots.Values)
        {
            slot.CommitTicksRemaining = Math.Max(0, slot.CommitTicksRemaining - 1);
        }
    }

    private static void TickMobRespawns(StoredBattle state, List<BattleEventDto> events)
    {
        var maxAliveMobs = GetMaxAliveMobsForTick(state.Tick);
        foreach (var slot in state.MobSlots.Values.OrderBy(value => value.SlotIndex))
        {
            if (slot.SlotIndex > maxAliveMobs)
            {
                slot.RespawnRemainingMs = 0;
                continue;
            }

            if (state.Actors.ContainsKey(slot.ActorId))
            {
                slot.RespawnRemainingMs = 0;
                continue;
            }

            if (slot.RespawnRemainingMs > 0)
            {
                slot.RespawnRemainingMs = Math.Max(0, slot.RespawnRemainingMs - StepDeltaMs);
            }

            if (slot.RespawnRemainingMs == 0)
            {
                // If no free tile exists, spawn is skipped deterministically for this step.
                TrySpawnMobInSlot(state, slot, events);
            }
        }
    }

    private static void TickDecals(StoredBattle state)
    {
        if (state.Decals.Count == 0)
        {
            return;
        }

        for (var index = state.Decals.Count - 1; index >= 0; index -= 1)
        {
            var decal = state.Decals[index];
            decal.RemainingMs = Math.Max(0, decal.RemainingMs - StepDeltaMs);
            if (decal.RemainingMs == 0)
            {
                state.Decals.RemoveAt(index);
            }
        }
    }

    private static void TickPois(StoredBattle state, List<BattleEventDto> events)
    {
        var nowMs = GetElapsedMsForTick(state.Tick);
        if (state.Pois.Count > 0)
        {
            var expiredPoiIds = state.Pois.Values
                .Where(poi => poi.ExpiresAtMs <= nowMs)
                .Select(poi => poi.PoiId)
                .ToList();
            foreach (var poiId in expiredPoiIds)
            {
                state.Pois.Remove(poiId);
            }
        }

        TrySpawnPendingSpeciesChest(state, events, nowMs);

        // Chest spawn checks run on a fixed simulation cadence to keep outcomes deterministic.
        while (nowMs >= state.NextChestSpawnCheckAtMs)
        {
            TrySpawnChestPoi(state, state.NextChestSpawnCheckAtMs);
            state.NextChestSpawnCheckAtMs += ChestSpawnCheckMs;
        }

        // Altar checks run after chest checks to keep POI ordering deterministic.
        while (nowMs >= state.NextAltarSpawnCheckAtMs)
        {
            TrySpawnAltarPoi(state, state.NextAltarSpawnCheckAtMs);
            state.NextAltarSpawnCheckAtMs += AltarSpawnCheckMs;
        }
    }

    private static void TickBuffs(StoredBattle state)
    {
        if (state.ActiveBuffs.Count == 0)
        {
            return;
        }

        var nowMs = GetElapsedMsForTick(state.Tick);
        var expiredBuffIds = state.ActiveBuffs.Values
            .Where(buff => buff.ExpiresAtMs <= nowMs)
            .Select(buff => buff.BuffId)
            .ToList();
        foreach (var buffId in expiredBuffIds)
        {
            state.ActiveBuffs.Remove(buffId);
        }
    }

    private static void TrySpawnChestPoi(StoredBattle state, long checkAtMs)
    {
        if (state.PendingSpeciesChestArchetype is not null)
        {
            return;
        }

        if (HasAnyActiveChestPoi(state, checkAtMs))
        {
            return;
        }

        if (state.PoiRng.Next(100) >= ChestSpawnChancePercent)
        {
            return;
        }

        var freeTiles = BuildPoiSpawnTiles(state, checkAtMs);
        if (freeTiles.Count == 0)
        {
            return;
        }

        var tileIndex = state.PoiRng.Next(freeTiles.Count);
        var tile = freeTiles[tileIndex];
        var poiId = BuildChestPoiId(state.NextPoiSequence);
        state.NextPoiSequence += 1;
        state.Pois[poiId] = new StoredPoi(
            poiId: poiId,
            type: PoiTypeChest,
            tileX: tile.TileX,
            tileY: tile.TileY,
            expiresAtMs: checkAtMs + ChestLifetimeMs,
            species: null,
            metadata: null);
    }

    private static void TrySpawnAltarPoi(StoredBattle state, long checkAtMs)
    {
        if (HasActiveAltarPoi(state, checkAtMs))
        {
            return;
        }

        if (state.Rng.Next(100) >= AltarSpawnChancePercent)
        {
            return;
        }

        var freeTiles = BuildPoiSpawnTiles(state, checkAtMs);
        if (freeTiles.Count == 0)
        {
            return;
        }

        var tileIndex = state.Rng.Next(freeTiles.Count);
        var tile = freeTiles[tileIndex];
        var poiId = BuildAltarPoiId(state.NextPoiSequence);
        state.NextPoiSequence += 1;
        state.Pois[poiId] = new StoredPoi(
            poiId: poiId,
            type: PoiTypeAltar,
            tileX: tile.TileX,
            tileY: tile.TileY,
            expiresAtMs: checkAtMs + AltarLifetimeMs,
            species: null,
            metadata: null);
    }

    private static void TrySpawnPendingSpeciesChest(
        StoredBattle state,
        List<BattleEventDto> events,
        long nowMs)
    {
        if (state.PendingSpeciesChestArchetype is not MobArchetype archetype)
        {
            return;
        }

        if (HasAnyActiveChestPoi(state, nowMs))
        {
            return;
        }

        if (TrySpawnSpeciesChestPoi(state, events, archetype, nowMs))
        {
            state.PendingSpeciesChestArchetype = null;
        }
    }

    private static bool TrySpawnSpeciesChestPoi(
        StoredBattle state,
        List<BattleEventDto> events,
        MobArchetype speciesArchetype,
        long spawnAtMs)
    {
        var freeTiles = BuildPoiSpawnTiles(state, spawnAtMs);
        if (freeTiles.Count == 0)
        {
            return false;
        }

        var tileIndex = state.PoiRng.Next(freeTiles.Count);
        var tile = freeTiles[tileIndex];
        var poiId = BuildSpeciesChestPoiId(state.NextPoiSequence);
        state.NextPoiSequence += 1;
        var species = GetSpeciesId(speciesArchetype);
        state.Pois[poiId] = new StoredPoi(
            poiId: poiId,
            type: PoiTypeSpeciesChest,
            tileX: tile.TileX,
            tileY: tile.TileY,
            expiresAtMs: spawnAtMs + SpeciesChestLifetimeMs,
            species: species,
            metadata: null);
        events.Add(new SpeciesChestSpawnedEventDto(
            Species: species,
            PoiId: poiId,
            TileX: tile.TileX,
            TileY: tile.TileY));
        return true;
    }

    private static bool HasActiveChestPoi(StoredBattle state, long nowMs)
    {
        return state.Pois.Values.Any(poi =>
            IsChestPoiType(poi.Type) &&
            poi.ExpiresAtMs > nowMs);
    }

    private static bool HasAnyActiveChestPoi(StoredBattle state, long nowMs)
    {
        return HasActiveChestPoi(state, nowMs);
    }

    private static bool HasActiveAltarPoi(StoredBattle state, long nowMs)
    {
        return state.Pois.Values.Any(poi =>
            string.Equals(poi.Type, PoiTypeAltar, StringComparison.Ordinal) &&
            poi.ExpiresAtMs > nowMs);
    }

    private static List<(int TileX, int TileY)> BuildPoiSpawnTiles(StoredBattle state, long nowMs)
    {
        var occupiedActorTiles = new HashSet<(int TileX, int TileY)>(
            state.Actors.Values.Select(actor => (actor.TileX, actor.TileY)));
        var occupiedPoiTiles = new HashSet<(int TileX, int TileY)>(
            state.Pois.Values
                .Where(poi => poi.ExpiresAtMs > nowMs)
                .Select(poi => (poi.TileX, poi.TileY)));

        var freeTiles = new List<(int TileX, int TileY)>();
        for (var y = 0; y < ArenaConfig.Height; y += 1)
        {
            for (var x = 0; x < ArenaConfig.Width; x += 1)
            {
                if (occupiedActorTiles.Contains((x, y)) || occupiedPoiTiles.Contains((x, y)))
                {
                    continue;
                }

                freeTiles.Add((x, y));
            }
        }

        return freeTiles;
    }

    private static string BuildChestPoiId(int sequence)
    {
        return $"poi.chest.{sequence:D4}";
    }

    private static string BuildSpeciesChestPoiId(int sequence)
    {
        return $"poi.species_chest.{sequence:D4}";
    }

    private static string BuildAltarPoiId(int sequence)
    {
        return $"poi.altar.{sequence:D4}";
    }

    private static bool IsChestPoiType(string poiType)
    {
        return string.Equals(poiType, PoiTypeChest, StringComparison.Ordinal) ||
               string.Equals(poiType, PoiTypeSpeciesChest, StringComparison.Ordinal);
    }

    private static bool TrySpawnMobInSlot(StoredBattle state, MobSlotState slot, List<BattleEventDto>? events = null)
    {
        if (state.Actors.ContainsKey(slot.ActorId))
        {
            return true;
        }

        var player = GetPlayerActor(state);
        var spawnCenterX = player?.TileX ?? ArenaConfig.PlayerTileX;
        var spawnCenterY = player?.TileY ?? ArenaConfig.PlayerTileY;
        var freeTiles = BuildFreeTiles(state);
        if (freeTiles.Count == 0)
        {
            return false;
        }

        var preferredRingTiles = freeTiles
            .Where(tile =>
            {
                var distance = ComputeChebyshevDistance(tile.TileX, tile.TileY, spawnCenterX, spawnCenterY);
                return distance >= MobSpawnRingMinDistance && distance <= MobSpawnRingMaxDistance;
            })
            .ToList();

        var candidateTiles = preferredRingTiles.Count > 0 ? preferredRingTiles : freeTiles;
        var tileIndex = state.Rng.Next(candidateTiles.Count);
        var tile = candidateTiles[tileIndex];
        var config = GetMobConfig(slot.Archetype);
        var maxHp = ResolveScaledMobMaxHp(state, config, slot.IsElite);
        state.Actors[slot.ActorId] = new StoredActor(
            actorId: slot.ActorId,
            kind: slot.Kind,
            mobType: slot.Archetype,
            isElite: slot.IsElite,
            buffSourceEliteId: null,
            facingDirection: FacingUp,
            tileX: tile.TileX,
            tileY: tile.TileY,
            hp: maxHp,
            maxHp: maxHp,
            shield: 0,
            maxShield: 0,
            mobSlotIndex: slot.SlotIndex);
        if (slot.IsElite && events is not null)
        {
            events.Add(new EliteSpawnedEventDto(
                EliteEntityId: slot.ActorId,
                MobType: slot.Archetype));
        }

        if (slot.IsElite)
        {
            MaintainEliteCommanderBuffs(state, events);
        }

        var spawnedMob = state.Actors[slot.ActorId];
        slot.AttackCooldownRemainingMs = RollInitialAutoAttackCooldownMs(
            state,
            ResolveMobAutoAttackCooldownMs(config, spawnedMob));
        slot.AbilityCooldownRemainingMs = 0;
        slot.MoveCooldownRemainingMs = 0;
        slot.CommitTicksRemaining = 0;
        return true;
    }

    private static int RollInitialAutoAttackCooldownMs(StoredBattle state, int autoAttackCooldownMs)
    {
        if (autoAttackCooldownMs <= 0)
        {
            return 0;
        }

        if (autoAttackCooldownMs == 1)
        {
            return 1;
        }

        return state.Rng.Next(1, autoAttackCooldownMs + 1);
    }

    private static void MaintainEliteCommanderBuffs(StoredBattle state, List<BattleEventDto>? events)
    {
        var elites = state.Actors.Values
            .Where(actor =>
                string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                actor.IsElite)
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();
        if (elites.Count == 0)
        {
            return;
        }

        var aliveEliteIds = elites
            .Select(elite => elite.ActorId)
            .ToHashSet(StringComparer.Ordinal);
        var staleBuffTargets = state.Actors.Values
            .Where(actor =>
                string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                !actor.IsElite &&
                actor.BuffSourceEliteId is not null &&
                !aliveEliteIds.Contains(actor.BuffSourceEliteId))
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();
        foreach (var staleTarget in staleBuffTargets)
        {
            if (staleTarget.BuffSourceEliteId is not string staleSourceEliteId)
            {
                continue;
            }

            TryRemoveEliteCommanderBuffFromMob(staleTarget, staleSourceEliteId, events);
        }

        foreach (var elite in elites)
        {
            var assignedCount = state.Actors.Values.Count(actor =>
                string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                !actor.IsElite &&
                string.Equals(actor.BuffSourceEliteId, elite.ActorId, StringComparison.Ordinal));
            var remaining = EliteCommanderMaxBuffTargets - assignedCount;
            if (remaining <= 0)
            {
                continue;
            }

            var sameSpeciesCandidates = state.Actors.Values
                .Where(actor =>
                    IsValidEliteBuffTarget(elite, actor) &&
                    actor.MobType == elite.MobType)
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .ToList();
            var anyCandidates = state.Actors.Values
                .Where(actor => IsValidEliteBuffTarget(elite, actor))
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .ToList();

            while (remaining > 0)
            {
                var candidatePool = sameSpeciesCandidates.Count > 0
                    ? sameSpeciesCandidates
                    : anyCandidates;
                if (candidatePool.Count == 0)
                {
                    break;
                }

                var selectedIndex = state.Rng.Next(candidatePool.Count);
                var selected = candidatePool[selectedIndex];
                selected.BuffSourceEliteId = elite.ActorId;
                events?.Add(new EliteBuffAppliedEventDto(
                    EliteEntityId: elite.ActorId,
                    TargetEntityId: selected.ActorId));
                remaining -= 1;

                sameSpeciesCandidates.RemoveAll(candidate =>
                    string.Equals(candidate.ActorId, selected.ActorId, StringComparison.Ordinal));
                anyCandidates.RemoveAll(candidate =>
                    string.Equals(candidate.ActorId, selected.ActorId, StringComparison.Ordinal));
            }
        }
    }

    private static bool IsValidEliteBuffTarget(StoredActor elite, StoredActor candidate)
    {
        return string.Equals(candidate.Kind, "mob", StringComparison.Ordinal) &&
               !candidate.IsElite &&
               candidate.Hp > 0 &&
               string.IsNullOrWhiteSpace(candidate.BuffSourceEliteId) &&
               !string.Equals(candidate.ActorId, elite.ActorId, StringComparison.Ordinal);
    }

    private static bool TryRemoveEliteCommanderBuffFromMob(
        StoredActor mob,
        string sourceEliteId,
        List<BattleEventDto>? events)
    {
        if (!string.Equals(mob.BuffSourceEliteId, sourceEliteId, StringComparison.Ordinal))
        {
            return false;
        }

        mob.BuffSourceEliteId = null;
        events?.Add(new EliteBuffRemovedEventDto(
            EliteEntityId: sourceEliteId,
            TargetEntityId: mob.ActorId));
        return true;
    }

    private static void RemoveEliteCommanderBuffs(StoredBattle state, string eliteActorId, List<BattleEventDto>? events)
    {
        var buffedTargets = state.Actors.Values
            .Where(actor =>
                string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                !actor.IsElite &&
                string.Equals(actor.BuffSourceEliteId, eliteActorId, StringComparison.Ordinal))
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();
        foreach (var target in buffedTargets)
        {
            TryRemoveEliteCommanderBuffFromMob(target, eliteActorId, events);
        }
    }

    private static List<(int TileX, int TileY)> BuildFreeTiles(StoredBattle state)
    {
        var occupied = new HashSet<(int TileX, int TileY)>(
            state.Actors.Values.Select(actor => (actor.TileX, actor.TileY)));
        var nowMs = GetElapsedMsForTick(state.Tick);
        foreach (var poi in state.Pois.Values)
        {
            if (poi.ExpiresAtMs > nowMs)
            {
                occupied.Add((poi.TileX, poi.TileY));
            }
        }

        var freeTiles = new List<(int TileX, int TileY)>();
        for (var y = 0; y < ArenaConfig.Height; y += 1)
        {
            for (var x = 0; x < ArenaConfig.Width; x += 1)
            {
                if (!occupied.Contains((x, y)))
                {
                    freeTiles.Add((x, y));
                }
            }
        }

        return freeTiles;
    }

    private static void ApplyPlayerAutoAttack(
        StoredBattle state,
        List<BattleEventDto> events,
        ref int pendingLifeLeechHeal)
    {
        if (state.PlayerAttackCooldownRemainingMs > 0)
        {
            return;
        }

        var player = GetPlayerActor(state);
        if (player is null)
        {
            return;
        }

        var targetMob = ResolveEffectivePlayerAutoAttackTarget(state, player);

        if (targetMob is null)
        {
            return;
        }

        if (ComputeChebyshevDistance(targetMob, player.TileX, player.TileY) > 1)
        {
            // Effective target can exist while out of melee range; no hit occurs this tick.
            return;
        }

        var playerBaseElement = GetPlayerBaseElement(state);
        EmitAttackFx(
            state,
            events,
            fxKind: CombatFxKind.MeleeSwing,
            fromActor: player,
            toActor: targetMob,
            elementType: playerBaseElement,
            durationMs: MeleeSwingDurationMs);

        events.Add(new FxSpawnEventDto(
            FxId: "fx.hit.small",
            TileX: targetMob.TileX,
            TileY: targetMob.TileY,
            Layer: "hitFx",
            DurationMs: 620,
            Element: playerBaseElement));

        var hpDamageApplied = ApplyDamageToMob(
            state,
            events,
            targetMob,
            PlayerAutoAttackDamage,
            playerBaseElement,
            attacker: player);
        pendingLifeLeechHeal += ComputeLifeLeechHeal(hpDamageApplied);
        GrantPlayerShield(state, events, PlayerShieldGainPerAction);
        state.PlayerAttackCooldownRemainingMs = ResolvePlayerAutoAttackCooldownMs(state);
    }

    private static void UpdatePlayerFacingTowardEffectiveAutoAttackTarget(StoredBattle state)
    {
        var player = GetPlayerActor(state);
        if (player is null)
        {
            return;
        }

        var effectiveTarget = ResolveEffectivePlayerAutoAttackTarget(state, player);
        if (effectiveTarget is null)
        {
            // No effective auto-attack target this tick; keep current facing unchanged.
            return;
        }

        state.PlayerFacingDirection = ResolveFacingDirectionTowardTile(
            player.TileX,
            player.TileY,
            effectiveTarget.TileX,
            effectiveTarget.TileY,
            state.PlayerFacingDirection);
    }

    private static StoredActor? ResolveEffectivePlayerAutoAttackTarget(StoredBattle state, StoredActor player)
    {
        var lockedTarget = ResolveLockedTargetMobAnyDistance(state);
        if (lockedTarget is not null)
        {
            return lockedTarget;
        }

        return state.Actors.Values
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => ComputeChebyshevDistance(actor, player.TileX, player.TileY))
            .ThenBy(actor => actor.ActorId, StringComparer.Ordinal)
            .FirstOrDefault();
    }

    private static string? ResolveEffectivePlayerAutoAttackTargetEntityId(StoredBattle state)
    {
        var player = GetPlayerActor(state);
        if (player is null)
        {
            return null;
        }

        return ResolveEffectivePlayerAutoAttackTarget(state, player)?.ActorId;
    }

    private static void ApplyMobAutoAttacks(StoredBattle state, List<BattleEventDto> events)
    {
        var player = GetPlayerActor(state);
        if (player is null)
        {
            return;
        }

        var mobs = state.Actors.Values
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();

        foreach (var mob in mobs)
        {
            if (IsDefeat(state))
            {
                return;
            }

            if (!state.Actors.TryGetValue(mob.ActorId, out var liveMob))
            {
                continue;
            }

            if (liveMob.MobSlotIndex is not int slotIndex || !state.MobSlots.TryGetValue(slotIndex, out var slot))
            {
                continue;
            }

            if (slot.AttackCooldownRemainingMs > 0)
            {
                continue;
            }

            var config = GetMobConfig(slot.Archetype);
            var behavior = GetMobBehavior(slot.Archetype);
            if (!behavior.CanAutoAttack(state, liveMob, player, slot, config))
            {
                continue;
            }

            var attackFxKind = config.AutoAttackRangeTiles > 1
                ? CombatFxKind.RangedProjectile
                : CombatFxKind.MeleeSwing;
            var attackFxDuration = attackFxKind == CombatFxKind.RangedProjectile
                ? RangedProjectileDurationMs
                : MeleeSwingDurationMs;
            EmitAttackFx(
                state,
                events,
                attackFxKind,
                fromActor: liveMob,
                toActor: player,
                elementType: DefaultMobElement,
                durationMs: attackFxDuration);

            events.Add(new FxSpawnEventDto(
                FxId: "fx.hit.small",
                TileX: player.TileX,
                TileY: player.TileY,
                Layer: "hitFx",
                DurationMs: 620,
                Element: DefaultMobElement));

            ApplyDamageToPlayer(
                state,
                events,
                player,
                ResolveMobOutgoingDamage(state, liveMob, config.AutoAttackDamage),
                DefaultMobElement,
                attacker: liveMob,
                isRangedAutoAttack: config.AutoAttackRangeTiles > 1);
            slot.AttackCooldownRemainingMs = ResolveMobAutoAttackCooldownMs(config, liveMob);
            SetRangedCommitWindowIfNeeded(slot);
            if (IsDefeat(state))
            {
                return;
            }
        }
    }

    private static void ApplyMobAbilities(StoredBattle state, List<BattleEventDto> events)
    {
        var player = GetPlayerActor(state);
        if (player is null)
        {
            return;
        }

        var mobs = state.Actors.Values
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();

        foreach (var mob in mobs)
        {
            if (IsDefeat(state))
            {
                return;
            }

            if (!state.Actors.TryGetValue(mob.ActorId, out var liveMob))
            {
                continue;
            }

            if (liveMob.MobSlotIndex is not int slotIndex || !state.MobSlots.TryGetValue(slotIndex, out var slot))
            {
                continue;
            }

            if (slot.AbilityCooldownRemainingMs > 0)
            {
                continue;
            }

            var config = GetMobConfig(slot.Archetype);
            var behavior = GetMobBehavior(slot.Archetype);
            if (!behavior.TryCastAbility(state, liveMob, player, slot, config, events))
            {
                continue;
            }

            slot.AbilityCooldownRemainingMs = config.AbilityCooldownMs;
            SetRangedCommitWindowIfNeeded(slot);
        }
    }

    private static bool TryCastMeleeCleaveAbility(
        StoredBattle state,
        StoredActor mob,
        StoredActor player,
        MobArchetypeConfig config,
        List<BattleEventDto> events)
    {
        if (!IsAdjacent(mob, player))
        {
            return false;
        }

        var tiles = new[] { (player.TileX, player.TileY) };
        EmitAttackFx(
            state,
            events,
            fxKind: CombatFxKind.MeleeSwing,
            fromActor: mob,
            toActor: player,
            elementType: DefaultMobElement,
            durationMs: MeleeSwingDurationMs);
        EmitFxForTiles(events, tiles, config.AbilityFxId, DefaultMobElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            DefaultMobElement,
            attacker: mob);
        return true;
    }

    private static bool TryCastRangedSingleTargetAbility(
        StoredBattle state,
        StoredActor mob,
        StoredActor player,
        MobArchetypeConfig config,
        List<BattleEventDto> events)
    {
        var distance = ComputeChebyshevDistance(mob, player.TileX, player.TileY);
        if (distance > config.AbilityRangeTiles)
        {
            return false;
        }

        var tiles = new[] { (player.TileX, player.TileY) };
        EmitAttackFx(
            state,
            events,
            fxKind: CombatFxKind.RangedProjectile,
            fromActor: mob,
            toActor: player,
            elementType: DefaultMobElement,
            durationMs: RangedProjectileDurationMs);
        EmitFxForTiles(events, tiles, config.AbilityFxId, DefaultMobElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            DefaultMobElement,
            attacker: mob);
        return true;
    }

    private static bool TryCastDemonBeamAbility(
        StoredBattle state,
        StoredActor mob,
        StoredActor player,
        MobArchetypeConfig config,
        List<BattleEventDto> events)
    {
        SetMobFacingTowardTarget(mob, player.TileX, player.TileY);
        var playerDistance = ComputeChebyshevDistance(mob, player.TileX, player.TileY);
        var lineTiles = MobShapePlanner.BuildForwardLineTiles(mob.TileX, mob.TileY, mob.FacingDirection, length: 4).ToList();
        var playerCollinearInFront = lineTiles.Any(tile => tile.TileX == player.TileX && tile.TileY == player.TileY);
        if (!playerCollinearInFront && playerDistance > 3)
        {
            return false;
        }

        EmitFxForTiles(events, lineTiles, config.AbilityFxId, DefaultMobElement);
        if (playerCollinearInFront)
        {
            ApplyDamageToPlayer(
                state,
                events,
                player,
                ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
                DefaultMobElement,
                attacker: mob);
        }

        return true;
    }

    private static bool TryCastDragonBreathAbility(
        StoredBattle state,
        StoredActor mob,
        StoredActor player,
        MobArchetypeConfig config,
        List<BattleEventDto> events)
    {
        SetMobFacingTowardTarget(mob, player.TileX, player.TileY);
        var coneTiles = MobShapePlanner.BuildForwardConeTiles(mob.TileX, mob.TileY, mob.FacingDirection).ToList();
        var playerInCone = coneTiles.Any(tile => tile.TileX == player.TileX && tile.TileY == player.TileY);
        if (!playerInCone)
        {
            return false;
        }

        EmitFxForTiles(events, coneTiles, config.AbilityFxId, DefaultMobElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            DefaultMobElement,
            attacker: mob);
        return true;
    }

    private static bool ApplyAreaSquareSkill(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player,
        int radius,
        int damage,
        string fxId,
        ElementType element,
        ref int pendingLifeLeechHeal)
    {
        var tiles = BuildSquareTiles(player.TileX, player.TileY, radius, includeCenter: false);
        return ApplyTileSkill(state, events, tiles, damage, fxId, element, player, ref pendingLifeLeechHeal);
    }

    private static bool ApplyAreaDiamondSkill(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player,
        int radius,
        int damage,
        string fxId,
        ElementType element,
        ref int pendingLifeLeechHeal)
    {
        var tiles = BuildDiamondTiles(player.TileX, player.TileY, radius, includeCenter: false);
        return ApplyTileSkill(state, events, tiles, damage, fxId, element, player, ref pendingLifeLeechHeal);
    }

    private static bool ApplyFrontalMeleeSkill(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player,
        int damage,
        string fxId,
        ElementType element,
        ref int pendingLifeLeechHeal)
    {
        var frontalTiles = BuildFrontalTiles(player.TileX, player.TileY, state.PlayerFacingDirection);
        return ApplyTileSkill(state, events, frontalTiles, damage, fxId, element, player, ref pendingLifeLeechHeal);
    }

    private static bool ApplyGroundSquareSkillAt(
        StoredBattle state,
        List<BattleEventDto> events,
        int centerTileX,
        int centerTileY,
        int radius,
        int damage,
        string fxId,
        ElementType element,
        StoredActor attacker,
        ref int pendingLifeLeechHeal)
    {
        var affectedTiles = BuildSquareTiles(centerTileX, centerTileY, radius, includeCenter: true)
            .Where(tile => IsInBounds(tile.TileX, tile.TileY))
            .Distinct()
            .ToList();
        EmitFxForTiles(events, affectedTiles, fxId, element);

        var targetMobIds = ResolveMobIdsOnTiles(state, affectedTiles).ToList();
        foreach (var mobId in targetMobIds)
        {
            if (!state.Actors.TryGetValue(mobId, out var mob))
            {
                continue;
            }

            var hpDamageApplied = ApplyDamageToMob(state, events, mob, damage, element, attacker);
            pendingLifeLeechHeal += ComputeLifeLeechHeal(hpDamageApplied);
        }

        return targetMobIds.Count > 0;
    }

    private static AvalancheCastTargetResolution TryResolveAvalancheCastTarget(StoredBattle state, StoredActor player)
    {
        int targetTileX;
        int targetTileY;

        if (state.GroundTargetTileX.HasValue && state.GroundTargetTileY.HasValue)
        {
            targetTileX = state.GroundTargetTileX.Value;
            targetTileY = state.GroundTargetTileY.Value;
        }
        else if (ResolveEffectivePlayerAutoAttackTarget(state, player) is { } effectiveTargetMob)
        {
            targetTileX = effectiveTargetMob.TileX;
            targetTileY = effectiveTargetMob.TileY;
        }
        else
        {
            return AvalancheCastTargetResolution.Fail(NoTargetReason);
        }

        if (ComputeManhattanDistance(player.TileX, player.TileY, targetTileX, targetTileY) > AvalancheRangeTilesManhattan)
        {
            return AvalancheCastTargetResolution.Fail(OutOfRangeReason);
        }

        return AvalancheCastTargetResolution.Success(targetTileX, targetTileY);
    }

    private static bool ApplyTileSkill(
        StoredBattle state,
        List<BattleEventDto> events,
        IEnumerable<(int TileX, int TileY)> tiles,
        int damage,
        string fxId,
        ElementType element,
        StoredActor attacker,
        ref int pendingLifeLeechHeal)
    {
        var affectedTiles = SanitizeSkillTiles(tiles, attacker.TileX, attacker.TileY);
        EmitFxForTiles(events, affectedTiles, fxId, element);

        var targetMobIds = ResolveMobIdsOnTiles(state, affectedTiles).ToList();
        foreach (var mobId in targetMobIds)
        {
            if (state.Actors.TryGetValue(mobId, out var mob))
            {
                var hpDamageApplied = ApplyDamageToMob(state, events, mob, damage, element, attacker);
                pendingLifeLeechHeal += ComputeLifeLeechHeal(hpDamageApplied);
            }
        }

        return targetMobIds.Count > 0;
    }

    private static void EmitFxForTiles(
        List<BattleEventDto> events,
        IEnumerable<(int TileX, int TileY)> tiles,
        string fxId,
        ElementType element)
    {
        foreach (var tile in tiles)
        {
            if (!IsInBounds(tile.TileX, tile.TileY))
            {
                continue;
            }

            events.Add(new FxSpawnEventDto(
                FxId: fxId,
                TileX: tile.TileX,
                TileY: tile.TileY,
                Layer: "groundFx",
                DurationMs: 520,
                Element: element));
        }
    }

    private static void EmitAttackFx(
        StoredBattle state,
        List<BattleEventDto> events,
        CombatFxKind fxKind,
        StoredActor fromActor,
        StoredActor toActor,
        ElementType elementType,
        int durationMs)
    {
        events.Add(new AttackFxEventDto(
            FxKind: fxKind,
            FromTileX: fromActor.TileX,
            FromTileY: fromActor.TileY,
            ToTileX: toActor.TileX,
            ToTileY: toActor.TileY,
            ElementType: elementType,
            DurationMs: durationMs,
            CreatedAtTick: state.Tick,
            EventId: NextTickEventId(state)));
    }

    private static int NextTickEventId(StoredBattle state)
    {
        state.TickEventCounter += 1;
        return state.TickEventCounter;
    }

    private static string ResolveHitKind(StoredBattle state, bool allowCriticalHits)
    {
        if (!allowCriticalHits)
        {
            return BattleHitKinds.Normal;
        }

        return state.CritRng.Next(100) < CriticalHitChancePercent
            ? BattleHitKinds.Crit
            : BattleHitKinds.Normal;
    }

    private static void EmitCritTextEvent(List<BattleEventDto> events, int tileX, int tileY, long startAtMs)
    {
        events.Add(new CritTextEventDto(
            Text: CritTextLabel,
            TileX: tileX,
            TileY: tileY,
            StartAtMs: startAtMs,
            DurationMs: CritTextDurationMs));
    }

    private static IEnumerable<string> ResolveMobIdsOnTiles(StoredBattle state, IReadOnlyList<(int TileX, int TileY)> tiles)
    {
        var tileSet = new HashSet<(int TileX, int TileY)>(tiles.Where(tile => IsInBounds(tile.TileX, tile.TileY)));
        return state.Actors.Values
            .Where(actor => actor.Kind == "mob" && tileSet.Contains((actor.TileX, actor.TileY)))
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => actor.ActorId);
    }

    private static List<(int TileX, int TileY)> SanitizeSkillTiles(
        IEnumerable<(int TileX, int TileY)> tiles,
        int playerTileX,
        int playerTileY)
    {
        var sanitized = new List<(int TileX, int TileY)>();
        var seen = new HashSet<(int TileX, int TileY)>();

        foreach (var tile in tiles)
        {
            if (!IsInBounds(tile.TileX, tile.TileY))
            {
                continue;
            }

            // Defensive guard: a skill must never affect the player's own tile unless explicitly authored to do so.
            if (tile.TileX == playerTileX && tile.TileY == playerTileY)
            {
                continue;
            }

            if (!seen.Add(tile))
            {
                continue;
            }

            sanitized.Add(tile);
        }

        return sanitized;
    }

    private static void ApplyDamageToPlayer(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player,
        int damage,
        ElementType element,
        StoredActor? attacker,
        bool isRangedAutoAttack = false,
        bool allowCriticalHits = true)
    {
        if (damage <= 0)
        {
            return;
        }

        if (player.Hp <= 0)
        {
            return;
        }

        var previousHp = player.Hp;
        var modifiedDamage = ApplyIncomingDamageModifiers(state, damage, isRangedAutoAttack);
        var remainingDamage = RollDamageForAttacker(state, modifiedDamage, attacker);
        var absorbed = Math.Min(player.Shield, remainingDamage);
        player.Shield -= absorbed;
        remainingDamage -= absorbed;

        if (remainingDamage > 0)
        {
            player.Hp = Math.Max(0, player.Hp - remainingDamage);
        }

        var hpDamageApplied = Math.Max(0, previousHp - player.Hp);
        var damageAppliedToPlayer = absorbed + hpDamageApplied;
        var isFinalBlow = player.Hp <= 0;
        var hitKind = ResolveHitKind(state, allowCriticalHits);
        var isCrit = string.Equals(hitKind, BattleHitKinds.Crit, StringComparison.Ordinal);
        var nowMs = GetElapsedMsForTick(state.Tick);

        events.Add(new DamageNumberEventDto(
            SourceEntityId: attacker?.ActorId,
            SourceTileX: attacker?.TileX,
            SourceTileY: attacker?.TileY,
            AttackerEntityId: attacker?.ActorId,
            AttackerTileX: attacker?.TileX,
            AttackerTileY: attacker?.TileY,
            TargetEntityId: player.ActorId,
            TargetTileX: player.TileX,
            TargetTileY: player.TileY,
            DamageAmount: damageAppliedToPlayer,
            ElementType: element,
            IsKill: isFinalBlow,
            IsCrit: isCrit,
            HitId: NextTickEventId(state),
            ShieldDamageAmount: absorbed,
            HpDamageAmount: hpDamageApplied,
            HitKind: hitKind));

        if (isCrit)
        {
            EmitCritTextEvent(events, player.TileX, player.TileY, nowMs);
        }

        TryApplyKinaReflectPassive(state, events, player, attacker, damageAppliedToPlayer);

        if (isFinalBlow)
        {
            EmitDeathEvent(state, events, player, element, attacker?.ActorId);
            events.Add(new AttackFxEventDto(
                FxKind: CombatFxKind.DeathBurst,
                FromTileX: player.TileX,
                FromTileY: player.TileY,
                ToTileX: player.TileX,
                ToTileY: player.TileY,
                ElementType: element,
                DurationMs: DeathBurstDurationMs,
                CreatedAtTick: state.Tick,
                EventId: NextTickEventId(state)));
            player.Shield = 0;
            EndRun(state, events, RunEndReasonDefeatDeath);
        }
    }

    private static void TryApplyKinaReflectPassive(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player,
        StoredActor? attacker,
        int incomingDamageAppliedToPlayer)
    {
        if (incomingDamageAppliedToPlayer <= 0)
        {
            return;
        }

        if (!IsKinaReflectEnabled(state, player))
        {
            return;
        }

        if (attacker is null || !string.Equals(attacker.Kind, "mob", StringComparison.Ordinal))
        {
            return;
        }

        if (attacker.Hp <= 0)
        {
            return;
        }

        var reflectedBase = (int)Math.Floor(incomingDamageAppliedToPlayer * (KinaReflectPercent / 100.0d));
        reflectedBase = Math.Max(1, reflectedBase);
        var reflectedDamage = reflectedBase;
        if (attacker.MobType is MobArchetype attackerArchetype && IsRangedArchetype(attackerArchetype))
        {
            reflectedDamage *= KinaRangedReflectMultiplier;
        }

        if (IsBuffActive(state, ThornsBoostBuffId))
        {
            reflectedDamage = ApplyPercentIncrease(reflectedDamage, ThornsBoostBonusPercent);
        }

        events.Add(new ReflectEventDto(
            SourceEntityId: player.ActorId,
            SourceTileX: player.TileX,
            SourceTileY: player.TileY,
            TargetEntityId: attacker.ActorId,
            TargetTileX: attacker.TileX,
            TargetTileY: attacker.TileY,
            Amount: reflectedDamage,
            ElementType: ElementType.Physical,
            TargetMobType: attacker.MobType));

        ApplyDamageToMob(
            state,
            events,
            attacker,
            reflectedDamage,
            ElementType.Physical,
            attacker: player,
            allowPlayerDamageBuffs: false,
            allowCriticalHits: false);
    }

    private static bool IsKinaReflectEnabled(StoredBattle state, StoredActor player)
    {
        return string.Equals(player.Kind, "player", StringComparison.Ordinal) &&
               string.Equals(state.PlayerClassId, PlayerClassKina, StringComparison.Ordinal);
    }

    private static void GrantPlayerShield(StoredBattle state, List<BattleEventDto> events, int amount)
    {
        if (amount <= 0)
        {
            return;
        }

        var player = GetPlayerActor(state);
        if (player is null || player.MaxShield <= 0)
        {
            return;
        }

        var previousShield = player.Shield;
        player.Shield = Math.Min(player.MaxShield, player.Shield + amount);
        var appliedShield = Math.Max(0, player.Shield - previousShield);
        if (appliedShield <= 0)
        {
            return;
        }

        events.Add(new HealNumberEventDto(
            ActorId: player.ActorId,
            Amount: appliedShield,
            Source: "shield_gain"));
    }

    private static int ApplyDamageToMob(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor mob,
        int damage,
        ElementType element,
        StoredActor? attacker,
        bool allowPlayerDamageBuffs = true,
        bool allowCriticalHits = true)
    {
        if (mob.Hp <= 0)
        {
            return 0;
        }

        var remainingDamage = Math.Max(0, damage);
        if (allowPlayerDamageBuffs &&
            attacker is not null &&
            string.Equals(attacker.Kind, "player", StringComparison.Ordinal))
        {
            remainingDamage = ApplyOutgoingDamageModifiers(state, remainingDamage);
        }

        remainingDamage = RollDamageForAttacker(state, remainingDamage, attacker);
        var absorbed = 0;
        if (mob.Shield > 0 && remainingDamage > 0)
        {
            absorbed = Math.Min(mob.Shield, remainingDamage);
            mob.Shield -= absorbed;
            remainingDamage -= absorbed;
        }

        var previousHp = mob.Hp;
        mob.Hp = Math.Max(0, mob.Hp - remainingDamage);
        var hpDamageApplied = Math.Max(0, previousHp - mob.Hp);
        var isFinalBlow = mob.Hp <= 0;
        var hitKind = ResolveHitKind(state, allowCriticalHits);
        var isCrit = string.Equals(hitKind, BattleHitKinds.Crit, StringComparison.Ordinal);
        var nowMs = GetElapsedMsForTick(state.Tick);

        events.Add(new DamageNumberEventDto(
            SourceEntityId: attacker?.ActorId,
            SourceTileX: attacker?.TileX,
            SourceTileY: attacker?.TileY,
            AttackerEntityId: attacker?.ActorId,
            AttackerTileX: attacker?.TileX,
            AttackerTileY: attacker?.TileY,
            TargetEntityId: mob.ActorId,
            TargetTileX: mob.TileX,
            TargetTileY: mob.TileY,
            DamageAmount: absorbed + hpDamageApplied,
            ElementType: element,
            IsKill: isFinalBlow,
            IsCrit: isCrit,
            HitId: NextTickEventId(state),
            ShieldDamageAmount: absorbed,
            HpDamageAmount: hpDamageApplied,
            HitKind: hitKind));

        if (isCrit)
        {
            EmitCritTextEvent(events, mob.TileX, mob.TileY, nowMs);
        }

        if (allowPlayerDamageBuffs &&
            hpDamageApplied > 0 &&
            attacker is not null &&
            string.Equals(attacker.Kind, "player", StringComparison.Ordinal))
        {
            ApplyPlayerFlatHpOnHit(state, events);
        }

        if (!isFinalBlow)
        {
            return hpDamageApplied;
        }

        if (mob.BuffSourceEliteId is string sourceEliteId)
        {
            TryRemoveEliteCommanderBuffFromMob(mob, sourceEliteId, events);
        }

        if (mob.IsElite)
        {
            RemoveEliteCommanderBuffs(state, mob.ActorId, events);
        }

        EmitDeathEvent(state, events, mob, element, attacker?.ActorId);
        if (mob.IsElite && mob.MobType is MobArchetype eliteMobType)
        {
            events.Add(new EliteDiedEventDto(
                EliteEntityId: mob.ActorId,
                MobType: eliteMobType));
        }

        events.Add(new AttackFxEventDto(
            FxKind: CombatFxKind.DeathBurst,
            FromTileX: mob.TileX,
            FromTileY: mob.TileY,
            ToTileX: mob.TileX,
            ToTileY: mob.TileY,
            ElementType: element,
            DurationMs: DeathBurstDurationMs,
            CreatedAtTick: state.Tick,
            EventId: NextTickEventId(state)));
        AddCorpseDecal(state, mob);

        events.Add(new FxSpawnEventDto(
            FxId: "fx.hit.small",
            TileX: mob.TileX,
            TileY: mob.TileY,
            Layer: "hitFx",
            DurationMs: 620,
            Element: element));

        if (mob.MobSlotIndex is int slotIndex && state.MobSlots.TryGetValue(slotIndex, out var slot))
        {
            slot.RespawnRemainingMs = MobRespawnDelayMs;
            slot.AttackCooldownRemainingMs = 0;
            slot.AbilityCooldownRemainingMs = 0;
            slot.MoveCooldownRemainingMs = 0;
            slot.CommitTicksRemaining = 0;
        }

        RegisterBestiaryKill(state, events, mob);
        GrantRunXpForMobKill(state, events, mob);

        if (string.Equals(state.LockedTargetEntityId, mob.ActorId, StringComparison.Ordinal))
        {
            state.LockedTargetEntityId = null;
        }

        state.Actors.Remove(mob.ActorId);
        return hpDamageApplied;
    }

    private static void EmitDeathEvent(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor entity,
        ElementType? elementType,
        string? killerEntityId)
    {
        events.Add(new DeathEventDto(
            EntityId: entity.ActorId,
            EntityType: entity.Kind,
            MobType: entity.MobType,
            TileX: entity.TileX,
            TileY: entity.TileY,
            ElementType: elementType,
            KillerEntityId: killerEntityId,
            TickIndex: state.Tick));
    }

    private static void RegisterBestiaryKill(StoredBattle state, List<BattleEventDto> events, StoredActor mob)
    {
        if (mob.IsElite)
        {
            state.EliteKills += 1;
        }
        else
        {
            state.TotalKills += 1;
        }

        if (mob.MobType is not MobArchetype mobArchetype)
        {
            return;
        }

        if (!state.Bestiary.TryGetValue(mobArchetype, out var entry))
        {
            return;
        }

        entry.KillsTotal += 1;
        if (entry.KillsTotal < entry.NextChestAtKills)
        {
            return;
        }

        entry.NextChestAtKills += ComputeBestiaryThresholdIncrement(state.BestiaryRng);
        if (state.PendingSpeciesChestArchetype is null)
        {
            state.PendingSpeciesChestArchetype = mobArchetype;
        }
        else
        {
            state.PendingSpeciesChestArchetype = (MobArchetype)Math.Min(
                (int)state.PendingSpeciesChestArchetype.Value,
                (int)mobArchetype);
        }

        var nowMs = GetElapsedMsForTick(state.Tick);
        TrySpawnPendingSpeciesChest(state, events, nowMs);
    }

    private static void GrantRunXpForMobKill(StoredBattle state, List<BattleEventDto> events, StoredActor mob)
    {
        var awardedXp = ResolveRunXpForMobKill(mob);
        if (awardedXp <= 0)
        {
            return;
        }

        var sourceSpeciesId = mob.MobType is MobArchetype mobType
            ? GetSpeciesId(mobType)
            : null;
        events.Add(new XpGainedEventDto(
            Amount: awardedXp,
            SourceSpeciesId: sourceSpeciesId,
            IsElite: IsEliteMob(mob)));

        state.RunXp += awardedXp;
        while (state.RunXp >= GetXpToNextLevel(state.RunLevel))
        {
            var previousLevel = state.RunLevel;
            var previousThreshold = GetXpToNextLevel(previousLevel);
            state.RunXp -= previousThreshold;
            state.RunLevel += 1;

            events.Add(new LevelUpEventDto(
                PreviousLevel: previousLevel,
                NewLevel: state.RunLevel,
                RunXp: state.RunXp,
                XpToNextLevel: GetXpToNextLevel(state.RunLevel)));

            TryOfferCardChoiceAfterLevelUp(state, events);
        }
    }

    private static void TryOfferCardChoiceAfterLevelUp(StoredBattle state, List<BattleEventDto> events)
    {
        if (state.PendingCardChoice is not null)
        {
            return;
        }

        if (state.CardSelectionsGranted >= MaxCardSelectionsPerRun)
        {
            return;
        }

        var offeredCards = RollCardOffer(state);
        if (offeredCards.Count == 0)
        {
            return;
        }

        var choiceId = $"card-choice-{state.NextCardChoiceSequence:D2}";
        state.NextCardChoiceSequence += 1;
        state.PendingCardChoice = new PendingCardChoiceState(
            choiceId: choiceId,
            offeredCardIds: offeredCards.Select(card => card.Id).ToList());
        state.CardSelectionsGranted += 1;

        events.Add(new CardChoiceOfferedEventDto(
            ChoiceId: choiceId,
            OfferedCards: offeredCards
                .Select(ToCardOfferDto)
                .ToList()));
    }

    private static IReadOnlyList<CardDefinition> RollCardOffer(StoredBattle state)
    {
        var availableCards = CardPool
            .Where(card => !state.SelectedCardIds.Contains(card.Id, StringComparer.Ordinal))
            .OrderBy(card => card.Id, StringComparer.Ordinal)
            .ToList();
        if (availableCards.Count == 0)
        {
            return [];
        }

        var offerCount = Math.Min(MaxCardOfferCount, availableCards.Count);
        var offeredCards = new List<CardDefinition>(offerCount);
        for (var index = 0; index < offerCount; index += 1)
        {
            var rolledIndex = state.Rng.Next(availableCards.Count);
            offeredCards.Add(availableCards[rolledIndex]);
            availableCards.RemoveAt(rolledIndex);
        }

        return offeredCards;
    }

    private static void ApplyCardEffects(StoredBattle state, StoredActor player, CardDefinition card)
    {
        var previousMaxHp = player.MaxHp;

        state.PlayerModifiers.FlatDamageBonus += Math.Max(0, card.Effects.FlatDamageBonus);
        state.PlayerModifiers.PercentDamageBonus += Math.Max(0, card.Effects.PercentDamageBonus);
        state.PlayerModifiers.PercentAttackSpeedBonus += Math.Max(0, card.Effects.PercentAttackSpeedBonus);
        state.PlayerModifiers.PercentMaxHpBonus += Math.Max(0, card.Effects.PercentMaxHpBonus);
        state.PlayerModifiers.FlatHpOnHit += Math.Max(0, card.Effects.FlatHpOnHit);
        state.PlayerModifiers.GlobalCooldownReductionPercent = Math.Clamp(
            state.PlayerModifiers.GlobalCooldownReductionPercent + Math.Max(0, card.Effects.GlobalCooldownReductionPercent),
            0,
            MaxGlobalCooldownReductionPercent);

        var resolvedMaxHp = ResolvePlayerMaxHp(state);
        player.MaxHp = resolvedMaxHp;
        player.MaxShield = ComputePlayerMaxShield(resolvedMaxHp);
        if (resolvedMaxHp > previousMaxHp)
        {
            player.Hp = Math.Min(resolvedMaxHp, player.Hp + (resolvedMaxHp - previousMaxHp));
        }
        else if (player.Hp > resolvedMaxHp)
        {
            player.Hp = resolvedMaxHp;
        }

        if (player.Shield > player.MaxShield)
        {
            player.Shield = player.MaxShield;
        }

        state.PlayerAttackCooldownRemainingMs = Math.Min(
            state.PlayerAttackCooldownRemainingMs,
            ResolvePlayerAutoAttackCooldownMs(state));
        state.PlayerGlobalCooldownRemainingMs = Math.Min(
            state.PlayerGlobalCooldownRemainingMs,
            ResolvePlayerGlobalCooldownMs(state));
        foreach (var skill in state.Skills.Values)
        {
            skill.CooldownRemainingMs = Math.Min(skill.CooldownRemainingMs, ResolveSkillCooldownTotalMs(state, skill));
        }
    }

    private static int ResolveRunXpForMobKill(StoredActor mob)
    {
        if (mob.MobType is not MobArchetype)
        {
            return 0;
        }

        return IsEliteMob(mob) ? EliteMobKillXp : NormalMobKillXp;
    }

    private static bool IsEliteMob(StoredActor mob)
    {
        return string.Equals(mob.Kind, "mob", StringComparison.Ordinal) && mob.IsElite;
    }

    private static void AddCorpseDecal(StoredBattle state, StoredActor entity)
    {
        if (!string.Equals(entity.Kind, "mob", StringComparison.Ordinal))
        {
            return;
        }

        state.Decals.Add(new StoredDecal(
            entityId: entity.ActorId,
            decalKind: DecalKind.Corpse,
            entityType: entity.Kind,
            mobType: entity.MobType,
            tileX: entity.TileX,
            tileY: entity.TileY,
            spriteKey: null,
            remainingMs: CorpseDecalLifetimeMs,
            totalMs: CorpseDecalLifetimeMs,
            createdTick: state.Tick));
    }

    private static int ComputeLifeLeechHeal(int hpDamageApplied)
    {
        if (hpDamageApplied <= 0)
        {
            return 0;
        }

        return (int)Math.Floor(hpDamageApplied * (PlayerLifeLeechPercent / 100.0d));
    }

    private static void ApplyPlayerFlatHpOnHit(StoredBattle state, List<BattleEventDto> events)
    {
        var hpOnHit = Math.Max(0, state.PlayerModifiers.FlatHpOnHit);
        if (hpOnHit <= 0)
        {
            return;
        }

        var player = GetPlayerActor(state);
        if (player is null || player.Hp <= 0)
        {
            return;
        }

        _ = ApplyPlayerHeal(state, events, player, hpOnHit, "card_hp_on_hit");
    }

    private static void ApplyPlayerLifeLeech(StoredBattle state, List<BattleEventDto> events, int pendingLifeLeechHeal)
    {
        if (pendingLifeLeechHeal <= 0)
        {
            return;
        }

        var player = GetPlayerActor(state);
        if (player is null || player.Hp <= 0)
        {
            return;
        }

        _ = ApplyPlayerHeal(state, events, player, pendingLifeLeechHeal, "life_leech");
    }

    private static int ApplySelfHealSkill(StoredBattle state, List<BattleEventDto> events, StoredActor player)
    {
        if (player.Hp <= 0)
        {
            return 0;
        }

        var maxHealAmount = ComputePercentValue(player.MaxHp, HealPercentOfMaxHp);

        events.Add(new FxSpawnEventDto(
            FxId: HealFxId,
            TileX: player.TileX,
            TileY: player.TileY,
            Layer: "hitFx",
            DurationMs: 620,
            Element: HealElement));

        return ApplyPlayerHeal(state, events, player, maxHealAmount, "skill_heal");
    }

    private static int ApplyGuardSkill(List<BattleEventDto> events, StoredActor player)
    {
        if (player.Hp <= 0 || player.MaxShield <= 0)
        {
            return 0;
        }

        var guardAmount = ComputePercentValue(player.MaxHp, GuardPercentOfMaxHp);
        var previousShield = player.Shield;
        player.Shield = Math.Min(player.MaxShield, player.Shield + guardAmount);
        var appliedShield = Math.Max(0, player.Shield - previousShield);

        events.Add(new FxSpawnEventDto(
            FxId: GuardFxId,
            TileX: player.TileX,
            TileY: player.TileY,
            Layer: "hitFx",
            DurationMs: 620,
            Element: GuardElement));

        if (appliedShield > 0)
        {
            events.Add(new HealNumberEventDto(
                ActorId: player.ActorId,
                Amount: appliedShield,
                Source: "shield_gain"));
        }

        return appliedShield;
    }

    private static int ComputePercentValue(int maxValue, int percent)
    {
        if (maxValue <= 0 || percent <= 0)
        {
            return 0;
        }

        return Math.Max(1, (int)Math.Floor(maxValue * (percent / 100.0d)));
    }

    private static int ApplyPlayerHeal(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player,
        int baseHealAmount,
        string source)
    {
        if (baseHealAmount <= 0 || player.Hp <= 0)
        {
            return 0;
        }

        var missingHp = Math.Max(0, player.MaxHp - player.Hp);
        if (missingHp <= 0)
        {
            return 0;
        }

        var finalHealAmount = baseHealAmount;
        if (IsBuffActive(state, HealingAmplifierBuffId))
        {
            finalHealAmount += ComputeFloorPercentValue(player.MaxHp, HealAmplifierBonusPercent);
        }

        var appliedHeal = Math.Min(finalHealAmount, missingHp);
        if (appliedHeal <= 0)
        {
            return 0;
        }

        player.Hp += appliedHeal;
        events.Add(new HealNumberEventDto(
            ActorId: player.ActorId,
            Amount: appliedHeal,
            Source: source));
        return appliedHeal;
    }

    private static int ComputeFloorPercentValue(int maxValue, int percent)
    {
        if (maxValue <= 0 || percent <= 0)
        {
            return 0;
        }

        return (int)Math.Floor(maxValue * (percent / 100.0d));
    }

    private static int ApplyIncomingDamageModifiers(StoredBattle state, int baseDamage, bool isRangedAutoAttack)
    {
        if (baseDamage <= 0)
        {
            return 0;
        }

        var adjustedDamage = baseDamage;
        if (isRangedAutoAttack && IsBuffActive(state, AntiRangedPressureBuffId))
        {
            adjustedDamage = ApplyPercentReduction(adjustedDamage, AntiRangedPressureReductionPercent);
        }

        return Math.Max(1, adjustedDamage);
    }

    private static int ApplyOutgoingDamageModifiers(StoredBattle state, int baseDamage)
    {
        if (baseDamage <= 0)
        {
            return 0;
        }

        var adjustedDamage = baseDamage + Math.Max(0, state.PlayerModifiers.FlatDamageBonus);
        adjustedDamage = ApplyPercentIncrease(adjustedDamage, Math.Max(0, state.PlayerModifiers.PercentDamageBonus));
        if (IsBuffActive(state, DamageBoostBuffId))
        {
            adjustedDamage = ApplyPercentIncrease(adjustedDamage, DamageBoostBonusPercent);
        }

        return Math.Max(1, adjustedDamage);
    }

    private static int ResolveMobAutoAttackCooldownMs(MobArchetypeConfig config, StoredActor mob)
    {
        var attackSpeedBonusPercent = mob.BuffSourceEliteId is null
            ? 0
            : EliteCommanderAttackSpeedBonusPercent;
        return Math.Max(
            1,
            ApplyPercentReduction(
                config.AutoAttackCooldownMs,
                attackSpeedBonusPercent));
    }

    private static int ResolveMobOutgoingDamage(StoredBattle state, StoredActor attacker, int baseDamage)
    {
        if (baseDamage <= 0)
        {
            return 0;
        }

        var adjusted = ScaleByMultiplier(
            baseDamage,
            ResolveCurrentMobDmgMult(state, attacker.IsElite));

        if (attacker.BuffSourceEliteId is not null)
        {
            adjusted = ApplyPercentIncrease(adjusted, EliteCommanderDamageBonusPercent);
        }

        return Math.Max(1, adjusted);
    }

    private static int ApplyPercentIncrease(int value, int percent)
    {
        if (value <= 0 || percent <= 0)
        {
            return value;
        }

        return (int)Math.Floor(value * ((100 + percent) / 100.0d));
    }

    private static int ApplyPercentReduction(int value, int percent)
    {
        if (value <= 0 || percent <= 0)
        {
            return value;
        }

        return (int)Math.Floor(value * ((100 - percent) / 100.0d));
    }

    private static int ResolveScaledMobMaxHp(StoredBattle state, MobArchetypeConfig config, bool isElite)
    {
        return ScaleByMultiplier(
            config.MaxHp,
            ResolveCurrentMobHpMult(state, isElite));
    }

    private static double ResolveCurrentMobHpMult(StoredBattle state, bool isElite = false)
    {
        var mobHpMult = Lerp(MobHpMultStart, MobHpMultEnd, ResolveRunProgress01(state));
        return isElite
            ? mobHpMult * EliteHpMultiplierFactor
            : mobHpMult;
    }

    private static double ResolveCurrentMobDmgMult(StoredBattle state, bool isElite = false)
    {
        var mobDmgMult = Lerp(MobDmgMultStart, MobDmgMultEnd, ResolveRunProgress01(state));
        return isElite
            ? mobDmgMult * EliteDmgMultiplierFactor
            : mobDmgMult;
    }

    private static double ResolveRunProgress01(StoredBattle state)
    {
        var runTimeMs = GetElapsedMsForTick(state.Tick);
        return Clamp01(runTimeMs / (double)RunDurationTargetMs);
    }

    private static string? ResolveLegacyEndReason(string? runEndReason)
    {
        return runEndReason switch
        {
            RunEndReasonDefeatDeath => EndReasonDeath,
            RunEndReasonVictoryTime => EndReasonTime,
            _ => null
        };
    }

    private static int ScaleByMultiplier(int baseValue, double multiplier)
    {
        if (baseValue <= 0)
        {
            return 0;
        }

        var clampedMultiplier = Math.Max(0d, multiplier);
        var scaled = (int)Math.Floor(baseValue * clampedMultiplier);
        return Math.Max(1, scaled);
    }

    private static double Lerp(double start, double end, double t)
    {
        var clampedT = Clamp01(t);
        return start + ((end - start) * clampedT);
    }

    private static double Clamp01(double value)
    {
        return Math.Clamp(value, 0d, 1d);
    }

    private static bool IsBuffActive(StoredBattle state, string buffId)
    {
        if (!state.ActiveBuffs.TryGetValue(buffId, out var buff))
        {
            return false;
        }

        var nowMs = GetElapsedMsForTick(state.Tick);
        return buff.ExpiresAtMs > nowMs;
    }

    private static int RollDamageForAttacker(StoredBattle state, int baseDamage, StoredActor? attacker)
    {
        if (baseDamage <= 0)
        {
            return 0;
        }

        if (attacker is not null &&
            string.Equals(attacker.Kind, "player", StringComparison.Ordinal))
        {
            return RollDamage(
                baseDamage,
                PlayerDamageVarianceMinMultiplier,
                PlayerDamageVarianceMaxMultiplier,
                state.Rng);
        }

        return RollDamage(
            baseDamage,
            MobDamageVarianceMinMultiplier,
            MobDamageVarianceMaxMultiplier,
            state.Rng);
    }

    private static int RollDamage(int baseDamage, double minMultiplier, double maxMultiplier, Random rng)
    {
        if (baseDamage <= 0)
        {
            return 0;
        }

        if (maxMultiplier < minMultiplier)
        {
            (minMultiplier, maxMultiplier) = (maxMultiplier, minMultiplier);
        }

        var clampedMin = Math.Max(0d, minMultiplier);
        var clampedMax = Math.Max(clampedMin, maxMultiplier);
        var multiplier = clampedMin + ((clampedMax - clampedMin) * rng.NextDouble());
        var scaledDamage = baseDamage * multiplier;
        var flooredDamage = (int)Math.Floor(scaledDamage);
        var fractionalDamage = Math.Clamp(scaledDamage - flooredDamage, 0d, 1d);

        var rolledDamage = flooredDamage;
        if (fractionalDamage > 0d && rng.NextDouble() < fractionalDamage)
        {
            rolledDamage += 1;
        }

        return Math.Max(1, rolledDamage);
    }

    private static StoredActor? GetPlayerActor(StoredBattle state)
    {
        if (state.Actors.TryGetValue(state.PlayerActorId, out var player))
        {
            return player;
        }

        return state.Actors.Values
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .FirstOrDefault(actor => actor.Kind == "player");
    }

    private static bool IsDefeat(StoredBattle state)
    {
        return string.Equals(state.BattleStatus, StatusDefeat, StringComparison.Ordinal);
    }

    private static bool TryEndRunIfNeeded(StoredBattle state, List<BattleEventDto> events)
    {
        if (state.IsRunEnded)
        {
            return true;
        }

        var player = GetPlayerActor(state);
        if (player is null || player.Hp <= 0)
        {
            EndRun(state, events, RunEndReasonDefeatDeath);
            return true;
        }

        var nowMs = GetElapsedMsForTick(state.Tick);
        if (nowMs >= RunDurationTargetMs)
        {
            EndRun(state, events, RunEndReasonVictoryTime);
            return true;
        }

        return false;
    }

    private static void EndRun(StoredBattle state, List<BattleEventDto>? events, string runEndReason)
    {
        if (state.IsRunEnded)
        {
            return;
        }

        var resolvedReason = string.Equals(runEndReason, RunEndReasonDefeatDeath, StringComparison.Ordinal)
            ? RunEndReasonDefeatDeath
            : RunEndReasonVictoryTime;
        var endedAtMs = GetElapsedMsForTick(state.Tick);
        state.IsRunEnded = true;
        state.RunEndReason = resolvedReason;
        state.RunEndedAtMs = endedAtMs;
        state.BattleStatus = string.Equals(resolvedReason, RunEndReasonDefeatDeath, StringComparison.Ordinal)
            ? StatusDefeat
            : StatusVictory;
        state.IsPaused = false;
        events?.Add(new RunEndedEventDto(
            Reason: resolvedReason,
            TimestampMs: endedAtMs));
    }

    private static bool IsStarted(StoredBattle state)
    {
        return string.Equals(state.BattleStatus, StatusStarted, StringComparison.Ordinal);
    }

    private static bool IsAdjacent(StoredActor left, StoredActor right)
    {
        var deltaX = Math.Abs(left.TileX - right.TileX);
        var deltaY = Math.Abs(left.TileY - right.TileY);
        return deltaX <= 1 && deltaY <= 1 && (deltaX != 0 || deltaY != 0);
    }

    private static StoredActor? ResolveLockedTargetMobAnyDistance(StoredBattle state)
    {
        if (string.IsNullOrWhiteSpace(state.LockedTargetEntityId))
        {
            return null;
        }

        if (!state.Actors.TryGetValue(state.LockedTargetEntityId, out var target))
        {
            return null;
        }

        if (!string.Equals(target.Kind, "mob", StringComparison.Ordinal))
        {
            return null;
        }

        return target;
    }

    private static bool TryResolveAnyLockedTargetMob(StoredBattle state, out StoredActor target)
    {
        target = default!;
        if (string.IsNullOrWhiteSpace(state.LockedTargetEntityId))
        {
            return false;
        }

        if (!state.Actors.TryGetValue(state.LockedTargetEntityId, out var foundTarget))
        {
            return false;
        }

        if (!string.Equals(foundTarget.Kind, "mob", StringComparison.Ordinal))
        {
            return false;
        }

        target = foundTarget;
        return true;
    }

    private static int ComputeChebyshevDistance(StoredActor actor, int centerX, int centerY)
    {
        var deltaX = Math.Abs(actor.TileX - centerX);
        var deltaY = Math.Abs(actor.TileY - centerY);
        return Math.Max(deltaX, deltaY);
    }

    private static int ComputeChebyshevDistance(int sourceX, int sourceY, int targetX, int targetY)
    {
        var deltaX = Math.Abs(sourceX - targetX);
        var deltaY = Math.Abs(sourceY - targetY);
        return Math.Max(deltaX, deltaY);
    }

    private static int ComputeManhattanDistance(int sourceX, int sourceY, int targetX, int targetY)
    {
        var deltaX = Math.Abs(sourceX - targetX);
        var deltaY = Math.Abs(sourceY - targetY);
        return deltaX + deltaY;
    }

    private static bool TryGetFirstWalkableGreedyStepTowardTarget(
        StoredBattle state,
        StoredActor mob,
        int targetTileX,
        int targetTileY,
        out (int TileX, int TileY)? destination)
    {
        destination = null;
        foreach (var candidate in BuildGreedyStepCandidates(mob, targetTileX - mob.TileX, targetTileY - mob.TileY))
        {
            if (!IsWalkableTile(state, mob, candidate))
            {
                continue;
            }

            destination = candidate;
            return true;
        }

        return false;
    }

    private static bool TryGetFirstWalkableGreedyStepAwayFromTarget(
        StoredBattle state,
        StoredActor mob,
        int targetTileX,
        int targetTileY,
        out (int TileX, int TileY)? destination)
    {
        destination = null;
        foreach (var candidate in BuildGreedyStepCandidates(mob, mob.TileX - targetTileX, mob.TileY - targetTileY))
        {
            if (!IsWalkableTile(state, mob, candidate))
            {
                continue;
            }

            destination = candidate;
            return true;
        }

        return false;
    }

    private static IEnumerable<(int TileX, int TileY)> BuildGreedyStepCandidates(StoredActor mob, int deltaX, int deltaY)
    {
        var stepX = Math.Sign(deltaX);
        var stepY = Math.Sign(deltaY);

        (int TileX, int TileY)? preferredTile;
        (int TileX, int TileY)? fallbackTile;

        if (Math.Abs(deltaX) >= Math.Abs(deltaY))
        {
            preferredTile = stepX == 0 ? null : (mob.TileX + stepX, mob.TileY);
            fallbackTile = stepY == 0 ? null : (mob.TileX, mob.TileY + stepY);
        }
        else
        {
            preferredTile = stepY == 0 ? null : (mob.TileX, mob.TileY + stepY);
            fallbackTile = stepX == 0 ? null : (mob.TileX + stepX, mob.TileY);
        }

        if (preferredTile.HasValue)
        {
            yield return preferredTile.Value;
        }

        if (fallbackTile.HasValue)
        {
            yield return fallbackTile.Value;
        }
    }

    private static bool IsWalkableTile(StoredBattle state, StoredActor mob, (int TileX, int TileY) destination)
    {
        if (!IsInBounds(destination.TileX, destination.TileY))
        {
            return false;
        }

        var isOccupied = state.Actors.Values.Any(actor =>
            !string.Equals(actor.ActorId, mob.ActorId, StringComparison.Ordinal) &&
            actor.TileX == destination.TileX &&
            actor.TileY == destination.TileY);
        return !isOccupied;
    }

    private static bool TryMoveMobToTile(StoredBattle state, StoredActor mob, (int TileX, int TileY)? destination)
    {
        if (!destination.HasValue)
        {
            return false;
        }

        var (destinationX, destinationY) = destination.Value;
        if (!IsWalkableTile(state, mob, (destinationX, destinationY)))
        {
            return false;
        }

        mob.TileX = destinationX;
        mob.TileY = destinationY;
        return true;
    }

    private static int GetMaxAliveMobsForTick(int tick)
    {
        var elapsedMs = (long)tick * StepDeltaMs;
        return elapsedMs < EarlyMobConcurrentCapDurationMs
            ? EarlyMobConcurrentCap
            : ArenaConfig.MaxAliveMobs;
    }

    private static bool IsEliteSlot(int slotIndex)
    {
        return slotIndex is 7 or 10;
    }

    private static long GetElapsedMsForTick(int tick)
    {
        return (long)tick * StepDeltaMs;
    }

    private static void SetRangedCommitWindowIfNeeded(MobSlotState slot)
    {
        if (!IsRangedArchetype(slot.Archetype))
        {
            return;
        }

        slot.CommitTicksRemaining = RangedCommitWindowTicks;
    }

    private static bool IsRangedArchetype(MobArchetype archetype)
    {
        return archetype is MobArchetype.RangedArcher or MobArchetype.RangedDragon;
    }

    private static string GetSpeciesId(MobArchetype archetype)
    {
        if (SpeciesByArchetype.TryGetValue(archetype, out var species))
        {
            return species;
        }

        return archetype.ToString();
    }

    private static bool TryChooseRangedBandMove(
        StoredBattle state,
        StoredActor mob,
        StoredActor player,
        MobSlotState slot,
        out (int TileX, int TileY)? destination)
    {
        if (slot.CommitTicksRemaining > 0)
        {
            SetMobFacingTowardTarget(mob, player.TileX, player.TileY);
            destination = null;
            return false;
        }

        var distance = ComputeChebyshevDistance(mob, player.TileX, player.TileY);
        if (distance >= RangedApproachDistance)
        {
            return TryGetFirstWalkableGreedyStepTowardTarget(state, mob, player.TileX, player.TileY, out destination);
        }

        if (distance <= 1)
        {
            return TryGetFirstWalkableGreedyStepAwayFromTarget(state, mob, player.TileX, player.TileY, out destination);
        }

        if (TryGetFirstWalkableBandOrbitStep(state, mob, player, distance, out destination))
        {
            return true;
        }

        destination = null;
        return false;
    }

    private static bool TryGetFirstWalkableBandOrbitStep(
        StoredBattle state,
        StoredActor mob,
        StoredActor player,
        int currentDistance,
        out (int TileX, int TileY)? destination)
    {
        destination = null;
        (int TileX, int TileY)? fallbackBandStep = null;
        foreach (var offset in EnumerateDeterministicNeighborOffsets())
        {
            var candidate = (TileX: mob.TileX + offset.OffsetX, TileY: mob.TileY + offset.OffsetY);
            if (!IsWalkableTile(state, mob, candidate))
            {
                continue;
            }

            var nextDistance = ComputeChebyshevDistance(candidate.TileX, candidate.TileY, player.TileX, player.TileY);
            if (nextDistance < RangedPreferredDistanceMin || nextDistance > RangedPreferredDistanceMax)
            {
                continue;
            }

            if (nextDistance == currentDistance)
            {
                destination = candidate;
                return true;
            }

            fallbackBandStep ??= candidate;
        }

        if (fallbackBandStep.HasValue)
        {
            destination = fallbackBandStep.Value;
            return true;
        }

        return false;
    }

    private static IEnumerable<(int OffsetX, int OffsetY)> EnumerateDeterministicNeighborOffsets()
    {
        yield return (0, -1);
        yield return (1, -1);
        yield return (1, 0);
        yield return (1, 1);
        yield return (0, 1);
        yield return (-1, 1);
        yield return (-1, 0);
        yield return (-1, -1);
    }

    private static string NormalizeCommandType(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return value.Trim().ToLowerInvariant();
    }

    private static string? NormalizeSkillId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim().ToLowerInvariant();
    }

    private static string? NormalizeChoiceId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static string? NormalizeCardId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim().ToLowerInvariant();
    }

    private static string? NormalizePoiId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static string? NormalizeDirection(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim().ToLowerInvariant();
        return normalized switch
        {
            "n" or "north" => FacingUp,
            FacingUp => FacingUp,
            "ne" or "north_east" or "northeast" or "up-right" or "up_right" => FacingUpRight,
            "e" or "east" => FacingRight,
            "se" or "south_east" or "southeast" or "down-right" or "down_right" => FacingDownRight,
            "s" or "south" => FacingDown,
            FacingDown => FacingDown,
            "sw" or "south_west" or "southwest" or "down-left" or "down_left" => FacingDownLeft,
            "w" or "west" => FacingLeft,
            FacingLeft => FacingLeft,
            FacingRight => FacingRight,
            "nw" or "north_west" or "northwest" or "up-left" or "up_left" => FacingUpLeft,
            _ => null
        };
    }

    private static BattleCardOfferDto ToCardOfferDto(CardDefinition card)
    {
        return new BattleCardOfferDto(
            Id: card.Id,
            Name: card.Name,
            Description: card.Description);
    }

    private static string BuildMobActorId(int slotIndex)
    {
        return $"mob.slime.{slotIndex}";
    }

    private static IEnumerable<(int TileX, int TileY)> BuildSquareTiles(
        int centerX,
        int centerY,
        int radius,
        bool includeCenter = true)
    {
        var safeRadius = Math.Max(0, radius);
        for (var y = centerY - safeRadius; y <= centerY + safeRadius; y += 1)
        {
            for (var x = centerX - safeRadius; x <= centerX + safeRadius; x += 1)
            {
                if (!includeCenter && x == centerX && y == centerY)
                {
                    continue;
                }

                yield return (x, y);
            }
        }
    }

    private static IEnumerable<(int TileX, int TileY)> BuildDiamondTiles(
        int centerX,
        int centerY,
        int radius,
        bool includeCenter = true)
    {
        var safeRadius = Math.Max(0, radius);
        for (var y = centerY - safeRadius; y <= centerY + safeRadius; y += 1)
        {
            for (var x = centerX - safeRadius; x <= centerX + safeRadius; x += 1)
            {
                if (Math.Abs(x - centerX) + Math.Abs(y - centerY) <= safeRadius)
                {
                    if (!includeCenter && x == centerX && y == centerY)
                    {
                        continue;
                    }

                    yield return (x, y);
                }
            }
        }
    }

    private static IEnumerable<(int TileX, int TileY)> BuildFrontalTiles(int playerX, int playerY, string facingDirection)
    {
        // Skills with 4-direction frontage map diagonal facings using horizontal priority.
        var normalizedFacing = ResolveCardinalFacingForSkills(facingDirection);
        return normalizedFacing switch
        {
            FacingUp =>
            [
                (playerX - 1, playerY - 1),
                (playerX, playerY - 1),
                (playerX + 1, playerY - 1)
            ],
            FacingDown =>
            [
                (playerX - 1, playerY + 1),
                (playerX, playerY + 1),
                (playerX + 1, playerY + 1)
            ],
            FacingLeft =>
            [
                (playerX - 1, playerY - 1),
                (playerX - 1, playerY),
                (playerX - 1, playerY + 1)
            ],
            FacingRight =>
            [
                (playerX + 1, playerY - 1),
                (playerX + 1, playerY),
                (playerX + 1, playerY + 1)
            ],
            _ =>
            [
                (playerX - 1, playerY - 1),
                (playerX, playerY - 1),
                (playerX + 1, playerY - 1)
            ]
        };
    }

    private static string ResolveCardinalFacingForSkills(string facingDirection)
    {
        var normalizedFacing = NormalizeDirection(facingDirection) ?? FacingUp;
        return normalizedFacing switch
        {
            FacingUpRight => FacingRight,
            FacingDownRight => FacingRight,
            FacingUpLeft => FacingLeft,
            FacingDownLeft => FacingLeft,
            _ => normalizedFacing
        };
    }

    private static void SetMobFacingTowardTarget(StoredActor mob, int targetTileX, int targetTileY)
    {
        mob.FacingDirection = ResolveFacingDirectionTowardTile(
            mob.TileX,
            mob.TileY,
            targetTileX,
            targetTileY,
            mob.FacingDirection);
    }

    private static string ResolveFacingDirectionTowardTile(
        int sourceTileX,
        int sourceTileY,
        int targetTileX,
        int targetTileY,
        string currentFacingDirection)
    {
        var deltaX = targetTileX - sourceTileX;
        var deltaY = targetTileY - sourceTileY;
        if (deltaX == 0 && deltaY == 0)
        {
            return currentFacingDirection;
        }

        if (Math.Abs(deltaX) >= Math.Abs(deltaY))
        {
            if (deltaX > 0)
            {
                return FacingRight;
            }

            if (deltaX < 0)
            {
                return FacingLeft;
            }
        }
        else
        {
            if (deltaY > 0)
            {
                return FacingDown;
            }

            if (deltaY < 0)
            {
                return FacingUp;
            }
        }

        return currentFacingDirection;
    }

    private static bool IsInBounds(int tileX, int tileY)
    {
        return tileX >= 0 &&
               tileY >= 0 &&
               tileX < ArenaConfig.Width &&
               tileY < ArenaConfig.Height;
    }

    private static bool IsTileInForwardCone(StoredActor mob, int tileX, int tileY)
    {
        return MobShapePlanner.BuildForwardConeTiles(mob.TileX, mob.TileY, mob.FacingDirection)
            .Any(tile => tile.TileX == tileX && tile.TileY == tileY);
    }

    private readonly record struct AvalancheCastTargetResolution(bool HasTarget, int TileX, int TileY, string? FailReason)
    {
        public static AvalancheCastTargetResolution Success(int tileX, int tileY)
        {
            return new AvalancheCastTargetResolution(true, tileX, tileY, null);
        }

        public static AvalancheCastTargetResolution Fail(string reason)
        {
            return new AvalancheCastTargetResolution(false, 0, 0, reason);
        }
    }

    private readonly record struct SkillCastResult(bool Success, string? Reason)
    {
        public static SkillCastResult Ok(string? reason)
        {
            return new SkillCastResult(true, reason);
        }

        public static SkillCastResult Fail(string reason)
        {
            return new SkillCastResult(false, reason);
        }
    }

    private interface IMobBehavior
    {
        bool TryChooseMove(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config,
            out (int TileX, int TileY)? destination);

        bool CanAutoAttack(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config);

        bool TryCastAbility(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config,
            List<BattleEventDto> events);
    }

    private sealed record MobArchetypeConfig(
        int MaxHp,
        int MoveCooldownMs,
        int AutoAttackRangeTiles,
        int AutoAttackDamage,
        int AutoAttackCooldownMs,
        int AbilityDamage,
        int AbilityRangeTiles,
        int AbilityCooldownMs,
        string AbilityFxId);

    private sealed class MeleeBruteBehavior : IMobBehavior
    {
        public bool TryChooseMove(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config,
            out (int TileX, int TileY)? destination)
        {
            if (IsAdjacent(mob, player))
            {
                destination = null;
                return false;
            }

            return TryGetFirstWalkableGreedyStepTowardTarget(state, mob, player.TileX, player.TileY, out destination);
        }

        public bool CanAutoAttack(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config)
        {
            return IsAdjacent(mob, player);
        }

        public bool TryCastAbility(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config,
            List<BattleEventDto> events)
        {
            return TryCastMeleeCleaveAbility(state, mob, player, config, events);
        }
    }

    private sealed class RangedArcherBehavior : IMobBehavior
    {
        public bool TryChooseMove(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config,
            out (int TileX, int TileY)? destination)
        {
            return TryChooseRangedBandMove(state, mob, player, slot, out destination);
        }

        public bool CanAutoAttack(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config)
        {
            var distance = ComputeChebyshevDistance(mob, player.TileX, player.TileY);
            return distance <= config.AutoAttackRangeTiles;
        }

        public bool TryCastAbility(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config,
            List<BattleEventDto> events)
        {
            return TryCastRangedSingleTargetAbility(state, mob, player, config, events);
        }
    }

    private sealed class MeleeDemonBehavior : IMobBehavior
    {
        public bool TryChooseMove(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config,
            out (int TileX, int TileY)? destination)
        {
            if (IsAdjacent(mob, player))
            {
                destination = null;
                return false;
            }

            return TryGetFirstWalkableGreedyStepTowardTarget(state, mob, player.TileX, player.TileY, out destination);
        }

        public bool CanAutoAttack(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config)
        {
            return IsAdjacent(mob, player);
        }

        public bool TryCastAbility(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config,
            List<BattleEventDto> events)
        {
            return TryCastDemonBeamAbility(state, mob, player, config, events);
        }
    }

    private sealed class RangedDragonBehavior : IMobBehavior
    {
        public bool TryChooseMove(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config,
            out (int TileX, int TileY)? destination)
        {
            return TryChooseRangedBandMove(state, mob, player, slot, out destination);
        }

        public bool CanAutoAttack(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config)
        {
            var distance = ComputeChebyshevDistance(mob, player.TileX, player.TileY);
            return distance <= config.AutoAttackRangeTiles;
        }

        public bool TryCastAbility(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config,
            List<BattleEventDto> events)
        {
            return TryCastDragonBreathAbility(state, mob, player, config, events);
        }
    }

    private static void AssertBattleInvariants(StoredBattle state)
    {
        var occupiedTiles = new HashSet<(int TileX, int TileY)>();
        foreach (var actor in state.Actors.Values)
        {
            if (string.Equals(actor.Kind, "mob", StringComparison.Ordinal))
            {
                if (actor.MobType is null)
                {
                    throw new InvalidOperationException($"Mob actor '{actor.ActorId}' is missing MobType.");
                }

                if (actor.IsElite && actor.BuffSourceEliteId is not null)
                {
                    throw new InvalidOperationException($"Elite mob '{actor.ActorId}' cannot be buffed by another elite.");
                }

                if (actor.BuffSourceEliteId is string sourceEliteId)
                {
                    if (!state.Actors.TryGetValue(sourceEliteId, out var sourceActor))
                    {
                        throw new InvalidOperationException(
                            $"Mob '{actor.ActorId}' has missing elite source '{sourceEliteId}'.");
                    }

                    if (!string.Equals(sourceActor.Kind, "mob", StringComparison.Ordinal) || !sourceActor.IsElite)
                    {
                        throw new InvalidOperationException(
                            $"Mob '{actor.ActorId}' has invalid elite source '{sourceEliteId}'.");
                    }
                }
            }
            else if (actor.IsElite || actor.BuffSourceEliteId is not null)
            {
                throw new InvalidOperationException($"Non-mob actor '{actor.ActorId}' has elite commander state.");
            }

            if (!IsInBounds(actor.TileX, actor.TileY))
            {
                throw new InvalidOperationException(
                    $"Actor '{actor.ActorId}' is out of arena bounds at ({actor.TileX},{actor.TileY}).");
            }

            if (!occupiedTiles.Add((actor.TileX, actor.TileY)))
            {
                throw new InvalidOperationException(
                    $"Multiple actors occupy tile ({actor.TileX},{actor.TileY}).");
            }
        }

        var buffCountByElite = state.Actors.Values
            .Where(actor =>
                string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                !actor.IsElite &&
                actor.BuffSourceEliteId is not null)
            .GroupBy(actor => actor.BuffSourceEliteId!, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        foreach (var (eliteActorId, buffCount) in buffCountByElite)
        {
            if (buffCount > EliteCommanderMaxBuffTargets)
            {
                throw new InvalidOperationException(
                    $"Elite '{eliteActorId}' exceeded buff cap: {buffCount}.");
            }
        }

        var player = GetPlayerActor(state);
        if (player is null)
        {
            throw new InvalidOperationException("Player actor is missing.");
        }

        if (NormalizeDirection(state.PlayerFacingDirection) is null)
        {
            throw new InvalidOperationException(
                $"Player facing direction is invalid: '{state.PlayerFacingDirection}'.");
        }

        if (state.PlayerMoveCooldownRemainingMs < 0)
        {
            throw new InvalidOperationException(
                $"Player move cooldown is invalid: {state.PlayerMoveCooldownRemainingMs}.");
        }

        if (state.RunLevel < RunInitialLevel)
        {
            throw new InvalidOperationException($"Run level is invalid: {state.RunLevel}.");
        }

        if (state.RunXp < 0)
        {
            throw new InvalidOperationException($"Run XP is invalid: {state.RunXp}.");
        }

        var xpToNextLevel = GetXpToNextLevel(state.RunLevel);
        if (state.RunXp >= xpToNextLevel)
        {
            throw new InvalidOperationException(
                $"Run XP must be below the current threshold: xp={state.RunXp}, threshold={xpToNextLevel}.");
        }

        if (state.TotalKills < 0 || state.EliteKills < 0 || state.ChestsOpened < 0)
        {
            throw new InvalidOperationException(
                $"Run summary counters are invalid: kills={state.TotalKills}, eliteKills={state.EliteKills}, chestsOpened={state.ChestsOpened}.");
        }

        if (state.IsRunEnded)
        {
            if (string.IsNullOrWhiteSpace(state.RunEndReason))
            {
                throw new InvalidOperationException("Run ended flag is set but reason is missing.");
            }

            if (state.RunEndedAtMs is null || state.RunEndedAtMs < 0)
            {
                throw new InvalidOperationException("Run ended flag is set but timestamp is invalid.");
            }
        }
        else if (state.RunEndReason is not null || state.RunEndedAtMs is not null)
        {
            throw new InvalidOperationException("Run end reason/timestamp must be null while run is active.");
        }

        if (state.CardSelectionsGranted < 0 || state.CardSelectionsGranted > MaxCardSelectionsPerRun)
        {
            throw new InvalidOperationException($"Card selection count is invalid: {state.CardSelectionsGranted}.");
        }

        if (state.NextCardChoiceSequence < 1)
        {
            throw new InvalidOperationException($"Next card choice sequence is invalid: {state.NextCardChoiceSequence}.");
        }

        var selectedCardIds = state.SelectedCardIds.ToList();
        if (selectedCardIds.Count != selectedCardIds.Distinct(StringComparer.Ordinal).Count())
        {
            throw new InvalidOperationException("Selected cards contain duplicates.");
        }

        foreach (var selectedCardId in selectedCardIds)
        {
            if (!CardById.ContainsKey(selectedCardId))
            {
                throw new InvalidOperationException($"Selected card id is invalid: '{selectedCardId}'.");
            }
        }

        if (state.PendingCardChoice is not null)
        {
            if (string.IsNullOrWhiteSpace(state.PendingCardChoice.ChoiceId))
            {
                throw new InvalidOperationException("Pending card choice id is invalid.");
            }

            if (state.PendingCardChoice.OfferedCardIds.Count == 0 ||
                state.PendingCardChoice.OfferedCardIds.Count > MaxCardOfferCount)
            {
                throw new InvalidOperationException(
                    $"Pending card offer count is invalid: {state.PendingCardChoice.OfferedCardIds.Count}.");
            }

            foreach (var offeredCardId in state.PendingCardChoice.OfferedCardIds)
            {
                if (!CardById.ContainsKey(offeredCardId))
                {
                    throw new InvalidOperationException($"Pending offered card id is invalid: '{offeredCardId}'.");
                }

                if (state.SelectedCardIds.Contains(offeredCardId, StringComparer.Ordinal))
                {
                    throw new InvalidOperationException(
                        $"Pending card offer contains an already selected card: '{offeredCardId}'.");
                }
            }
        }

        if (state.PlayerModifiers.FlatDamageBonus < 0 ||
            state.PlayerModifiers.PercentDamageBonus < 0 ||
            state.PlayerModifiers.PercentAttackSpeedBonus < 0 ||
            state.PlayerModifiers.PercentMaxHpBonus < 0 ||
            state.PlayerModifiers.FlatHpOnHit < 0 ||
            state.PlayerModifiers.GlobalCooldownReductionPercent < 0 ||
            state.PlayerModifiers.GlobalCooldownReductionPercent > MaxGlobalCooldownReductionPercent)
        {
            throw new InvalidOperationException("Player card modifiers are invalid.");
        }

        var expectedPlayerMaxHp = ResolvePlayerMaxHp(state);
        if (player.MaxHp != expectedPlayerMaxHp)
        {
            throw new InvalidOperationException(
                $"Player max HP is inconsistent with modifiers: actual={player.MaxHp}, expected={expectedPlayerMaxHp}.");
        }

        var expectedPlayerMaxShield = ComputePlayerMaxShield(expectedPlayerMaxHp);
        if (player.MaxShield != expectedPlayerMaxShield)
        {
            throw new InvalidOperationException(
                $"Player max shield is inconsistent with max HP: actual={player.MaxShield}, expected={expectedPlayerMaxShield}.");
        }

        if (state.NextChestSpawnCheckAtMs < 0)
        {
            throw new InvalidOperationException(
                $"Next chest spawn check is invalid: {state.NextChestSpawnCheckAtMs}.");
        }

        if (state.NextAltarSpawnCheckAtMs < 0)
        {
            throw new InvalidOperationException(
                $"Next altar spawn check is invalid: {state.NextAltarSpawnCheckAtMs}.");
        }

        if (state.NextAltarInteractAllowedAtMs < 0)
        {
            throw new InvalidOperationException(
                $"Next altar interact timestamp is invalid: {state.NextAltarInteractAllowedAtMs}.");
        }

        if (state.NextPoiSequence < 1)
        {
            throw new InvalidOperationException(
                $"Next POI sequence is invalid: {state.NextPoiSequence}.");
        }

        foreach (var (archetype, entry) in state.Bestiary.OrderBy(pair => (int)pair.Key))
        {
            if (!SpeciesByArchetype.ContainsKey(archetype))
            {
                throw new InvalidOperationException($"Bestiary contains unknown archetype '{archetype}'.");
            }

            if (entry.KillsTotal < 0)
            {
                throw new InvalidOperationException($"Bestiary kills are invalid for '{archetype}': {entry.KillsTotal}.");
            }

            if (entry.NextChestAtKills <= 0)
            {
                throw new InvalidOperationException(
                    $"Bestiary threshold is invalid for '{archetype}': {entry.NextChestAtKills}.");
            }
        }

        if (state.PendingSpeciesChestArchetype is MobArchetype pendingArchetype &&
            !state.Bestiary.ContainsKey(pendingArchetype))
        {
            throw new InvalidOperationException($"Pending species chest archetype is invalid: {pendingArchetype}.");
        }

        var nowMs = GetElapsedMsForTick(state.Tick);
        foreach (var buff in state.ActiveBuffs.Values)
        {
            if (string.IsNullOrWhiteSpace(buff.BuffId))
            {
                throw new InvalidOperationException("Active buff has invalid id.");
            }

            if (buff.ExpiresAtMs < 0)
            {
                throw new InvalidOperationException(
                    $"Buff '{buff.BuffId}' has invalid expiry: {buff.ExpiresAtMs}.");
            }
        }

        foreach (var poi in state.Pois.Values)
        {
            if (!IsInBounds(poi.TileX, poi.TileY))
            {
                throw new InvalidOperationException(
                    $"POI '{poi.PoiId}' is out of bounds at ({poi.TileX},{poi.TileY}).");
            }

            if (poi.ExpiresAtMs < 0)
            {
                throw new InvalidOperationException(
                    $"POI '{poi.PoiId}' has invalid expiry: {poi.ExpiresAtMs}.");
            }
        }

        var activeChestCount = state.Pois.Values.Count(poi =>
            IsChestPoiType(poi.Type) &&
            poi.ExpiresAtMs > nowMs);
        if (activeChestCount > 1)
        {
            throw new InvalidOperationException("More than one active chest POI exists.");
        }

        var activeAltarCount = state.Pois.Values.Count(poi =>
            string.Equals(poi.Type, PoiTypeAltar, StringComparison.Ordinal) &&
            poi.ExpiresAtMs > nowMs);
        if (activeAltarCount > 1)
        {
            throw new InvalidOperationException("More than one active altar POI exists.");
        }

        var hasGroundX = state.GroundTargetTileX.HasValue;
        var hasGroundY = state.GroundTargetTileY.HasValue;
        if (hasGroundX != hasGroundY)
        {
            throw new InvalidOperationException("Ground target coordinates must be set together.");
        }

        if (hasGroundX && hasGroundY && !IsInBounds(state.GroundTargetTileX!.Value, state.GroundTargetTileY!.Value))
        {
            throw new InvalidOperationException(
                $"Ground target is out of bounds at ({state.GroundTargetTileX},{state.GroundTargetTileY}).");
        }

        var assist = state.AssistConfig;
        if (assist.HealAtHpPercent < 1 || assist.HealAtHpPercent > 99)
        {
            throw new InvalidOperationException($"Assist heal threshold is invalid: {assist.HealAtHpPercent}.");
        }

        if (assist.GuardAtHpPercent < 1 || assist.GuardAtHpPercent > 99)
        {
            throw new InvalidOperationException($"Assist guard threshold is invalid: {assist.GuardAtHpPercent}.");
        }

        if (assist.MaxAutoCastsPerTick < 1)
        {
            throw new InvalidOperationException($"Assist maxAutoCastsPerTick is invalid: {assist.MaxAutoCastsPerTick}.");
        }
    }

    private sealed class StoredBattle
    {
        public StoredBattle(
            string battleId,
            string arenaId,
            string playerActorId,
            string playerClassId,
            int seed,
            Random rng,
            Random poiRng,
            Random bestiaryRng,
            Random critRng,
            int tick,
            string playerFacingDirection,
            string battleStatus,
            bool isRunEnded,
            string? runEndReason,
            long? runEndedAtMs,
            bool isPaused,
            int runXp,
            int runLevel,
            int totalKills,
            int eliteKills,
            int chestsOpened,
            int playerMoveCooldownRemainingMs,
            int playerAttackCooldownRemainingMs,
            int playerGlobalCooldownRemainingMs,
            long nextChestSpawnCheckAtMs,
            long nextAltarSpawnCheckAtMs,
            long nextAltarInteractAllowedAtMs,
            int nextPoiSequence,
            string? lockedTargetEntityId,
            int? groundTargetTileX,
            int? groundTargetTileY,
            StoredAssistConfig assistConfig,
            Dictionary<string, StoredActor> actors,
            Dictionary<string, StoredSkill> skills,
            ElementType? equippedWeaponElement,
            List<StoredDecal> decals,
            Dictionary<string, StoredBuff> activeBuffs,
            Dictionary<string, StoredPoi> pois,
            Dictionary<int, MobSlotState> mobSlots,
            Dictionary<MobArchetype, StoredBestiaryEntry> bestiary,
            MobArchetype? pendingSpeciesChestArchetype,
            PlayerModifiers playerModifiers,
            PendingCardChoiceState? pendingCardChoice,
            List<string> selectedCardIds,
            int cardSelectionsGranted,
            int nextCardChoiceSequence)
        {
            BattleId = battleId;
            ArenaId = arenaId;
            PlayerActorId = playerActorId;
            PlayerClassId = playerClassId;
            Seed = seed;
            Rng = rng;
            PoiRng = poiRng;
            BestiaryRng = bestiaryRng;
            CritRng = critRng;
            Tick = tick;
            PlayerFacingDirection = playerFacingDirection;
            BattleStatus = battleStatus;
            IsRunEnded = isRunEnded;
            RunEndReason = runEndReason;
            RunEndedAtMs = runEndedAtMs;
            IsPaused = isPaused;
            RunXp = runXp;
            RunLevel = runLevel;
            TotalKills = totalKills;
            EliteKills = eliteKills;
            ChestsOpened = chestsOpened;
            PlayerMoveCooldownRemainingMs = playerMoveCooldownRemainingMs;
            PlayerAttackCooldownRemainingMs = playerAttackCooldownRemainingMs;
            PlayerGlobalCooldownRemainingMs = playerGlobalCooldownRemainingMs;
            NextChestSpawnCheckAtMs = nextChestSpawnCheckAtMs;
            NextAltarSpawnCheckAtMs = nextAltarSpawnCheckAtMs;
            NextAltarInteractAllowedAtMs = nextAltarInteractAllowedAtMs;
            NextPoiSequence = nextPoiSequence;
            LockedTargetEntityId = lockedTargetEntityId;
            GroundTargetTileX = groundTargetTileX;
            GroundTargetTileY = groundTargetTileY;
            AssistConfig = assistConfig;
            TickEventCounter = 0;
            Actors = actors;
            Skills = skills;
            EquippedWeaponElement = equippedWeaponElement;
            Decals = decals;
            ActiveBuffs = activeBuffs;
            Pois = pois;
            MobSlots = mobSlots;
            Bestiary = bestiary;
            PendingSpeciesChestArchetype = pendingSpeciesChestArchetype;
            PlayerModifiers = playerModifiers;
            PendingCardChoice = pendingCardChoice;
            SelectedCardIds = selectedCardIds;
            CardSelectionsGranted = cardSelectionsGranted;
            NextCardChoiceSequence = nextCardChoiceSequence;
        }

        public object Sync { get; } = new();

        public string BattleId { get; }

        public string ArenaId { get; }

        public string PlayerActorId { get; }

        public string PlayerClassId { get; }

        public int Seed { get; }

        public Random Rng { get; }

        public Random PoiRng { get; }

        public Random BestiaryRng { get; }

        public Random CritRng { get; }

        public int Tick { get; set; }

        public string PlayerFacingDirection { get; set; }

        public string BattleStatus { get; set; }

        public bool IsRunEnded { get; set; }

        public string? RunEndReason { get; set; }

        public long? RunEndedAtMs { get; set; }

        public bool IsPaused { get; set; }

        public int RunXp { get; set; }

        public int RunLevel { get; set; }

        public int TotalKills { get; set; }

        public int EliteKills { get; set; }

        public int ChestsOpened { get; set; }

        public int PlayerMoveCooldownRemainingMs { get; set; }

        public int PlayerAttackCooldownRemainingMs { get; set; }

        public int PlayerGlobalCooldownRemainingMs { get; set; }

        public long NextChestSpawnCheckAtMs { get; set; }

        public long NextAltarSpawnCheckAtMs { get; set; }

        public long NextAltarInteractAllowedAtMs { get; set; }

        public int NextPoiSequence { get; set; }

        public string? LockedTargetEntityId { get; set; }

        public int? GroundTargetTileX { get; set; }

        public int? GroundTargetTileY { get; set; }

        public StoredAssistConfig AssistConfig { get; set; }

        public int TickEventCounter { get; set; }

        public Dictionary<string, StoredActor> Actors { get; }

        public Dictionary<string, StoredSkill> Skills { get; }

        public ElementType? EquippedWeaponElement { get; }

        public List<StoredDecal> Decals { get; }

        public Dictionary<string, StoredBuff> ActiveBuffs { get; }

        public Dictionary<string, StoredPoi> Pois { get; }

        public Dictionary<int, MobSlotState> MobSlots { get; }

        public Dictionary<MobArchetype, StoredBestiaryEntry> Bestiary { get; }

        public MobArchetype? PendingSpeciesChestArchetype { get; set; }

        public PlayerModifiers PlayerModifiers { get; }

        public PendingCardChoiceState? PendingCardChoice { get; set; }

        public List<string> SelectedCardIds { get; }

        public int CardSelectionsGranted { get; set; }

        public int NextCardChoiceSequence { get; set; }
    }

    private sealed class PlayerModifiers
    {
        public int FlatDamageBonus { get; set; }

        public int PercentDamageBonus { get; set; }

        public int PercentAttackSpeedBonus { get; set; }

        public int PercentMaxHpBonus { get; set; }

        public int FlatHpOnHit { get; set; }

        public int GlobalCooldownReductionPercent { get; set; }
    }

    private sealed class PendingCardChoiceState
    {
        public PendingCardChoiceState(string choiceId, IReadOnlyList<string> offeredCardIds)
        {
            ChoiceId = choiceId;
            OfferedCardIds = offeredCardIds;
        }

        public string ChoiceId { get; }

        public IReadOnlyList<string> OfferedCardIds { get; }
    }

    private sealed record CardDefinition(
        string Id,
        string Name,
        string Description,
        CardEffectBundle Effects);

    private sealed record CardEffectBundle(
        int FlatDamageBonus = 0,
        int PercentDamageBonus = 0,
        int PercentAttackSpeedBonus = 0,
        int PercentMaxHpBonus = 0,
        int FlatHpOnHit = 0,
        int GlobalCooldownReductionPercent = 0);

    private sealed class StoredAssistConfig
    {
        public StoredAssistConfig(
            bool enabled,
            bool autoHealEnabled,
            int healAtHpPercent,
            bool autoGuardEnabled,
            int guardAtHpPercent,
            bool autoOffenseEnabled,
            string offenseMode,
            IReadOnlyDictionary<string, bool> autoSkills,
            int maxAutoCastsPerTick)
        {
            Enabled = enabled;
            AutoHealEnabled = autoHealEnabled;
            HealAtHpPercent = healAtHpPercent;
            AutoGuardEnabled = autoGuardEnabled;
            GuardAtHpPercent = guardAtHpPercent;
            AutoOffenseEnabled = autoOffenseEnabled;
            OffenseMode = offenseMode;
            AutoSkills = autoSkills;
            MaxAutoCastsPerTick = maxAutoCastsPerTick;
        }

        public bool Enabled { get; }

        public bool AutoHealEnabled { get; }

        public int HealAtHpPercent { get; }

        public bool AutoGuardEnabled { get; }

        public int GuardAtHpPercent { get; }

        public bool AutoOffenseEnabled { get; }

        public string OffenseMode { get; }

        public IReadOnlyDictionary<string, bool> AutoSkills { get; }

        public int MaxAutoCastsPerTick { get; }

        public StoredAssistConfig Clone()
        {
            return new StoredAssistConfig(
                enabled: Enabled,
                autoHealEnabled: AutoHealEnabled,
                healAtHpPercent: HealAtHpPercent,
                autoGuardEnabled: AutoGuardEnabled,
                guardAtHpPercent: GuardAtHpPercent,
                autoOffenseEnabled: AutoOffenseEnabled,
                offenseMode: OffenseMode,
                autoSkills: CopyAutoSkillMap(AutoSkills),
                maxAutoCastsPerTick: MaxAutoCastsPerTick);
        }
    }

    private sealed class StoredActor
    {
        public StoredActor(
            string actorId,
            string kind,
            MobArchetype? mobType,
            bool isElite,
            string? buffSourceEliteId,
            string facingDirection,
            int tileX,
            int tileY,
            int hp,
            int maxHp,
            int shield,
            int maxShield,
            int? mobSlotIndex)
        {
            ActorId = actorId;
            Kind = kind;
            MobType = mobType;
            IsElite = isElite;
            BuffSourceEliteId = buffSourceEliteId;
            FacingDirection = NormalizeDirection(facingDirection) ?? FacingUp;
            TileX = tileX;
            TileY = tileY;
            Hp = hp;
            MaxHp = maxHp;
            Shield = shield;
            MaxShield = maxShield;
            MobSlotIndex = mobSlotIndex;
        }

        public string ActorId { get; }

        public string Kind { get; }

        public MobArchetype? MobType { get; }

        public bool IsElite { get; }

        public string? BuffSourceEliteId { get; set; }

        public string FacingDirection { get; set; }

        public int TileX { get; set; }

        public int TileY { get; set; }

        public int Hp { get; set; }

        public int MaxHp { get; set; }

        public int Shield { get; set; }

        public int MaxShield { get; set; }

        public int? MobSlotIndex { get; }
    }

    private sealed class StoredSkill
    {
        public StoredSkill(string skillId, int cooldownRemainingMs, int cooldownTotalMs)
        {
            SkillId = skillId;
            CooldownRemainingMs = cooldownRemainingMs;
            CooldownTotalMs = cooldownTotalMs;
        }

        public string SkillId { get; }

        public int CooldownRemainingMs { get; set; }

        public int CooldownTotalMs { get; }
    }

    private sealed class StoredDecal
    {
        public StoredDecal(
            string entityId,
            DecalKind decalKind,
            string entityType,
            MobArchetype? mobType,
            int tileX,
            int tileY,
            string? spriteKey,
            int remainingMs,
            int totalMs,
            int createdTick)
        {
            EntityId = entityId;
            DecalKind = decalKind;
            EntityType = entityType;
            MobType = mobType;
            TileX = tileX;
            TileY = tileY;
            SpriteKey = spriteKey;
            RemainingMs = remainingMs;
            TotalMs = totalMs;
            CreatedTick = createdTick;
        }

        public string EntityId { get; }

        public DecalKind DecalKind { get; }

        public string EntityType { get; }

        public MobArchetype? MobType { get; }

        public int TileX { get; }

        public int TileY { get; }

        public string? SpriteKey { get; }

        public int RemainingMs { get; set; }

        public int TotalMs { get; }

        public int CreatedTick { get; }
    }

    private sealed class StoredBuff
    {
        public StoredBuff(string buffId, long expiresAtMs)
        {
            BuffId = buffId;
            ExpiresAtMs = expiresAtMs;
        }

        public string BuffId { get; }

        public long ExpiresAtMs { get; }
    }

    private sealed class StoredBestiaryEntry
    {
        public StoredBestiaryEntry(int killsTotal, int nextChestAtKills)
        {
            KillsTotal = killsTotal;
            NextChestAtKills = nextChestAtKills;
        }

        public int KillsTotal { get; set; }

        public int NextChestAtKills { get; set; }
    }

    private sealed class StoredPoi
    {
        public StoredPoi(
            string poiId,
            string type,
            int tileX,
            int tileY,
            long expiresAtMs,
            string? species,
            IReadOnlyDictionary<string, string>? metadata)
        {
            PoiId = poiId;
            Type = type;
            TileX = tileX;
            TileY = tileY;
            ExpiresAtMs = expiresAtMs;
            Species = species;
            Metadata = metadata;
        }

        public string PoiId { get; }

        public string Type { get; }

        public int TileX { get; }

        public int TileY { get; }

        public long ExpiresAtMs { get; }

        public string? Species { get; }

        public IReadOnlyDictionary<string, string>? Metadata { get; }
    }

    private sealed class MobSlotState
    {
        public MobSlotState(
            int slotIndex,
            string actorId,
            string kind,
            MobArchetype archetype,
            bool isElite,
            int respawnRemainingMs,
            int attackCooldownRemainingMs,
            int abilityCooldownRemainingMs,
            int moveCooldownRemainingMs,
            int commitTicksRemaining)
        {
            SlotIndex = slotIndex;
            ActorId = actorId;
            Kind = kind;
            Archetype = archetype;
            IsElite = isElite;
            RespawnRemainingMs = respawnRemainingMs;
            AttackCooldownRemainingMs = attackCooldownRemainingMs;
            AbilityCooldownRemainingMs = abilityCooldownRemainingMs;
            MoveCooldownRemainingMs = moveCooldownRemainingMs;
            CommitTicksRemaining = commitTicksRemaining;
        }

        public int SlotIndex { get; }

        public string ActorId { get; }

        public string Kind { get; }

        public MobArchetype Archetype { get; }

        public bool IsElite { get; }

        public int RespawnRemainingMs { get; set; }

        public int AttackCooldownRemainingMs { get; set; }

        public int AbilityCooldownRemainingMs { get; set; }

        public int MoveCooldownRemainingMs { get; set; }

        public int CommitTicksRemaining { get; set; }
    }
}
