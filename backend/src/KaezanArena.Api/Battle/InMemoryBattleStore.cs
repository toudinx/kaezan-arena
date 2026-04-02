using System.Collections.Concurrent;
using System.Diagnostics;
using System.Threading;
using KaezanArena.Api.Account;
using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore : IBattleStore
{
    private const string DefaultAccountId = "dev_account";
    // Deterministic simulation delta per battle step.
    private static int StepDeltaMs = ArenaConfig.DefaultStepDeltaMs;
    private static readonly int[] BestiaryRankKillThresholds = [0, 10, 30, 60, 100];

    private static readonly MobArchetype[] SpawnArchetypeCycle =
    [
        MobArchetype.MeleeBrute,
        MobArchetype.RangedArcher,
        MobArchetype.MeleeDemon,
        MobArchetype.RangedDragon
    ];
    // Offensive priority for the Assist: ExoriMas -> Exori -> ExoriMin.
    // Ultimate auto-cast is handled separately by the Ultimate gauge.
    // Heal and Guard are excluded — defensive survivability is now passive-card-only.
    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> FixedWeaponKitByPlayerClassId =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [ArenaConfig.PlayerClassKina] =
                ArenaConfig.GetFixedWeaponKitForCharacterId(ArenaConfig.CharacterIds.Kina),
            [ArenaConfig.PlayerClassRangedPrototype] =
                ArenaConfig.GetFixedWeaponKitForCharacterId(ArenaConfig.CharacterIds.RangedPrototype)
        };
    private static readonly string[] AssistOffenseWeaponPriority =
    [
        ArenaConfig.WeaponIds.VoidRicochetId,
        ArenaConfig.WeaponIds.ExoriMas,
        ArenaConfig.WeaponIds.Exori,
        ArenaConfig.WeaponIds.ExoriMin,
        ArenaConfig.WeaponIds.ShotgunId,
        ArenaConfig.WeaponIds.SigilBolt
    ];
    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> RunLevelSkillUpgradeOrderByPlayerClassId =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [ArenaConfig.PlayerClassKina] =
            [
                ArenaConfig.ExoriSkillId,
                ArenaConfig.ExoriMinSkillId,
                ArenaConfig.ExoriMasSkillId
            ],
            [ArenaConfig.PlayerClassRangedPrototype] =
            [
                ArenaConfig.VoidRicochetSkillId,
                ArenaConfig.SigilBoltSkillId,
                ArenaConfig.ShotgunSkillId
            ]
        };
    private static readonly IReadOnlyDictionary<MobArchetype, string> SpeciesByArchetype =
        new Dictionary<MobArchetype, string>
        {
            [MobArchetype.MeleeBrute]   = ArenaConfig.SpeciesIds.MeleeBrute,
            [MobArchetype.RangedArcher] = ArenaConfig.SpeciesIds.RangedArcher,
            [MobArchetype.MeleeDemon]   = ArenaConfig.SpeciesIds.MeleeDemon,
            [MobArchetype.RangedDragon] = ArenaConfig.SpeciesIds.RangedDragon,
        };
    private static readonly IReadOnlySet<string> IncompatibleCardPairs =
        new HashSet<string>(StringComparer.Ordinal)
        {
            BuildCardPairKey("arcane_tempo", "overclocked_reflex")
        };
    private static readonly IReadOnlyList<CardDefinition> CardPool =
    [
        new(
            Id: "colossus_heart",
            Name: "Colossus Heart",
            Description: "+40% max HP and +6 damage.",
            Tags: [ArenaConfig.CardTagDefense, ArenaConfig.CardTagSustain],
            RarityWeight: 40,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 80),
            Effects: new CardEffectBundle(FlatDamageBonus: 6, PercentMaxHpBonus: 40)),
        new(
            Id: "bloodletter_edge",
            Name: "Bloodletter Edge",
            Description: "+22% damage and +2 HP on hit.",
            Tags: [ArenaConfig.CardTagOffense, ArenaConfig.CardTagSustain],
            RarityWeight: 90,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 90),
            Effects: new CardEffectBundle(PercentDamageBonus: 22, FlatHpOnHit: 2)),
        new(
            Id: "frenzy_clockwork",
            Name: "Frenzy Clockwork",
            Description: "+35% attack speed and +8% damage.",
            Tags: [ArenaConfig.CardTagOffense, ArenaConfig.CardTagMobility],
            RarityWeight: 80,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 85),
            Effects: new CardEffectBundle(PercentDamageBonus: 8, PercentAttackSpeedBonus: 35)),
        new(
            Id: "butcher_mark",
            Name: "Butcher Mark",
            Description: "+12 flat damage.",
            Tags: [ArenaConfig.CardTagOffense],
            RarityWeight: 110,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 100),
            Effects: new CardEffectBundle(FlatDamageBonus: 12)),
        new(
            Id: "vampiric_spikes",
            Name: "Vampiric Spikes",
            Description: "+4 HP on hit and +10% max HP.",
            Tags: [ArenaConfig.CardTagSustain, ArenaConfig.CardTagDefense],
            RarityWeight: 70,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 85),
            Effects: new CardEffectBundle(PercentMaxHpBonus: 10, FlatHpOnHit: 4)),
        new(
            Id: "overclocked_reflex",
            Name: "Overclocked Reflex",
            Description: "+25% global cooldown reduction and +20% attack speed.",
            Tags: [ArenaConfig.CardTagUtility, ArenaConfig.CardTagMobility],
            RarityWeight: 35,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 75),
            Effects: new CardEffectBundle(PercentAttackSpeedBonus: 20, GlobalCooldownReductionPercent: 25)),
        new(
            Id: "warlord_banner",
            Name: "Warlord Banner",
            Description: "+18% damage and +20% max HP.",
            Tags: [ArenaConfig.CardTagOffense, ArenaConfig.CardTagDefense],
            RarityWeight: 45,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 80),
            Effects: new CardEffectBundle(PercentDamageBonus: 18, PercentMaxHpBonus: 20)),
        new(
            Id: "titan_grip",
            Name: "Titan Grip",
            Description: "+10 flat damage and +20% attack speed.",
            Tags: [ArenaConfig.CardTagOffense],
            RarityWeight: 85,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 90),
            Effects: new CardEffectBundle(FlatDamageBonus: 10, PercentAttackSpeedBonus: 20)),
        new(
            Id: "arcane_tempo",
            Name: "Arcane Tempo",
            Description: "+30% global cooldown reduction.",
            Tags: [ArenaConfig.CardTagUtility, ArenaConfig.CardTagMobility],
            RarityWeight: 30,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 70),
            Effects: new CardEffectBundle(GlobalCooldownReductionPercent: 30)),
        new(
            Id: "crushing_momentum",
            Name: "Crushing Momentum",
            Description: "+16% damage and +16% attack speed.",
            Tags: [ArenaConfig.CardTagOffense, ArenaConfig.CardTagMobility],
            RarityWeight: 75,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 90),
            Effects: new CardEffectBundle(PercentDamageBonus: 16, PercentAttackSpeedBonus: 16)),
        new(
            Id: "iron_fortress",
            Name: "Iron Fortress",
            Description: "+55% max HP.",
            Tags: [ArenaConfig.CardTagDefense],
            RarityWeight: 40,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 80),
            Effects: new CardEffectBundle(PercentMaxHpBonus: 55)),
        new(
            Id: "executioner_oath",
            Name: "Executioner Oath",
            Description: "+30% damage.",
            Tags: [ArenaConfig.CardTagOffense],
            RarityWeight: 45,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 80),
            Effects: new CardEffectBundle(PercentDamageBonus: 30)),
        new(
            Id: "sanguine_engine",
            Name: "Sanguine Engine",
            Description: "+3 HP on hit and +15% attack speed.",
            Tags: [ArenaConfig.CardTagSustain, ArenaConfig.CardTagOffense],
            RarityWeight: 80,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 90),
            Effects: new CardEffectBundle(FlatHpOnHit: 3, PercentAttackSpeedBonus: 15)),
        new(
            Id: "battle_hymn",
            Name: "Battle Hymn",
            Description: "+8 flat damage and +20% global cooldown reduction.",
            Tags: [ArenaConfig.CardTagOffense, ArenaConfig.CardTagUtility],
            RarityWeight: 50,
            MaxStacks: 3,
            ScalingParams: new CardScalingParams(BaseStackMultiplierPercent: 100, AdditionalStackMultiplierPercent: 85),
            Effects: new CardEffectBundle(FlatDamageBonus: 8, GlobalCooldownReductionPercent: 20))
    ];
    private static readonly IReadOnlyDictionary<string, CardDefinition> CardById =
        CardPool.ToDictionary(card => card.Id, StringComparer.Ordinal);

    private readonly ConcurrentDictionary<string, StoredBattle> _battles = new();
    private readonly IAccountStateStore? _accountStateStore;
    private int _sequence;
    private static readonly IReadOnlyDictionary<MobArchetype, MobArchetypeConfig> MobConfigs =
        new Dictionary<MobArchetype, MobArchetypeConfig>
        {
            [MobArchetype.MeleeBrute] = new(
                MaxHp: ArenaConfig.MeleeBruteMaxHp,
                MoveCooldownMs: ArenaConfig.MeleeBruteMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.MeleeBruteAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.MeleeBruteAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.MeleeBruteAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.MeleeBruteAbilityDamage,
                AbilityRangeTiles: ArenaConfig.MeleeBruteAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.MeleeBruteAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobCleaveFxId),
            [MobArchetype.RangedArcher] = new(
                MaxHp: ArenaConfig.RangedArcherMaxHp,
                MoveCooldownMs: ArenaConfig.RangedArcherMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.RangedArcherAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.RangedArcherAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.RangedArcherAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.RangedArcherAbilityDamage,
                AbilityRangeTiles: ArenaConfig.RangedArcherAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.RangedArcherAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobPowerShotFxId),
            [MobArchetype.MeleeDemon] = new(
                MaxHp: ArenaConfig.MeleeDemonMaxHp,
                MoveCooldownMs: ArenaConfig.MeleeDemonMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.MeleeDemonAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.MeleeDemonAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.MeleeDemonAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.MeleeDemonAbilityDamage,
                AbilityRangeTiles: ArenaConfig.MeleeDemonAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.MeleeDemonAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobDemonBeamFxId),
            [MobArchetype.RangedDragon] = new(
                MaxHp: ArenaConfig.RangedDragonMaxHp,
                MoveCooldownMs: ArenaConfig.RangedDragonMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.RangedDragonAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.RangedDragonAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.RangedDragonAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.RangedDragonAbilityDamage,
                AbilityRangeTiles: ArenaConfig.RangedDragonAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.RangedDragonAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobDragonBreathFxId)
        };
    private static readonly IReadOnlyDictionary<MobArchetype, IMobBehavior> MobBehaviors =
        new Dictionary<MobArchetype, IMobBehavior>
        {
            [MobArchetype.MeleeBrute] = new MeleeBruteBehavior(),
            [MobArchetype.RangedArcher] = new RangedArcherBehavior(),
            [MobArchetype.MeleeDemon] = new MeleeDemonBehavior(),
            [MobArchetype.RangedDragon] = new RangedDragonBehavior()
        };

    public InMemoryBattleStore(int? stepDeltaMs = null, IAccountStateStore? accountStateStore = null)
    {
        StepDeltaMs = ArenaConfig.NormalizeStepDeltaMs(stepDeltaMs);
        _accountStateStore = accountStateStore;
    }

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
        var resolvedPlayerClassId = ResolvePlayerClassId(normalizedPlayer);

        var state = new StoredBattle(
            battleId: battleId,
            arenaId: normalizedArena,
            playerActorId: normalizedPlayer,
            playerClassId: resolvedPlayerClassId,
            seed: resolvedSeed,
            rng: battleRng,
            poiRng: poiRng,
            bestiaryRng: bestiaryRng,
            critRng: critRng,
            tick: 0,
            playerFacingDirection: ArenaConfig.FacingUp,
            battleStatus: ArenaConfig.StatusStarted,
            isRunEnded: false,
            runEndReason: null,
            runEndedAtMs: null,
            isPaused: false,
            runXp: ArenaConfig.RunInitialXp,
            runLevel: ArenaConfig.RunInitialLevel,
            totalKills: 0,
            eliteKills: 0,
            chestsOpened: 0,
            playerMoveCooldownRemainingMs: 0,
            playerAttackCooldownRemainingMs: 0,
            playerGlobalCooldownRemainingMs: 0,
            nextChestSpawnCheckAtMs: ArenaConfig.InitialChestSpawnCheckAtMs,
            nextAltarSpawnCheckAtMs: ArenaConfig.AltarSpawnCheckMs,
            nextAltarInteractAllowedAtMs: 0,
            nextPoiSequence: 1,
            lockedTargetEntityId: null,
            groundTargetTileX: null,
            groundTargetTileY: null,
            assistConfig: BuildDefaultAssistConfig(resolvedPlayerClassId),
            actors: new Dictionary<string, StoredActor>(StringComparer.Ordinal)
            {
                [normalizedPlayer] = new StoredActor(
                    actorId: normalizedPlayer,
                    kind: "player",
                    mobType: null,
                    isElite: false,
                    buffSourceEliteId: null,
                    facingDirection: ArenaConfig.FacingUp,
                    tileX: ArenaConfig.PlayerTileX,
                    tileY: ArenaConfig.PlayerTileY,
                    hp: ArenaConfig.PlayerBaseHp,
                    maxHp: ArenaConfig.PlayerBaseHp,
                    shield: 0,
                    maxShield: ComputePlayerMaxShield(maxHp: ArenaConfig.PlayerBaseHp),
                    mobSlotIndex: null)
            },
            skills: BuildInitialSkills(resolvedPlayerClassId),
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
            selectedCardStacks: new Dictionary<string, int>(StringComparer.Ordinal),
            cardSelectionsGranted: 0,
            nextCardChoiceSequence: 1,
            replayActions: [],
            ultimateGauge: 0,
            ultimateReady: false,
            masteryXpAwardedAtRunEnd: false);

        var initialMobCap = ResolveSpawnPacingDirector(state).MaxAliveMobs;
        foreach (var slot in state.MobSlots.Values.OrderBy(value => value.SlotIndex))
        {
            if (slot.SlotIndex > initialMobCap)
            {
                continue;
            }

            TrySpawnMobInSlot(state, slot);
        }

        ValidateInvariants(state);
        _battles[battleId] = state;
        return ToSnapshot(state, [], []);
    }


    public BattleSnapshot StepBattle(string battleId, int? clientTick, IReadOnlyList<BattleCommandDto>? commands, int? stepCount = null)
    {
        if (string.IsNullOrWhiteSpace(battleId) || !_battles.TryGetValue(battleId.Trim(), out var state))
        {
            throw new KeyNotFoundException($"Battle '{battleId}' was not found.");
        }

        lock (state.Sync)
        {
            AppendReplayStepAction(state, clientTick, stepCount, commands);

            if (state.IsRunEnded)
            {
                TryAwardRunEndMasteryXp(state);
                state.TickEventCounter = 0;
                ValidateInvariants(state);
                return ToSnapshot(state, [], []);
            }

            if (!IsStarted(state))
            {
                state.Tick += 1;
                state.TickEventCounter = 0;
                var rejectedCommandResults = BuildStatusRejectedCommandResults(state, commands);
                ValidateInvariants(state);
                return ToSnapshot(state, [], rejectedCommandResults);
            }

            var stepsToRun = Math.Max(1, Math.Min(stepCount ?? 1, ArenaConfig.MaxBatchStepCount));
            var allEvents = new List<BattleEventDto>();
            IReadOnlyList<CommandResultDto> finalCommandResults = [];

            for (var i = 0; i < stepsToRun; i++)
            {
                var tickBeforeThisStep = state.Tick;
                var nowMsBeforeThisStep = GetElapsedMsForTick(tickBeforeThisStep);
                // Commands apply on the last sub-tick only; earlier ticks are the "skipped" empty ticks.
                var tickCommands = (i == stepsToRun - 1) ? commands : null;

                var preApplied = ApplyPauseCommands(state, tickCommands);
                if (state.IsPaused)
                {
                    finalCommandResults = BuildPausedCommandResults(tickCommands, preApplied);
                    ValidateInvariants(state, expectedTick: tickBeforeThisStep, expectedNowMs: nowMsBeforeThisStep);
                    break;
                }

                if (state.PendingCardChoice is not null)
                {
                    finalCommandResults = BuildAwaitingCardChoiceCommandResults(tickCommands, preApplied);
                    ValidateInvariants(state, expectedTick: tickBeforeThisStep, expectedNowMs: nowMsBeforeThisStep);
                    break;
                }

                var runEnded = ExecuteOneTick(state, tickCommands, preApplied, allEvents, out var tickResults);
                finalCommandResults = tickResults;
                if (runEnded)
                {
                    break;
                }
            }

            TryAwardRunEndMasteryXp(state);
            ValidateInvariants(state);
            return ToSnapshot(state, allEvents, finalCommandResults);
        }
    }

    /// <summary>
    /// Executes a single simulation tick. Caller must have already run ApplyPauseCommands and
    /// verified the state is neither paused nor awaiting a card choice.
    /// </summary>
    /// <returns>True if the run ended during this tick (caller should stop the batch loop).</returns>
    private static bool ExecuteOneTick(
        StoredBattle state,
        IReadOnlyList<BattleCommandDto>? commands,
        IReadOnlyDictionary<int, CommandResultDto> preAppliedPauseResults,
        List<BattleEventDto> events,
        out IReadOnlyList<CommandResultDto> commandResults)
    {
        state.Tick += 1;
        state.TickEventCounter = 0;

        if (TryEndRunIfNeeded(state, events))
        {
            commandResults = BuildOrderedCommandResults(preAppliedPauseResults);
            return true;
        }

        TickSkillCooldowns(state);
        TickPlayerGlobalCooldown(state);
        TickPlayerAutoAttackCooldown(state);
        TickMobCombatCooldowns(state);
        TickPois(state, events);
        TickBuffs(state);
        MaintainEliteCommanderBuffs(state, events);

        var pendingLifeLeechHeal = 0;
        var hasExplicitFacingCommand = false;
        var preAppliedCommandResults = preAppliedPauseResults;
        TickMobMovement(state);
        TickMobCommitWindows(state);
        TickDecals(state);
        commandResults = ApplyCommands(
            state,
            commands,
            events,
            ref pendingLifeLeechHeal,
            ref hasExplicitFacingCommand,
            preAppliedCommandResults);
        EvaluateCombatAssist(state, events, ref pendingLifeLeechHeal);
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

        return false;
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

            var currentStacks = GetCardStackCount(state, selectedCard.Id);
            if (currentStacks >= selectedCard.MaxStacks)
            {
                throw new InvalidOperationException(
                    $"Card '{selectedCard.Id}' is already at max stacks ({selectedCard.MaxStacks}).");
            }

            if (IsCardBannedByCurrentLoadout(state, selectedCard.Id))
            {
                throw new InvalidOperationException($"Card '{selectedCard.Id}' is incompatible with the current loadout.");
            }

            if (ExceedsDistinctPassiveCap(state, selectedCard))
            {
                throw new InvalidOperationException(
                    $"Cannot pick '{selectedCard.Id}': already at {ArenaConfig.MaxDistinctPassiveCards} distinct passive types.");
            }

            var player = GetPlayerActor(state);
            if (player is null)
            {
                throw new InvalidOperationException("Player actor is missing.");
            }

            var nextStack = currentStacks + 1;
            AppendReplayChooseCardAction(state, normalizedChoiceId, normalizedSelectedCardId);
            ApplyCardEffects(state, player, selectedCard, nextStack);
            state.SelectedCardIds.Add(selectedCard.Id);
            state.SelectedCardStacks[selectedCard.Id] = nextStack;
            state.PendingCardChoice = null;

            var events = new List<BattleEventDto>
            {
                new CardChosenEventDto(
                    ChoiceId: pendingChoice.ChoiceId,
                    Card: ToCardOfferDto(state, selectedCard))
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
                isEliteSlot: IsEliteSlotIndex(slotIndex),
                respawnRemainingMs: 0,
                attackCooldownRemainingMs: 0,
                abilityCooldownRemainingMs: 0,
                moveCooldownRemainingMs: 0,
                commitTicksRemaining: 0);
        }

        return slots;
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

    private static int ComputeInitialBestiaryThreshold(Random bestiaryRng)
    {
        return ArenaConfig.BestiaryFirstChestBaseKills + NextIntFromBestiaryRng(
            bestiaryRng,
            ArenaConfig.BestiaryFirstChestRandomInclusiveMax + 1);
    }

    private static int ComputeBestiaryThresholdIncrement(Random bestiaryRng)
    {
        return ArenaConfig.BestiaryChestIncrementBaseKills + NextIntFromBestiaryRng(
            bestiaryRng,
            ArenaConfig.BestiaryChestIncrementRandomInclusiveMax + 1);
    }

    private static int ComputeBestiaryThresholdIncrement(StoredBattle state)
    {
        return ArenaConfig.BestiaryChestIncrementBaseKills + NextIntFromBestiaryRng(
            state,
            ArenaConfig.BestiaryChestIncrementRandomInclusiveMax + 1);
    }

    private static int ResolveBestiaryRank(int killsTotal)
    {
        var clampedKills = Math.Max(0, killsTotal);
        var rank = 1;
        for (var index = BestiaryRankKillThresholds.Length - 1; index >= 0; index -= 1)
        {
            if (clampedKills < BestiaryRankKillThresholds[index])
            {
                continue;
            }

            rank = index + 1;
            break;
        }

        return rank;
    }

    private static string ResolvePlayerClassId(string playerActorId)
    {
        if (string.Equals(playerActorId, ArenaConfig.CharacterIds.RangedPrototype, StringComparison.Ordinal))
        {
            return ArenaConfig.PlayerClassRangedPrototype;
        }

        return ArenaConfig.PlayerClassKina;
    }

    private static IReadOnlyList<string> ResolveFixedWeaponKitForPlayerClass(string playerClassId)
    {
        if (FixedWeaponKitByPlayerClassId.TryGetValue(playerClassId, out var fixedWeaponKit))
        {
            return fixedWeaponKit;
        }

        return FixedWeaponKitByPlayerClassId[ArenaConfig.PlayerClassKina];
    }

    private static IReadOnlyList<string> ResolveFixedSkillIdsForPlayerClass(string playerClassId)
    {
        var fixedSkillIds = new List<string>();
        foreach (var weaponId in ResolveFixedWeaponKitForPlayerClass(playerClassId))
        {
            var skillId = ArenaConfig.GetSkillIdForWeaponId(weaponId);
            if (string.IsNullOrWhiteSpace(skillId))
            {
                throw new InvalidOperationException(
                    $"Fixed-kit weapon '{weaponId}' has no mapped skill id for class '{playerClassId}'.");
            }

            fixedSkillIds.Add(skillId);
        }

        return fixedSkillIds;
    }

    private static IReadOnlyList<string> ResolveAssistOffenseSkillPriority(StoredBattle state)
    {
        var fixedWeaponKit = ResolveFixedWeaponKitForPlayerClass(state.PlayerClassId);
        var fixedWeaponSet = new HashSet<string>(fixedWeaponKit, StringComparer.Ordinal);
        var resolvedPriority = new List<string>(capacity: fixedWeaponSet.Count);

        foreach (var weaponId in AssistOffenseWeaponPriority)
        {
            if (!fixedWeaponSet.Contains(weaponId))
            {
                continue;
            }

            var skillId = ArenaConfig.GetSkillIdForWeaponId(weaponId);
            if (string.IsNullOrWhiteSpace(skillId))
            {
                throw new InvalidOperationException(
                    $"Assist priority weapon '{weaponId}' has no mapped skill id for class '{state.PlayerClassId}'.");
            }

            resolvedPriority.Add(skillId);
        }

        return resolvedPriority;
    }

    private static IReadOnlyList<string> ResolveRunLevelSkillUpgradeOrder(StoredBattle state)
    {
        if (RunLevelSkillUpgradeOrderByPlayerClassId.TryGetValue(state.PlayerClassId, out var order))
        {
            return order;
        }

        return RunLevelSkillUpgradeOrderByPlayerClassId[ArenaConfig.PlayerClassKina];
    }

    private static StoredAssistConfig BuildDefaultAssistConfig(string playerClassId)
    {
        var defaultAutoSkills = ResolveFixedSkillIdsForPlayerClass(playerClassId)
            .ToDictionary(skillId => skillId, _ => true, StringComparer.Ordinal);

        return new StoredAssistConfig(
            enabled: true,
            autoHealEnabled: true,
            healAtHpPercent: ArenaConfig.AssistDefaultHealAtHpPercent,
            autoGuardEnabled: true,
            guardAtHpPercent: ArenaConfig.AssistDefaultGuardAtHpPercent,
            autoOffenseEnabled: true,
            offenseMode: ArenaConfig.AssistOffenseModeCooldownSpam,
            autoSkills: defaultAutoSkills,
            maxAutoCastsPerTick: ArenaConfig.AssistDefaultMaxAutoCastsPerTick);
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

    private static StoredAssistConfig SanitizeAssistConfig(
        StoredBattle state,
        AssistConfigDto? requested,
        StoredAssistConfig fallback)
    {
        if (requested is null)
        {
            return fallback.Clone();
        }

        var offenseMode = NormalizeAssistOffenseMode(requested.OffenseMode) ?? fallback.OffenseMode;
        var offenseSkillPriority = ResolveAssistOffenseSkillPriority(state);
        var autoSkills = SanitizeAssistAutoSkills(requested.AutoSkills, fallback.AutoSkills, offenseSkillPriority);

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
        IReadOnlyDictionary<string, bool> fallback,
        IReadOnlyList<string> offenseSkillPriority)
    {
        var sanitized = new Dictionary<string, bool>(StringComparer.Ordinal);
        foreach (var skillId in offenseSkillPriority)
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
            ArenaConfig.AssistOffenseModeCooldownSpam => ArenaConfig.AssistOffenseModeCooldownSpam,
            ArenaConfig.AssistOffenseModeSmart => ArenaConfig.AssistOffenseModeSmart,
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
        return (int)Math.Floor(maxHp * 0.45d);
    }

    private static int ResolvePlayerMaxHp(StoredBattle state)
    {
        return Math.Max(
            1,
            ApplyPercentIncrease(
                ArenaConfig.PlayerBaseHp,
                Math.Max(0, state.PlayerModifiers.PercentMaxHpBonus)));
    }

    private static int ResolvePlayerAutoAttackCooldownMs(StoredBattle state)
    {
        return Math.Max(
            1,
            ApplyPercentReduction(
                ArenaConfig.PlayerAutoAttackCooldownMs,
                Math.Max(0, state.PlayerModifiers.PercentAttackSpeedBonus)));
    }

    private static int ResolvePlayerGlobalCooldownMs(StoredBattle state)
    {
        var reductionPercent = ResolveCardGlobalCooldownReductionPercent(state);
        return Math.Max(1, ApplyPercentReduction(ArenaConfig.PlayerGlobalCooldownMs, reductionPercent));
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

    private static IReadOnlyList<CommandResultDto> ApplyCommands(
        StoredBattle state,
        IReadOnlyList<BattleCommandDto>? commands,
        List<BattleEventDto> events,
        ref int pendingLifeLeechHeal,
        ref bool hasExplicitFacingCommand,
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

            if (string.Equals(commandType, ArenaConfig.SetFacingCommandType, StringComparison.Ordinal))
            {
                var normalizedDirection = NormalizeDirection(command.Dir);
                if (normalizedDirection is null)
                {
                    commandResults.Add(new CommandResultDto(index, commandType, false, ArenaConfig.UnknownDirectionReason));
                    continue;
                }

                state.PlayerFacingDirection = normalizedDirection;
                hasExplicitFacingCommand = true;
                commandResults.Add(new CommandResultDto(index, commandType, true, null));
                continue;
            }

            if (string.Equals(commandType, ArenaConfig.SetGroundTargetCommandType, StringComparison.Ordinal))
            {
                if (command.GroundTileX is null && command.GroundTileY is null)
                {
                    state.GroundTargetTileX = null;
                    state.GroundTargetTileY = null;
                    commandResults.Add(new CommandResultDto(index, commandType, true, null));
                    continue;
                }

                var gx = command.GroundTileX ?? 0;
                var gy = command.GroundTileY ?? 0;
                if (!IsInBounds(gx, gy))
                {
                    commandResults.Add(new CommandResultDto(index, commandType, false, ArenaConfig.InvalidGroundTargetReason));
                    continue;
                }

                state.GroundTargetTileX = gx;
                state.GroundTargetTileY = gy;
                var player = GetPlayerActor(state);
                if (player is not null)
                {
                    state.PlayerFacingDirection = ResolveFacingDirectionTowardTile(
                        player.TileX, player.TileY, gx, gy, state.PlayerFacingDirection);
                }

                hasExplicitFacingCommand = true;
                commandResults.Add(new CommandResultDto(index, commandType, true, null));
                continue;
            }

            if (string.Equals(commandType, ArenaConfig.MovePlayerCommandType, StringComparison.Ordinal))
            {
                // move_player commands are disabled — player is fixed at the center tile.
                commandResults.Add(new CommandResultDto(index, commandType, false, ArenaConfig.UnknownCommandReason));
                continue;
            }

            if (string.Equals(commandType, ArenaConfig.SetTargetCommandType, StringComparison.Ordinal))
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

            if (string.Equals(commandType, ArenaConfig.SetAssistConfigCommandType, StringComparison.Ordinal))
            {
                state.AssistConfig = SanitizeAssistConfig(state, command.AssistConfig, state.AssistConfig);
                commandResults.Add(new CommandResultDto(index, commandType, true, null));
                continue;
            }

            if (string.Equals(commandType, ArenaConfig.InteractPoiCommandType, StringComparison.Ordinal))
            {
                var interacted = TryExecutePoiInteraction(state, events, command.PoiId, out var interactionFailReason);
                commandResults.Add(new CommandResultDto(index, commandType, interacted, interactionFailReason));
                continue;
            }

            if (!string.Equals(commandType, ArenaConfig.CastSkillCommandType, StringComparison.Ordinal))
            {
                commandResults.Add(new CommandResultDto(index, commandType, false, ArenaConfig.UnknownCommandReason));
                continue;
            }

            var normalizedSkillId = NormalizeSkillId(command.SkillId);
            if (string.IsNullOrEmpty(normalizedSkillId))
            {
                commandResults.Add(new CommandResultDto(index, commandType, false, ArenaConfig.UnknownSkillReason));
                continue;
            }

            var castResult = TryExecutePlayerSkillCast(state, events, normalizedSkillId, ref pendingLifeLeechHeal);
            commandResults.Add(new CommandResultDto(index, commandType, castResult.Success, castResult.Reason));
        }

        return commandResults;
    }

    private static SkillCastResult TryExecutePlayerSkillCast(
        StoredBattle state,
        List<BattleEventDto> events,
        string normalizedSkillId,
        ref int pendingLifeLeechHeal)
    {
        if (!state.Skills.TryGetValue(normalizedSkillId, out var skill))
        {
            return SkillCastResult.Fail(ArenaConfig.UnknownSkillReason);
        }

        if (skill.CooldownRemainingMs > 0)
        {
            return SkillCastResult.Fail(ArenaConfig.CooldownReason);
        }

        if (state.PlayerGlobalCooldownRemainingMs > 0)
        {
            return SkillCastResult.Fail(ArenaConfig.GlobalCooldownReason);
        }

        var player = GetPlayerActor(state);
        if (player is null)
        {
            return SkillCastResult.Fail(ArenaConfig.NoTargetReason);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.ExoriSkillId, StringComparison.Ordinal))
        {
            var hitAnyTarget = ApplyAreaSquareSkill(
                state,
                events,
                player,
                radius: 1,
                damage: 10,
                fxId: ArenaConfig.ExoriFxId,
                element: ArenaConfig.ExoriElement,
                ref pendingLifeLeechHeal);
            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(hitAnyTarget ? null : ArenaConfig.NoTargetReason);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.ExoriMasSkillId, StringComparison.Ordinal))
        {
            var hitAnyTarget = ApplyAreaDiamondSkill(
                state,
                events,
                player,
                radius: 2,
                damage: 7,
                fxId: ArenaConfig.ExoriMasFxId,
                element: ArenaConfig.ExoriMasElement,
                ref pendingLifeLeechHeal);
            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(hitAnyTarget ? null : ArenaConfig.NoTargetReason);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.ExoriMinSkillId, StringComparison.Ordinal))
        {
            var hitAnyTarget = ApplyFrontalMeleeSkill(
                state,
                events,
                player,
                damage: 15,
                fxId: ArenaConfig.ExoriMinFxId,
                element: ArenaConfig.ExoriMinElement,
                ref pendingLifeLeechHeal);
            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(hitAnyTarget ? null : ArenaConfig.NoTargetReason);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.HealSkillId, StringComparison.Ordinal))
        {
            ApplySelfHealSkill(state, events, player, skill);
            ApplyPlayerCooldownsForCast(state, skill);
            return SkillCastResult.Ok(null);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.GuardSkillId, StringComparison.Ordinal))
        {
            ApplyGuardSkill(events, player, skill);
            ApplyPlayerCooldownsForCast(state, skill);
            return SkillCastResult.Ok(null);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.AvalancheSkillId, StringComparison.Ordinal))
        {
            var targetResolution = TryResolveAvalancheCastTarget(state, player);
            if (!targetResolution.HasTarget)
            {
                return SkillCastResult.Fail(targetResolution.FailReason ?? ArenaConfig.NoTargetReason);
            }

            var hitAnyTarget = ApplyGroundSquareSkillAt(
                state,
                events,
                targetResolution.TileX,
                targetResolution.TileY,
                radius: 1,
                damage: ArenaConfig.AvalancheDamage,
                fxId: ArenaConfig.AvalancheFxId,
                element: ArenaConfig.AvalancheElement,
                attacker: player,
                ref pendingLifeLeechHeal);
            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(hitAnyTarget ? null : ArenaConfig.NoTargetReason);
        }

        return SkillCastResult.Fail(ArenaConfig.UnknownSkillReason);
    }

    private static void ApplyPlayerCooldownsForCast(StoredBattle state, StoredSkill skill)
    {
        skill.CooldownRemainingMs = ResolveSkillCooldownTotalMs(state, skill);
        state.PlayerGlobalCooldownRemainingMs = ResolvePlayerGlobalCooldownMs(state);
    }

    private static void EvaluateCombatAssist(
        StoredBattle state,
        List<BattleEventDto> events,
        ref int pendingLifeLeechHeal)
    {
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
            // Defensive heal/guard branch removed: survivability is now passive-card-only.
            if (TryApplyAssistOffensiveCast(state, events, player, assist, ref pendingLifeLeechHeal))
            {
                castsRemaining -= 1;
                continue;
            }

            break;
        }
    }

    // Defensive cast path (Heal / Guard) is intentionally absent from the Assist.
    // Heal and Guard skill implementations are preserved for future expansion.

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

        var hasAutoAttackTarget = ResolveEffectivePlayerAutoAttackTarget(state, player) is not null;

        var offenseSkillPriority = ResolveAssistOffenseSkillPriority(state);
        if (string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassKina, StringComparison.Ordinal))
        {
            if (offenseSkillPriority.Contains(ArenaConfig.SigilBoltSkillId, StringComparer.Ordinal))
            {
                throw new InvalidOperationException(
                    "Critical invariant violation: Sigil Bolt entered Kina assist priority.");
            }

            if (offenseSkillPriority.Contains(ArenaConfig.ShotgunSkillId, StringComparer.Ordinal))
            {
                throw new InvalidOperationException(
                    "Critical invariant violation: Shotgun entered Kina assist priority.");
            }

            if (offenseSkillPriority.Contains(ArenaConfig.VoidRicochetSkillId, StringComparer.Ordinal))
            {
                throw new InvalidOperationException(
                    "Critical invariant violation: Void Ricochet entered Kina assist priority.");
            }
        }

        if (hasAutoAttackTarget)
        {
            foreach (var skillId in offenseSkillPriority)
            {
                if (!assist.AutoSkills.TryGetValue(skillId, out var isEnabled) || !isEnabled)
                {
                    continue;
                }

                if (string.Equals(skillId, ArenaConfig.SigilBoltSkillId, StringComparison.Ordinal))
                {
                    if (string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassKina, StringComparison.Ordinal))
                    {
                        throw new InvalidOperationException(
                            "Critical invariant violation: Sigil Bolt entered Kina assist priority.");
                    }

                    if (TryExecuteSigilBolt(state, events))
                    {
                        events.Add(new AssistCastEventDto(ArenaConfig.SigilBoltSkillId, ArenaConfig.AssistReasonAutoOffense));
                        return true;
                    }

                    continue;
                }

                if (string.Equals(skillId, ArenaConfig.ShotgunSkillId, StringComparison.Ordinal))
                {
                    if (string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassKina, StringComparison.Ordinal))
                    {
                        throw new InvalidOperationException(
                            "Critical invariant violation: Shotgun entered Kina assist priority.");
                    }

                    if (TryExecuteShotgun(state, events))
                    {
                        events.Add(new AssistCastEventDto(ArenaConfig.ShotgunSkillId, ArenaConfig.AssistReasonAutoOffense));
                        return true;
                    }

                    continue;
                }

                if (string.Equals(skillId, ArenaConfig.VoidRicochetSkillId, StringComparison.Ordinal))
                {
                    if (string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassKina, StringComparison.Ordinal))
                    {
                        throw new InvalidOperationException(
                            "Critical invariant violation: Void Ricochet entered Kina assist priority.");
                    }

                    if (TryExecuteVoidRicochet(state, events))
                    {
                        events.Add(new AssistCastEventDto(ArenaConfig.VoidRicochetSkillId, ArenaConfig.AssistReasonAutoOffense));
                        return true;
                    }

                    continue;
                }

                if (TryApplyAssistSkillCast(state, events, skillId, ArenaConfig.AssistReasonAutoOffense, ref pendingLifeLeechHeal))
                {
                    return true;
                }
            }
        }

        if (TryFireUltimate(state, events, player, ref pendingLifeLeechHeal))
        {
            return true;
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

    private static bool TryFireUltimate(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player,
        ref int pendingLifeLeechHeal)
    {
        if (!state.UltimateReady)
        {
            return false;
        }

        _ = ApplyAreaSquareSkill(
            state,
            events,
            player,
            ArenaConfig.UltimateConfig.AoeRadius,
            ArenaConfig.UltimateConfig.BaseDamage,
            ArenaConfig.AvalancheFxId,
            GetPlayerBaseElement(state),
            ref pendingLifeLeechHeal);

        state.UltimateGauge = 0;
        state.UltimateReady = false;
        Console.WriteLine("Ultimate fired");
        events.Add(new AssistCastEventDto(
            ArenaConfig.UltimateConfig.UltimateSkillId,
            ArenaConfig.AssistReasonAutoOffense));
        return true;
    }

    private static void AddUltimateGauge(StoredBattle state, int amount)
    {
        if (amount <= 0)
        {
            return;
        }

        var normalizedGauge = Math.Max(0, state.UltimateGauge);
        var nextGauge = normalizedGauge + amount;
        state.UltimateGauge = Math.Min(nextGauge, ArenaConfig.UltimateConfig.GaugeMax);
        state.UltimateReady = state.UltimateGauge >= ArenaConfig.UltimateConfig.GaugeMax;
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
                return distance >= ArenaConfig.MobSpawnRingMinDistance && distance <= ArenaConfig.MobSpawnRingMaxDistance;
            })
            .ToList();

        var candidateTiles = preferredRingTiles.Count > 0 ? preferredRingTiles : freeTiles;
        var tileIndex = NextIntFromBattleRng(state, candidateTiles.Count);
        var tile = candidateTiles[tileIndex];
        var config = GetMobConfig(slot.Archetype);
        var spawnAsElite = ShouldSpawnEliteForSlot(state, slot);
        var maxHp = ResolveScaledMobMaxHp(state, config, spawnAsElite);
        state.Actors[slot.ActorId] = new StoredActor(
            actorId: slot.ActorId,
            kind: slot.Kind,
            mobType: slot.Archetype,
            isElite: spawnAsElite,
            buffSourceEliteId: null,
            facingDirection: ArenaConfig.FacingUp,
            tileX: tile.TileX,
            tileY: tile.TileY,
            hp: maxHp,
            maxHp: maxHp,
            shield: 0,
            maxShield: 0,
            mobSlotIndex: slot.SlotIndex);
        if (spawnAsElite && events is not null)
        {
            events.Add(new EliteSpawnedEventDto(
                EliteEntityId: slot.ActorId,
                MobType: slot.Archetype));
        }

        if (spawnAsElite)
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

    private static bool ShouldSpawnEliteForSlot(StoredBattle state, MobSlotState slot)
    {
        if (!slot.IsEliteSlot)
        {
            return false;
        }

        var eliteChancePercent = ResolveSpawnPacingDirector(state).EliteSpawnChancePercent;
        return NextIntFromBattleRng(state, 100) < eliteChancePercent;
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

        return NextIntFromBattleRng(state, 1, autoAttackCooldownMs + 1);
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
            durationMs: ArenaConfig.MeleeSwingDurationMs);

        events.Add(new FxSpawnEventDto(
            FxId: ArenaConfig.HitSmallFxId,
            TileX: targetMob.TileX,
            TileY: targetMob.TileY,
            Layer: "hitFx",
            DurationMs: 620,
            Element: playerBaseElement));

        var hpDamageApplied = ApplyDamageToMob(
            state,
            events,
            targetMob,
            ArenaConfig.PlayerAutoAttackDamage,
            playerBaseElement,
            attacker: player);
        pendingLifeLeechHeal += ComputeLifeLeechHeal(hpDamageApplied);
        GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
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
                ? ArenaConfig.RangedProjectileDurationMs
                : ArenaConfig.MeleeSwingDurationMs;
            EmitAttackFx(
                state,
                events,
                attackFxKind,
                fromActor: liveMob,
                toActor: player,
                elementType: ArenaConfig.DefaultMobElement,
                durationMs: attackFxDuration);

            events.Add(new FxSpawnEventDto(
                FxId: ArenaConfig.HitSmallFxId,
                TileX: player.TileX,
                TileY: player.TileY,
                Layer: "hitFx",
                DurationMs: 620,
                Element: ArenaConfig.DefaultMobElement));

            ApplyDamageToPlayer(
                state,
                events,
                player,
                ResolveMobOutgoingDamage(state, liveMob, config.AutoAttackDamage),
                ArenaConfig.DefaultMobElement,
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
            elementType: ArenaConfig.DefaultMobElement,
            durationMs: ArenaConfig.MeleeSwingDurationMs);
        EmitFxForTiles(events, tiles, config.AbilityFxId, ArenaConfig.DefaultMobElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            ArenaConfig.DefaultMobElement,
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
            elementType: ArenaConfig.DefaultMobElement,
            durationMs: ArenaConfig.RangedProjectileDurationMs);
        EmitFxForTiles(events, tiles, config.AbilityFxId, ArenaConfig.DefaultMobElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            ArenaConfig.DefaultMobElement,
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

        EmitFxForTiles(events, lineTiles, config.AbilityFxId, ArenaConfig.DefaultMobElement);
        if (playerCollinearInFront)
        {
            ApplyDamageToPlayer(
                state,
                events,
                player,
                ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
                ArenaConfig.DefaultMobElement,
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

        EmitFxForTiles(events, coneTiles, config.AbilityFxId, ArenaConfig.DefaultMobElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            ArenaConfig.DefaultMobElement,
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
        // Find the in-range tile whose 3x3 square (radius 1) would hit the most mobs.
        // Scan row-major (Y then X) for a deterministic tie-break â€” first tile with max count wins.
        int? bestX = null;
        int? bestY = null;
        var bestCount = 0;

        for (var cy = 0; cy < ArenaConfig.Height; cy++)
        {
            for (var cx = 0; cx < ArenaConfig.Width; cx++)
            {
                if (ComputeManhattanDistance(player.TileX, player.TileY, cx, cy) > ArenaConfig.AvalancheRangeTilesManhattan)
                {
                    continue;
                }

                var affectedTiles = BuildSquareTiles(cx, cy, radius: 1, includeCenter: true)
                    .Where(t => IsInBounds(t.TileX, t.TileY))
                    .ToList();
                var count = ResolveMobIdsOnTiles(state, affectedTiles).Count();
                if (count > bestCount)
                {
                    bestCount = count;
                    bestX = cx;
                    bestY = cy;
                }
            }
        }

        if (bestX is null || bestCount == 0)
        {
            return AvalancheCastTargetResolution.Fail(ArenaConfig.NoTargetReason);
        }

        return AvalancheCastTargetResolution.Success(bestX.Value, bestY!.Value);
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

        return NextIntFromCritRng(state, 100) < ArenaConfig.CriticalHitChancePercent
            ? BattleHitKinds.Crit
            : BattleHitKinds.Normal;
    }

    private static void EmitCritTextEvent(List<BattleEventDto> events, int tileX, int tileY, long startAtMs)
    {
        events.Add(new CritTextEventDto(
            Text: ArenaConfig.CritTextLabel,
            TileX: tileX,
            TileY: tileY,
            StartAtMs: startAtMs,
            DurationMs: ArenaConfig.CritTextDurationMs));
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

        AddUltimateGauge(
            state,
            damageAppliedToPlayer * ArenaConfig.UltimateConfig.GaugePerDamageTaken);

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
                DurationMs: ArenaConfig.DeathBurstDurationMs,
                CreatedAtTick: state.Tick,
                EventId: NextTickEventId(state)));
            player.Shield = 0;
            EndRun(state, events, ArenaConfig.RunEndReasonDefeatDeath);
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

        var reflectedBase = (int)Math.Floor(incomingDamageAppliedToPlayer * (ArenaConfig.KinaReflectPercent / 100.0d));
        reflectedBase = Math.Max(1, reflectedBase);
        var reflectedDamage = reflectedBase;
        if (attacker.MobType is MobArchetype attackerArchetype && IsRangedArchetype(attackerArchetype))
        {
            reflectedDamage *= ArenaConfig.KinaRangedReflectMultiplier;
        }

        if (IsBuffActive(state, ArenaConfig.ThornsBoostBuffId))
        {
            reflectedDamage = ApplyPercentIncrease(reflectedDamage, ArenaConfig.ThornsBoostBonusPercent);
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
               string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassKina, StringComparison.Ordinal);
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
            DurationMs: ArenaConfig.DeathBurstDurationMs,
            CreatedAtTick: state.Tick,
            EventId: NextTickEventId(state)));
        AddCorpseDecal(state, mob);

        events.Add(new FxSpawnEventDto(
            FxId: ArenaConfig.HitSmallFxId,
            TileX: mob.TileX,
            TileY: mob.TileY,
            Layer: "hitFx",
            DurationMs: 620,
            Element: element));

        if (mob.MobSlotIndex is int slotIndex && state.MobSlots.TryGetValue(slotIndex, out var slot))
        {
            slot.RespawnRemainingMs = ArenaConfig.MobRespawnDelayMs;
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
        AddUltimateGauge(state, ArenaConfig.UltimateConfig.GaugePerKill);

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

        entry.NextChestAtKills += ComputeBestiaryThresholdIncrement(state);
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
            ApplyDeterministicSkillUpgradeForRunLevel(state);

            events.Add(new LevelUpEventDto(
                PreviousLevel: previousLevel,
                NewLevel: state.RunLevel,
                RunXp: state.RunXp,
                XpToNextLevel: GetXpToNextLevel(state.RunLevel)));

            TryOfferCardChoice(state, events, CardOfferSource.LevelUp);
        }
    }

    private enum CardOfferSource { LevelUp, Chest }

    private static void TryOfferCardChoice(StoredBattle state, List<BattleEventDto> events, CardOfferSource source)
    {
        if (state.PendingCardChoice is not null)
        {
            return;
        }

        if (state.CardSelectionsGranted >= ArenaConfig.MaxCardSelectionsPerRun)
        {
            return;
        }

        var offeredCards = RollCardOffer(state, source);
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
                .Select(card => ToCardOfferDto(state, card))
                .ToList()));
    }

    private static IReadOnlyList<CardDefinition> RollCardOffer(StoredBattle state, CardOfferSource source)
    {
        var availableCards = CardPool
            .OrderBy(card => card.Id, StringComparer.Ordinal)
            .Where(card => CanOfferCard(state, card, source))
            .ToList();
        if (availableCards.Count == 0)
        {
            return [];
        }

        var offerCount = Math.Min(ArenaConfig.MaxCardOfferCount, availableCards.Count);
        var offeredCards = new List<CardDefinition>(offerCount);
        for (var index = 0; index < offerCount; index += 1)
        {
            var rolledIndex = RollWeightedCardIndex(state, availableCards);
            offeredCards.Add(availableCards[rolledIndex]);
            availableCards.RemoveAt(rolledIndex);
        }

        return offeredCards;
    }

    private static bool CanOfferCard(StoredBattle state, CardDefinition card, CardOfferSource source)
    {
        _ = source;

        var currentStacks = GetCardStackCount(state, card.Id);
        if (currentStacks >= card.MaxStacks)
        {
            return false;
        }

        if (ExceedsDistinctPassiveCap(state, card))
        {
            return false;
        }

        return !IsCardBannedByCurrentLoadout(state, card.Id);
    }

    private static int RollWeightedCardIndex(StoredBattle state, IReadOnlyList<CardDefinition> availableCards)
    {
        var totalWeight = 0;
        foreach (var card in availableCards)
        {
            totalWeight += Math.Max(1, card.RarityWeight);
        }

        var roll = NextIntFromBattleRng(state, totalWeight);
        var runningWeight = 0;
        for (var index = 0; index < availableCards.Count; index += 1)
        {
            runningWeight += Math.Max(1, availableCards[index].RarityWeight);
            if (roll < runningWeight)
            {
                return index;
            }
        }

        return availableCards.Count - 1;
    }

    private static int GetCardStackCount(StoredBattle state, string cardId)
    {
        return state.SelectedCardStacks.TryGetValue(cardId, out var stacks)
            ? Math.Max(0, stacks)
            : 0;
    }

    private static bool ExceedsDistinctPassiveCap(StoredBattle state, CardDefinition card)
    {
        if (GetCardStackCount(state, card.Id) > 0) return false; // already owned, stacking OK
        var distinctPassiveCount = state.SelectedCardStacks
            .Count(kvp => kvp.Value > 0 && CardById.ContainsKey(kvp.Key));
        return distinctPassiveCount >= ArenaConfig.MaxDistinctPassiveCards;
    }

    private static bool IsCardBannedByCurrentLoadout(StoredBattle state, string cardId)
    {
        foreach (var (selectedCardId, stackCount) in state.SelectedCardStacks)
        {
            if (stackCount <= 0)
            {
                continue;
            }

            if (string.Equals(selectedCardId, cardId, StringComparison.Ordinal))
            {
                continue;
            }

            if (IncompatibleCardPairs.Contains(BuildCardPairKey(selectedCardId, cardId)))
            {
                return true;
            }
        }

        return false;
    }

    private static string BuildCardPairKey(string leftCardId, string rightCardId)
    {
        return StringComparer.Ordinal.Compare(leftCardId, rightCardId) <= 0
            ? $"{leftCardId}|{rightCardId}"
            : $"{rightCardId}|{leftCardId}";
    }

    private static CardEffectBundle ScaleCardEffectsForStack(CardDefinition card, int stackCount)
    {
        var safeStackCount = Math.Max(1, stackCount);
        var scalePercent = safeStackCount <= 1
            ? card.ScalingParams.BaseStackMultiplierPercent
            : card.ScalingParams.AdditionalStackMultiplierPercent;
        scalePercent = Math.Max(0, scalePercent);

        return new CardEffectBundle(
            FlatDamageBonus: ScaleStat(card.Effects.FlatDamageBonus, scalePercent),
            PercentDamageBonus: ScaleStat(card.Effects.PercentDamageBonus, scalePercent),
            PercentAttackSpeedBonus: ScaleStat(card.Effects.PercentAttackSpeedBonus, scalePercent),
            PercentMaxHpBonus: ScaleStat(card.Effects.PercentMaxHpBonus, scalePercent),
            FlatHpOnHit: ScaleStat(card.Effects.FlatHpOnHit, scalePercent),
            GlobalCooldownReductionPercent: ScaleStat(card.Effects.GlobalCooldownReductionPercent, scalePercent));
    }

    private static int ScaleStat(int baseValue, int scalePercent)
    {
        if (baseValue <= 0 || scalePercent <= 0)
        {
            return 0;
        }

        return (int)Math.Floor(baseValue * (scalePercent / 100.0d));
    }

    private static void ApplyCardEffects(StoredBattle state, StoredActor player, CardDefinition card, int nextStack)
    {
        var previousMaxHp = player.MaxHp;
        var scaledEffects = ScaleCardEffectsForStack(card, nextStack);

        state.PlayerModifiers.FlatDamageBonus += Math.Max(0, scaledEffects.FlatDamageBonus);
        state.PlayerModifiers.PercentDamageBonus += Math.Max(0, scaledEffects.PercentDamageBonus);
        state.PlayerModifiers.PercentAttackSpeedBonus += Math.Max(0, scaledEffects.PercentAttackSpeedBonus);
        state.PlayerModifiers.PercentMaxHpBonus += Math.Max(0, scaledEffects.PercentMaxHpBonus);
        state.PlayerModifiers.FlatHpOnHit += Math.Max(0, scaledEffects.FlatHpOnHit);
        state.PlayerModifiers.GlobalCooldownReductionPercent = Math.Clamp(
            state.PlayerModifiers.GlobalCooldownReductionPercent + Math.Max(0, scaledEffects.GlobalCooldownReductionPercent),
            0,
            ArenaConfig.MaxGlobalCooldownReductionPercent);

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

        return IsEliteMob(mob) ? ArenaConfig.EliteMobKillXp : ArenaConfig.NormalMobKillXp;
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
            remainingMs: ArenaConfig.CorpseDecalLifetimeMs,
            totalMs: ArenaConfig.CorpseDecalLifetimeMs,
            createdTick: state.Tick));
    }

    private static int ComputeLifeLeechHeal(int hpDamageApplied)
    {
        if (hpDamageApplied <= 0)
        {
            return 0;
        }

        return (int)Math.Floor(hpDamageApplied * (ArenaConfig.PlayerLifeLeechPercent / 100.0d));
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

    private static int ApplySelfHealSkill(StoredBattle state, List<BattleEventDto> events, StoredActor player, StoredSkill skill)
    {
        if (player.Hp <= 0)
        {
            return 0;
        }

        var maxHealAmount = ComputePercentValue(player.MaxHp, ResolveSkillHealPercent(skill));

        events.Add(new FxSpawnEventDto(
            FxId: ArenaConfig.HealFxId,
            TileX: player.TileX,
            TileY: player.TileY,
            Layer: "hitFx",
            DurationMs: 620,
            Element: ArenaConfig.HealElement));

        return ApplyPlayerHeal(state, events, player, maxHealAmount, "skill_heal");
    }

    private static int ApplyGuardSkill(List<BattleEventDto> events, StoredActor player, StoredSkill skill)
    {
        if (player.Hp <= 0 || player.MaxShield <= 0)
        {
            return 0;
        }

        var guardAmount = ComputePercentValue(player.MaxHp, ResolveSkillGuardPercent(skill));
        var previousShield = player.Shield;
        player.Shield = Math.Min(player.MaxShield, player.Shield + guardAmount);
        var appliedShield = Math.Max(0, player.Shield - previousShield);

        events.Add(new FxSpawnEventDto(
            FxId: ArenaConfig.GuardFxId,
            TileX: player.TileX,
            TileY: player.TileY,
            Layer: "hitFx",
            DurationMs: 620,
            Element: ArenaConfig.GuardElement));

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
        if (IsBuffActive(state, ArenaConfig.HealingAmplifierBuffId))
        {
            finalHealAmount += ComputeFloorPercentValue(player.MaxHp, ArenaConfig.HealAmplifierBonusPercent);
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
        return string.Equals(state.BattleStatus, ArenaConfig.StatusDefeat, StringComparison.Ordinal);
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
            EndRun(state, events, ArenaConfig.RunEndReasonDefeatDeath);
            return true;
        }

        var nowMs = GetElapsedMsForTick(state.Tick);
        if (nowMs >= ArenaConfig.RunDurationMs)
        {
            EndRun(state, events, ArenaConfig.RunEndReasonVictoryTime);
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

        var resolvedReason = string.Equals(runEndReason, ArenaConfig.RunEndReasonDefeatDeath, StringComparison.Ordinal)
            ? ArenaConfig.RunEndReasonDefeatDeath
            : ArenaConfig.RunEndReasonVictoryTime;
        var endedAtMs = GetElapsedMsForTick(state.Tick);
        state.IsRunEnded = true;
        state.RunEndReason = resolvedReason;
        state.RunEndedAtMs = endedAtMs;
        state.BattleStatus = string.Equals(resolvedReason, ArenaConfig.RunEndReasonDefeatDeath, StringComparison.Ordinal)
            ? ArenaConfig.StatusDefeat
            : ArenaConfig.StatusVictory;
        state.IsPaused = false;
        events?.Add(new RunEndedEventDto(
            Reason: resolvedReason,
            TimestampMs: endedAtMs));
    }

    private static bool IsStarted(StoredBattle state)
    {
        return string.Equals(state.BattleStatus, ArenaConfig.StatusStarted, StringComparison.Ordinal);
    }

    private static bool IsAdjacent(StoredActor left, StoredActor right)
    {
        var deltaX = Math.Abs(left.TileX - right.TileX);
        var deltaY = Math.Abs(left.TileY - right.TileY);
        return deltaX <= 1 && deltaY <= 1 && (deltaX != 0 || deltaY != 0);
    }

    private void TryAwardRunEndMasteryXp(StoredBattle state)
    {
        if (!state.IsRunEnded || state.MasteryXpAwardedAtRunEnd)
        {
            return;
        }

        state.MasteryXpAwardedAtRunEnd = true;
        if (_accountStateStore is null)
        {
            return;
        }

        var masteryXpAward = ArenaConfig.MasteryConfig.XpPerRunCompleted +
                             (Math.Max(0, state.TotalKills) * ArenaConfig.MasteryConfig.XpPerKill);
        if (masteryXpAward <= 0)
        {
            return;
        }

        try
        {
            _accountStateStore.AwardMasteryXp(
                accountId: DefaultAccountId,
                characterId: state.PlayerActorId,
                xpAmount: masteryXpAward);
        }
        catch
        {
            // Keep battle completion robust even if account progression sync fails.
        }
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

    private static bool IsEliteSlotIndex(int slotIndex)
    {
        return slotIndex is 7 or 10;
    }

    private static string GetSpeciesId(MobArchetype archetype)
    {
        if (SpeciesByArchetype.TryGetValue(archetype, out var species))
        {
            return species;
        }

        return archetype.ToString();
    }

    private static BattleCardOfferDto ToCardOfferDto(StoredBattle state, CardDefinition card)
    {
        var scaling = card.ScalingParams;
        return new BattleCardOfferDto(
            Id: card.Id,
            Name: card.Name,
            Description: card.Description,
            Tags: card.Tags.ToArray(),
            RarityWeight: card.RarityWeight,
            MaxStacks: card.MaxStacks,
            CurrentStacks: GetCardStackCount(state, card.Id),
            ScalingParams: new BattleCardScalingParamsDto(
                BaseStackMultiplierPercent: scaling.BaseStackMultiplierPercent,
                AdditionalStackMultiplierPercent: scaling.AdditionalStackMultiplierPercent));
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
            ArenaConfig.FacingUp =>
            [
                (playerX - 1, playerY - 1),
                (playerX, playerY - 1),
                (playerX + 1, playerY - 1)
            ],
            ArenaConfig.FacingDown =>
            [
                (playerX - 1, playerY + 1),
                (playerX, playerY + 1),
                (playerX + 1, playerY + 1)
            ],
            ArenaConfig.FacingLeft =>
            [
                (playerX - 1, playerY - 1),
                (playerX - 1, playerY),
                (playerX - 1, playerY + 1)
            ],
            ArenaConfig.FacingRight =>
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
        var normalizedFacing = NormalizeDirection(facingDirection) ?? ArenaConfig.FacingUp;
        return normalizedFacing switch
        {
            ArenaConfig.FacingUpRight => ArenaConfig.FacingRight,
            ArenaConfig.FacingDownRight => ArenaConfig.FacingRight,
            ArenaConfig.FacingUpLeft => ArenaConfig.FacingLeft,
            ArenaConfig.FacingDownLeft => ArenaConfig.FacingLeft,
            _ => normalizedFacing
        };
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

    [Conditional("DEBUG")]
    private static void AssertBattleInvariants(StoredBattle state)
    {
        ValidateInvariants(state);
    }

    [Conditional("DEBUG")]
    private static void ValidateInvariants(
        StoredBattle state,
        int? expectedTick = null,
        long? expectedNowMs = null)
    {
        if (expectedTick.HasValue && state.Tick != expectedTick.Value)
        {
            throw new InvalidOperationException(
                $"Step invariant failed: tick advanced unexpectedly from {expectedTick.Value} to {state.Tick}.");
        }

        var expectedElapsedMs = checked((long)state.Tick * StepDeltaMs);
        var nowMs = GetElapsedMsForTick(state.Tick);
        if (nowMs != expectedElapsedMs)
        {
            throw new InvalidOperationException(
                $"Simulation time is inconsistent: nowMs={nowMs}, tick={state.Tick}, expected={expectedElapsedMs}.");
        }

        if (expectedNowMs.HasValue && nowMs != expectedNowMs.Value)
        {
            throw new InvalidOperationException(
                $"Step invariant failed: time advanced unexpectedly from {expectedNowMs.Value} to {nowMs}.");
        }

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

            if (actor.Hp < 0)
            {
                throw new InvalidOperationException(
                    $"Actor '{actor.ActorId}' has invalid HP: {actor.Hp}.");
            }

            if (actor.Shield < 0)
            {
                throw new InvalidOperationException(
                    $"Actor '{actor.ActorId}' has invalid shield: {actor.Shield}.");
            }

            if (actor.MaxHp < 0)
            {
                throw new InvalidOperationException(
                    $"Actor '{actor.ActorId}' has invalid max HP: {actor.MaxHp}.");
            }

            if (actor.Hp > actor.MaxHp)
            {
                throw new InvalidOperationException(
                    $"Actor '{actor.ActorId}' has HP above max: hp={actor.Hp}, maxHp={actor.MaxHp}.");
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
            if (buffCount > ArenaConfig.EliteCommanderMaxBuffTargets)
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

        if (state.RunLevel < ArenaConfig.RunInitialLevel)
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

        foreach (var skill in state.Skills.Values.OrderBy(value => value.SkillId, StringComparer.Ordinal))
        {
            if (skill.Level < ArenaConfig.SkillInitialLevel)
            {
                throw new InvalidOperationException($"Skill level is invalid for '{skill.SkillId}': {skill.Level}.");
            }

            if (skill.CooldownRemainingMs < 0)
            {
                throw new InvalidOperationException(
                    $"Skill cooldown remaining is invalid for '{skill.SkillId}': {skill.CooldownRemainingMs}.");
            }

            var maxCooldown = ResolveSkillCooldownTotalMs(state, skill);
            if (skill.CooldownRemainingMs > maxCooldown)
            {
                throw new InvalidOperationException(
                    $"Skill cooldown remaining exceeds max for '{skill.SkillId}': remaining={skill.CooldownRemainingMs}, max={maxCooldown}.");
            }
        }

        if (state.TotalKills < 0 || state.EliteKills < 0 || state.ChestsOpened < 0)
        {
            throw new InvalidOperationException(
                $"Run summary counters are invalid: kills={state.TotalKills}, eliteKills={state.EliteKills}, chestsOpened={state.ChestsOpened}.");
        }

        if (state.UltimateGauge < 0 || state.UltimateGauge > ArenaConfig.UltimateConfig.GaugeMax)
        {
            throw new InvalidOperationException(
                $"Ultimate gauge is invalid: gauge={state.UltimateGauge}, max={ArenaConfig.UltimateConfig.GaugeMax}.");
        }

        var shouldBeReady = state.UltimateGauge >= ArenaConfig.UltimateConfig.GaugeMax;
        if (state.UltimateReady != shouldBeReady)
        {
            throw new InvalidOperationException(
                $"Ultimate ready flag is inconsistent: ready={state.UltimateReady}, gauge={state.UltimateGauge}.");
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

        if (state.CardSelectionsGranted < 0 || state.CardSelectionsGranted > ArenaConfig.MaxCardSelectionsPerRun)
        {
            throw new InvalidOperationException($"Card selection count is invalid: {state.CardSelectionsGranted}.");
        }

        if (state.NextCardChoiceSequence < 1)
        {
            throw new InvalidOperationException($"Next card choice sequence is invalid: {state.NextCardChoiceSequence}.");
        }

        var selectedCardIds = state.SelectedCardIds.ToList();
        foreach (var selectedCardId in selectedCardIds)
        {
            if (!CardById.ContainsKey(selectedCardId))
            {
                throw new InvalidOperationException($"Selected card id is invalid: '{selectedCardId}'.");
            }
        }

        foreach (var (selectedCardId, stackCount) in state.SelectedCardStacks)
        {
            if (!CardById.TryGetValue(selectedCardId, out var definition))
            {
                throw new InvalidOperationException($"Selected card stack id is invalid: '{selectedCardId}'.");
            }

            if (stackCount < 1 || stackCount > definition.MaxStacks)
            {
                throw new InvalidOperationException(
                    $"Selected card stack count is invalid for '{selectedCardId}': {stackCount}.");
            }

            var historyCount = selectedCardIds.Count(cardId =>
                string.Equals(cardId, selectedCardId, StringComparison.Ordinal));
            if (historyCount != stackCount)
            {
                throw new InvalidOperationException(
                    $"Selected card stack count does not match history for '{selectedCardId}': history={historyCount}, stacks={stackCount}.");
            }
        }

        var selectedCountByCard = selectedCardIds
            .GroupBy(cardId => cardId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        foreach (var (selectedCardId, selectedCount) in selectedCountByCard)
        {
            if (!CardById.TryGetValue(selectedCardId, out var definition))
            {
                throw new InvalidOperationException($"Selected card count id is invalid: '{selectedCardId}'.");
            }

            if (!state.SelectedCardStacks.TryGetValue(selectedCardId, out var stackCount))
            {
                throw new InvalidOperationException($"Missing selected card stack entry for '{selectedCardId}'.");
            }

            if (stackCount != selectedCount)
            {
                throw new InvalidOperationException(
                    $"Selected card history count does not match stack count for '{selectedCardId}': history={selectedCount}, stacks={stackCount}.");
            }

            if (selectedCount > definition.MaxStacks)
            {
                throw new InvalidOperationException(
                    $"Selected card history exceeds max stacks for '{selectedCardId}': history={selectedCount}, max={definition.MaxStacks}.");
            }
        }

        if (state.PendingCardChoice is not null)
        {
            if (string.IsNullOrWhiteSpace(state.PendingCardChoice.ChoiceId))
            {
                throw new InvalidOperationException("Pending card choice id is invalid.");
            }

            if (state.PendingCardChoice.OfferedCardIds.Count == 0 ||
                state.PendingCardChoice.OfferedCardIds.Count > ArenaConfig.MaxCardOfferCount)
            {
                throw new InvalidOperationException(
                    $"Pending card offer count is invalid: {state.PendingCardChoice.OfferedCardIds.Count}.");
            }

            if (state.PendingCardChoice.OfferedCardIds.Count !=
                state.PendingCardChoice.OfferedCardIds.Distinct(StringComparer.Ordinal).Count())
            {
                throw new InvalidOperationException("Pending card offer contains duplicate ids.");
            }

            foreach (var offeredCardId in state.PendingCardChoice.OfferedCardIds)
            {
                if (!CardById.TryGetValue(offeredCardId, out var offeredDefinition))
                {
                    throw new InvalidOperationException($"Pending offered card id is invalid: '{offeredCardId}'.");
                }

                var stackCount = GetCardStackCount(state, offeredCardId);
                if (stackCount >= offeredDefinition.MaxStacks)
                {
                    throw new InvalidOperationException(
                        $"Pending card offer contains a max-stacked card: '{offeredCardId}'.");
                }

                if (IsCardBannedByCurrentLoadout(state, offeredCardId))
                {
                    throw new InvalidOperationException(
                        $"Pending card offer contains an incompatible card: '{offeredCardId}'.");
                }
            }
        }

        if (state.PlayerModifiers.FlatDamageBonus < 0 ||
            state.PlayerModifiers.PercentDamageBonus < 0 ||
            state.PlayerModifiers.PercentAttackSpeedBonus < 0 ||
            state.PlayerModifiers.PercentMaxHpBonus < 0 ||
            state.PlayerModifiers.FlatHpOnHit < 0 ||
            state.PlayerModifiers.GlobalCooldownReductionPercent < 0 ||
            state.PlayerModifiers.GlobalCooldownReductionPercent > ArenaConfig.MaxGlobalCooldownReductionPercent)
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
            string.Equals(poi.Type, ArenaConfig.PoiTypeAltar, StringComparison.Ordinal) &&
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
            Dictionary<string, int> selectedCardStacks,
            int cardSelectionsGranted,
            int nextCardChoiceSequence,
            List<BattleReplayActionDto> replayActions,
            int ultimateGauge,
            bool ultimateReady,
            bool masteryXpAwardedAtRunEnd)
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
            SelectedCardStacks = selectedCardStacks;
            CardSelectionsGranted = cardSelectionsGranted;
            NextCardChoiceSequence = nextCardChoiceSequence;
            ReplayActions = replayActions;
            UltimateGauge = ultimateGauge;
            UltimateReady = ultimateReady;
            MasteryXpAwardedAtRunEnd = masteryXpAwardedAtRunEnd;
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

        public int ChestsSpawned { get; set; }

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

        public Dictionary<string, int> SelectedCardStacks { get; }

        public int CardSelectionsGranted { get; set; }

        public int NextCardChoiceSequence { get; set; }

        public List<BattleReplayActionDto> ReplayActions { get; }

        public int UltimateGauge { get; set; }

        public bool UltimateReady { get; set; }

        public bool MasteryXpAwardedAtRunEnd { get; set; }
    }

    private sealed record SpawnPacingDirector(
        int MaxAliveMobs,
        int EliteSpawnChancePercent);

    private sealed record ScalingDirectorV2(
        double NormalHpMult,
        double NormalDmgMult,
        double EliteHpMult,
        double EliteDmgMult,
        double LvlFactor,
        bool IsLvlFactorEnabled);

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
        IReadOnlyList<string> Tags,
        int RarityWeight,
        int MaxStacks,
        CardScalingParams ScalingParams,
        CardEffectBundle Effects);

    private sealed record CardScalingParams(
        int BaseStackMultiplierPercent = 100,
        int AdditionalStackMultiplierPercent = 100);

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
            FacingDirection = NormalizeDirection(facingDirection) ?? ArenaConfig.FacingUp;
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
        public StoredSkill(string skillId, int cooldownRemainingMs, int cooldownTotalMs, int level)
        {
            SkillId = skillId;
            CooldownRemainingMs = cooldownRemainingMs;
            CooldownTotalMs = cooldownTotalMs;
            Level = Math.Max(ArenaConfig.SkillInitialLevel, level);
        }

        public string SkillId { get; }

        public int CooldownRemainingMs { get; set; }

        public int CooldownTotalMs { get; }

        public int Level { get; set; }
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
            bool isEliteSlot,
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
            IsEliteSlot = isEliteSlot;
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

        public bool IsEliteSlot { get; }

        public int RespawnRemainingMs { get; set; }

        public int AttackCooldownRemainingMs { get; set; }

        public int AbilityCooldownRemainingMs { get; set; }

        public int MoveCooldownRemainingMs { get; set; }

        public int CommitTicksRemaining { get; set; }
    }
}

