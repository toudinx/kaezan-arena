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
    private static readonly MobArchetype[] SpawnArchetypeCycle =
    [
        MobArchetype.MeleeBrute,
        MobArchetype.RangedArcher,
        MobArchetype.MeleeDemon,
        MobArchetype.RangedShaman,
        MobArchetype.MeleeSkeleton,
        MobArchetype.MeleeWogol,
        MobArchetype.MeleeWarrior,
        MobArchetype.MeleeZombie,
        MobArchetype.MeleeTinyZombie,
        MobArchetype.RangedImp,
        MobArchetype.RangedSwampy,
        MobArchetype.RangedMuddy,
        MobArchetype.MeleeSlug
    ];
    private static readonly MobArchetype[] EliteCommanderPool =
    [
        MobArchetype.EliteMaskedOrc,
        MobArchetype.ElitePumpkinDude,
        MobArchetype.EliteDoc,
        MobArchetype.EliteIceZombie,
    ];
    // Offensive priority for the Assist: ExoriMas -> Exori -> ExoriMin.
    // Ultimate auto-cast is handled separately by the Ultimate gauge.
    // Heal and Guard are excluded — defensive survivability is now passive-card-only.
    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> FixedWeaponKitByPlayerClassId =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [ArenaConfig.PlayerClassMirai] =
                ArenaConfig.GetFixedWeaponKitForCharacterId(ArenaConfig.CharacterIds.Mirai),
            [ArenaConfig.PlayerClassSylwen] =
                ArenaConfig.GetFixedWeaponKitForCharacterId(ArenaConfig.CharacterIds.Sylwen),
            [ArenaConfig.PlayerClassVelvet] =
                ArenaConfig.GetFixedWeaponKitForCharacterId(ArenaConfig.CharacterIds.Velvet)
        };
    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> FixedSkillKitByPlayerClassId =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [ArenaConfig.PlayerClassMirai] =
            [
                ArenaConfig.Kits.Mirai.Skill1Id,
                ArenaConfig.Kits.Mirai.Skill2Id,
                ArenaConfig.Kits.Mirai.Skill3Id
            ],
            [ArenaConfig.PlayerClassSylwen] =
            [
                ArenaConfig.Kits.Sylwen.Skill1Id,
                ArenaConfig.Kits.Sylwen.Skill2Id,
                ArenaConfig.Kits.Sylwen.Skill3Id
            ],
            [ArenaConfig.PlayerClassVelvet] =
            [
                ArenaConfig.Kits.Velvet.Skill1Id,
                ArenaConfig.Kits.Velvet.Skill2Id,
                ArenaConfig.Kits.Velvet.Skill3Id
            ]
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
    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> AssistOffenseSkillPriorityByPlayerClassId =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [ArenaConfig.PlayerClassMirai] =
            [
                ArenaConfig.SkillIds.MiraiDreadSweep,
                ArenaConfig.SkillIds.MiraiGraveFang,
                ArenaConfig.SkillIds.MiraiRendPulse,
                ArenaConfig.SkillIds.MiraiCollapseField
            ],
            [ArenaConfig.PlayerClassSylwen] =
            [
                ArenaConfig.SkillIds.SylwenThornfall,
                ArenaConfig.SkillIds.SylwenGalePierce,
                ArenaConfig.SkillIds.SylwenWhisperShot,
                ArenaConfig.SkillIds.SylwenSilverTempest
            ],
            [ArenaConfig.PlayerClassVelvet] =
            [
                ArenaConfig.SkillIds.VelvetUmbralPath,
                ArenaConfig.SkillIds.VelvetDeathStrike,
                ArenaConfig.SkillIds.VelvetVoidChain,
                ArenaConfig.SkillIds.VelvetStormCollapse
            ]
        };
    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> RunLevelSkillUpgradeOrderByPlayerClassId =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [ArenaConfig.PlayerClassMirai] =
            [
                ArenaConfig.SkillIds.MiraiDreadSweep,
                ArenaConfig.SkillIds.MiraiGraveFang,
                ArenaConfig.SkillIds.MiraiRendPulse
            ],
            [ArenaConfig.PlayerClassSylwen] =
            [
                ArenaConfig.SkillIds.SylwenThornfall,
                ArenaConfig.SkillIds.SylwenGalePierce,
                ArenaConfig.SkillIds.SylwenWhisperShot
            ],
            [ArenaConfig.PlayerClassVelvet] =
            [
                ArenaConfig.SkillIds.VelvetUmbralPath,
                ArenaConfig.SkillIds.VelvetDeathStrike,
                ArenaConfig.SkillIds.VelvetVoidChain
            ]
        };
    private static readonly IReadOnlyDictionary<MobArchetype, string> SpeciesByArchetype =
        new Dictionary<MobArchetype, string>
        {
            [MobArchetype.MeleeBrute]        = ArenaConfig.SpeciesIds.MeleeBrute,
            [MobArchetype.RangedArcher]      = ArenaConfig.SpeciesIds.RangedArcher,
            [MobArchetype.MeleeDemon]        = ArenaConfig.SpeciesIds.MeleeDemon,
            [MobArchetype.RangedShaman]      = ArenaConfig.SpeciesIds.RangedShaman,
            [MobArchetype.MeleeSkeleton]     = ArenaConfig.SpeciesIds.MeleeSkeleton,
            [MobArchetype.MeleeWogol]        = ArenaConfig.SpeciesIds.MeleeWogol,
            [MobArchetype.MeleeWarrior]      = ArenaConfig.SpeciesIds.MeleeWarrior,
            [MobArchetype.MeleeZombie]       = ArenaConfig.SpeciesIds.MeleeZombie,
            [MobArchetype.MeleeTinyZombie]   = ArenaConfig.SpeciesIds.MeleeTinyZombie,
            [MobArchetype.RangedImp]         = ArenaConfig.SpeciesIds.RangedImp,
            [MobArchetype.RangedSwampy]      = ArenaConfig.SpeciesIds.RangedSwampy,
            [MobArchetype.RangedMuddy]       = ArenaConfig.SpeciesIds.RangedMuddy,
            [MobArchetype.MeleeSlug]         = ArenaConfig.SpeciesIds.MeleeSlug,
            [MobArchetype.EliteMaskedOrc]    = ArenaConfig.SpeciesIds.EliteMaskedOrc,
            [MobArchetype.ElitePumpkinDude]  = ArenaConfig.SpeciesIds.ElitePumpkinDude,
            [MobArchetype.EliteDoc]          = ArenaConfig.SpeciesIds.EliteDoc,
            [MobArchetype.EliteIceZombie]    = ArenaConfig.SpeciesIds.EliteIceZombie,
            [MobArchetype.Mimic]             = "mimic",
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
                AbilityFxId: ArenaConfig.MobCleaveFxId,
                AttackElement: ElementType.Physical,
                WeakTo: ElementType.Fire,
                ResistantTo: ElementType.Ice),
            [MobArchetype.RangedArcher] = new(
                MaxHp: ArenaConfig.RangedArcherMaxHp,
                MoveCooldownMs: ArenaConfig.RangedArcherMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.RangedArcherAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.RangedArcherAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.RangedArcherAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.RangedArcherAbilityDamage,
                AbilityRangeTiles: ArenaConfig.RangedArcherAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.RangedArcherAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobPowerShotFxId,
                AttackElement: ElementType.Physical,
                WeakTo: ElementType.Ice,
                ResistantTo: ElementType.Physical),
            [MobArchetype.MeleeDemon] = new(
                MaxHp: ArenaConfig.MeleeDemonMaxHp,
                MoveCooldownMs: ArenaConfig.MeleeDemonMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.MeleeDemonAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.MeleeDemonAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.MeleeDemonAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.MeleeDemonAbilityDamage,
                AbilityRangeTiles: ArenaConfig.MeleeDemonAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.MeleeDemonAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobDemonBeamFxId,
                AttackElement: ElementType.Fire,
                WeakTo: ElementType.Ice,
                ResistantTo: ElementType.Fire),
            [MobArchetype.RangedShaman] = new(
                MaxHp: ArenaConfig.RangedShamanMaxHp,
                MoveCooldownMs: ArenaConfig.RangedShamanMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.RangedShamanAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.RangedShamanAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.RangedShamanAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.RangedShamanAbilityDamage,
                AbilityRangeTiles: ArenaConfig.RangedShamanAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.RangedShamanAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobShamanStormPulseFxId,
                AttackElement: ElementType.Energy,
                WeakTo: ElementType.Physical,
                ResistantTo: ElementType.Energy),
            [MobArchetype.MeleeSkeleton] = new(
                MaxHp: ArenaConfig.MeleeSkeletonMaxHp,
                MoveCooldownMs: ArenaConfig.MeleeSkeletonMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.MeleeSkeletonAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.MeleeSkeletonAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.MeleeSkeletonAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.MeleeSkeletonAbilityDamage,
                AbilityRangeTiles: ArenaConfig.MeleeSkeletonAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.MeleeSkeletonAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobSkeletonSoulBurstFxId,
                AttackElement: ElementType.Physical,
                WeakTo: ElementType.Fire,
                ResistantTo: ElementType.Ice),
            [MobArchetype.MeleeWogol] = new(
                MaxHp: ArenaConfig.MeleeWogolMaxHp,
                MoveCooldownMs: ArenaConfig.MeleeWogolMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.MeleeWogolAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.MeleeWogolAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.MeleeWogolAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.MeleeWogolAbilityDamage,
                AbilityRangeTiles: ArenaConfig.MeleeWogolAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.MeleeWogolAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobWogolGroundSlamFxId,
                AttackElement: ElementType.Physical,
                WeakTo: ElementType.Energy,
                ResistantTo: ElementType.Physical),
            [MobArchetype.MeleeWarrior] = new(
                MaxHp: ArenaConfig.MeleeWarriorMaxHp,
                MoveCooldownMs: ArenaConfig.MeleeWarriorMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.MeleeWarriorAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.MeleeWarriorAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.MeleeWarriorAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.MeleeWarriorAbilityDamage,
                AbilityRangeTiles: ArenaConfig.MeleeWarriorAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.MeleeWarriorAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobWarriorCleaveFxId,
                AttackElement: ElementType.Physical,
                WeakTo: ElementType.Ice,
                ResistantTo: ElementType.Physical),
            [MobArchetype.MeleeZombie] = new(
                MaxHp: ArenaConfig.MeleeZombieMaxHp,
                MoveCooldownMs: ArenaConfig.MeleeZombieMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.MeleeZombieAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.MeleeZombieAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.MeleeZombieAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.MeleeZombieAbilityDamage,
                AbilityRangeTiles: ArenaConfig.MeleeZombieAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.MeleeZombieAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobZombieSelfHealFxId,
                AttackElement: ElementType.Physical,
                WeakTo: ElementType.Fire,
                ResistantTo: ElementType.Ice),
            [MobArchetype.MeleeTinyZombie] = new(
                MaxHp: ArenaConfig.MeleeTinyZombieMaxHp,
                MoveCooldownMs: ArenaConfig.MeleeTinyZombieMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.MeleeTinyZombieAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.MeleeTinyZombieAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.MeleeTinyZombieAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.MeleeTinyZombieAbilityDamage,
                AbilityRangeTiles: ArenaConfig.MeleeTinyZombieAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.MeleeTinyZombieAbilityCooldownMs,
                AbilityFxId: "",
                AttackElement: ElementType.Physical,
                WeakTo: ElementType.Fire,
                ResistantTo: ElementType.Ice),
            [MobArchetype.RangedImp] = new(
                MaxHp: ArenaConfig.RangedImpMaxHp,
                MoveCooldownMs: ArenaConfig.RangedImpMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.RangedImpAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.RangedImpAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.RangedImpAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.RangedImpAbilityDamage,
                AbilityRangeTiles: ArenaConfig.RangedImpAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.RangedImpAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobImpFireballFxId,
                AttackElement: ElementType.Fire,
                WeakTo: ElementType.Ice,
                ResistantTo: ElementType.Fire),
            [MobArchetype.RangedSwampy] = new(
                MaxHp: ArenaConfig.RangedSwampyMaxHp,
                MoveCooldownMs: ArenaConfig.RangedSwampyMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.RangedSwampyAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.RangedSwampyAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.RangedSwampyAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.RangedSwampyAbilityDamage,
                AbilityRangeTiles: ArenaConfig.RangedSwampyAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.RangedSwampyAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobSwampyMudLobFxId,
                AttackElement: ElementType.Earth,
                WeakTo: ElementType.Fire,
                ResistantTo: ElementType.Earth),
            [MobArchetype.RangedMuddy] = new(
                MaxHp: ArenaConfig.RangedMuddyMaxHp,
                MoveCooldownMs: ArenaConfig.RangedMuddyMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.RangedMuddyAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.RangedMuddyAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.RangedMuddyAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.RangedMuddyAbilityDamage,
                AbilityRangeTiles: ArenaConfig.RangedMuddyAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.RangedMuddyAbilityCooldownMs,
                AbilityFxId: ArenaConfig.MobMuddyOozeShotFxId,
                AttackElement: ElementType.Earth,
                WeakTo: ElementType.Fire,
                ResistantTo: ElementType.Earth),
            [MobArchetype.MeleeSlug] = new(
                MaxHp: ArenaConfig.MeleeSlugMaxHp,
                MoveCooldownMs: ArenaConfig.MeleeSlugMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.MeleeSlugAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.MeleeSlugAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.MeleeSlugAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.MeleeSlugAbilityDamage,
                AbilityRangeTiles: ArenaConfig.MeleeSlugAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.MeleeSlugAbilityCooldownMs,
                AbilityFxId: "",
                AttackElement: ElementType.Earth,
                WeakTo: ElementType.Fire,
                ResistantTo: ElementType.Earth),
            [MobArchetype.EliteMaskedOrc] = new(
                MaxHp: ArenaConfig.EliteMaskedOrcMaxHp,
                MoveCooldownMs: ArenaConfig.EliteMaskedOrcMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.EliteMaskedOrcAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.EliteMaskedOrcAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.EliteMaskedOrcAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.EliteMaskedOrcAbilityDamage,
                AbilityRangeTiles: ArenaConfig.EliteMaskedOrcAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.EliteMaskedOrcAbilityCooldownMs,
                AbilityFxId: "",
                AttackElement: ElementType.Physical,
                WeakTo: ElementType.Ice,
                ResistantTo: ElementType.Physical,
                IsEliteCommander: true),
            [MobArchetype.ElitePumpkinDude] = new(
                MaxHp: ArenaConfig.ElitePumpkinDudeMaxHp,
                MoveCooldownMs: ArenaConfig.ElitePumpkinDudeMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.ElitePumpkinDudeAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.ElitePumpkinDudeAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.ElitePumpkinDudeAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.ElitePumpkinDudeAbilityDamage,
                AbilityRangeTiles: ArenaConfig.ElitePumpkinDudeAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.ElitePumpkinDudeAbilityCooldownMs,
                AbilityFxId: "",
                AttackElement: ElementType.Fire,
                WeakTo: ElementType.Ice,
                ResistantTo: ElementType.Earth,
                IsEliteCommander: true),
            [MobArchetype.EliteDoc] = new(
                MaxHp: ArenaConfig.EliteDocMaxHp,
                MoveCooldownMs: ArenaConfig.EliteDocMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.EliteDocAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.EliteDocAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.EliteDocAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.EliteDocAbilityDamage,
                AbilityRangeTiles: ArenaConfig.EliteDocAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.EliteDocAbilityCooldownMs,
                AbilityFxId: "",
                AttackElement: ElementType.Earth,
                WeakTo: ElementType.Fire,
                ResistantTo: ElementType.Physical,
                IsEliteCommander: true),
            [MobArchetype.EliteIceZombie] = new(
                MaxHp: ArenaConfig.EliteIceZombieMaxHp,
                MoveCooldownMs: ArenaConfig.EliteIceZombieMoveCooldownMs,
                AutoAttackRangeTiles: ArenaConfig.EliteIceZombieAutoAttackRangeTiles,
                AutoAttackDamage: ArenaConfig.EliteIceZombieAutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.EliteIceZombieAutoAttackCooldownMs,
                AbilityDamage: ArenaConfig.EliteIceZombieAbilityDamage,
                AbilityRangeTiles: ArenaConfig.EliteIceZombieAbilityRangeTiles,
                AbilityCooldownMs: ArenaConfig.EliteIceZombieAbilityCooldownMs,
                AbilityFxId: "",
                AttackElement: ElementType.Ice,
                WeakTo: ElementType.Energy,
                ResistantTo: ElementType.Fire,
                IsEliteCommander: true),
            [MobArchetype.Mimic] = new(
                MaxHp: ArenaConfig.MimicConfig.Hp,
                MoveCooldownMs: 0,
                AutoAttackRangeTiles: 1,
                AutoAttackDamage: ArenaConfig.MimicConfig.AutoAttackDamage,
                AutoAttackCooldownMs: ArenaConfig.MimicConfig.AutoAttackCooldownMs,
                AbilityDamage: 0,
                AbilityRangeTiles: 0,
                AbilityCooldownMs: 0,
                AbilityFxId: "",
                AttackElement: ElementType.Physical,
                WeakTo: ElementType.Physical,
                ResistantTo: ElementType.Physical),
        };
    private static readonly IReadOnlyDictionary<MobArchetype, IMobBehavior> MobBehaviors =
        new Dictionary<MobArchetype, IMobBehavior>
        {
            [MobArchetype.MeleeBrute]      = new MeleeBruteBehavior(),
            [MobArchetype.RangedArcher]    = new RangedArcherBehavior(),
            [MobArchetype.MeleeDemon]      = new MeleeDemonBehavior(),
            [MobArchetype.RangedShaman]    = new RangedShamanBehavior(),
            [MobArchetype.MeleeSkeleton]   = new MeleeSkeletonBehavior(),
            [MobArchetype.MeleeWogol]      = new MeleeWogolBehavior(),
            [MobArchetype.MeleeWarrior]    = new MeleeWarriorBehavior(),
            [MobArchetype.MeleeZombie]     = new MeleeZombieBehavior(),
            [MobArchetype.MeleeTinyZombie] = new MeleeTinyZombieBehavior(),
            [MobArchetype.RangedImp]       = new RangedImpBehavior(),
            [MobArchetype.RangedSwampy]    = new RangedSwampyBehavior(),
            [MobArchetype.RangedMuddy]     = new RangedMuddyBehavior(),
            [MobArchetype.MeleeSlug]         = new MeleeSlugBehavior(),
            [MobArchetype.EliteMaskedOrc]    = new EliteGreedyMeleeBehavior(),
            [MobArchetype.ElitePumpkinDude]  = new EliteGreedyMeleeBehavior(),
            [MobArchetype.EliteDoc]          = new EliteGreedyMeleeBehavior(),
            [MobArchetype.EliteIceZombie]    = new EliteGreedyMeleeBehavior(),
        };

    public InMemoryBattleStore(int? stepDeltaMs = null, IAccountStateStore? accountStateStore = null)
    {
        StepDeltaMs = ArenaConfig.NormalizeStepDeltaMs(stepDeltaMs);
        _accountStateStore = accountStateStore;
    }

    public BattleSnapshot StartBattle(string arenaId, string playerId, int? seed, int zoneIndex = 1)
    {
        var normalizedArena = string.IsNullOrWhiteSpace(arenaId) ? "arena" : arenaId.Trim();
        var normalizedPlayer = string.IsNullOrWhiteSpace(playerId) ? "player" : playerId.Trim();
        var normalizedZoneIndex = Math.Clamp(zoneIndex, 1, ArenaConfig.ZoneConfig.ZoneCount);
        var battleIndex = Interlocked.Increment(ref _sequence);
        var battleId = $"battle-v1-{battleIndex:D4}";
        var resolvedSeed = seed ?? GenerateSeed(battleIndex);
        var battleRng = new Random(resolvedSeed);
        var poiRng = new Random(GeneratePoiSeed(resolvedSeed));
        var bestiaryRng = new Random(GenerateBestiarySeed(resolvedSeed));
        var critRng = new Random(GenerateCritSeed(resolvedSeed));
        var mobSlots = BuildMobSlots(resolvedSeed);
        var bestiary = BuildInitialBestiaryEntries(mobSlots, bestiaryRng);
        var resolvedPlayerClassId = ResolvePlayerClassId(normalizedPlayer);
        var elementalArenaDef = ArenaConfig.ElementalArenaConfig.TryResolveArena(normalizedArena);
        var arenaType = elementalArenaDef is not null ? ArenaType.Elemental : ArenaType.Standard;
        var dailyElement = ArenaConfig.ElementalConfig.ResolveDailyElement(DateOnly.FromDateTime(DateTime.UtcNow));

        var state = new StoredBattle(
            battleId: battleId,
            arenaId: normalizedArena,
            playerActorId: normalizedPlayer,
            playerClassId: resolvedPlayerClassId,
            arenaType: arenaType,
            elementalArenaDef: elementalArenaDef,
            dailyElement: dailyElement,
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
            zoneIndex: normalizedZoneIndex,
            ultimateGauge: 0,
            ultimateReady: false,
            silverTempestActive: false,
            silverTempestRemainingMs: 0,
            pendingWhisperShotHits: [],
            masteryXpAwardedAtRunEnd: false);

        ApplySigilPassiveModifiersAtBattleStart(state);

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

    private static ArenaType ResolveArenaType(string arenaId)
    {
        return ArenaConfig.ElementalArenaConfig.TryResolveArena(arenaId) is not null
            ? ArenaType.Elemental
            : ArenaType.Standard;
    }

    private static bool ShouldApplyElementBonus(StoredBattle state, ElementType naturalMobElement)
    {
        return state.ArenaType switch
        {
            ArenaType.Standard  => naturalMobElement == state.DailyElement,
            ArenaType.Elemental => state.ElementalArenaDef is not null && naturalMobElement == state.ElementalArenaDef.ForcedElement,
            _                   => false
        };
    }

    public bool TryGetBattleElementalArenaDef(string battleId, out ArenaConfig.ElementalArenaConfig.ElementalArenaDef? def)
    {
        def = null;
        if (string.IsNullOrWhiteSpace(battleId) || !_battles.TryGetValue(battleId.Trim(), out var state))
        {
            return false;
        }

        lock (state.Sync)
        {
            def = state.ElementalArenaDef;
            return true;
        }
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
        TickSilverTempestDuration(state);
        TickPendingWhisperShotHits(state, events);
        TickMobCombatCooldowns(state);
        TickMobImmobilizeDurations(state);
        TickPois(state, events);
        TickBuffs(state);
        MaintainEliteCommanderBuffs(state, events);
        TickEliteDocRegen(state, events);

        var pendingLifeLeechHeal = 0;
        var hasExplicitFacingCommand = false;
        var preAppliedCommandResults = preAppliedPauseResults;
        TickMobMovement(state);
        TickMobCommitWindows(state);
        TickDecals(state, events);
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

        if (!IsDefeat(state))
        {
            TickMimicCombat(state, events);
        }

        if (!IsDefeat(state))
        {
            TickBossSystem(state, events);
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

    private static Dictionary<int, MobSlotState> BuildMobSlots(int battleSeed)
    {
        var shuffleRng = new Random(battleSeed);
        var shuffled = SpawnArchetypeCycle
            .OrderBy(_ => shuffleRng.Next())
            .ToArray();

        var slots = new Dictionary<int, MobSlotState>();
        for (var slotIndex = 1; slotIndex <= ArenaConfig.MaxAliveMobs; slotIndex += 1)
        {
            var archetype = shuffled[(slotIndex - 1) % shuffled.Length];
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
        for (var index = ArenaConfig.BestiaryConfig.RankKillThresholds.Length - 1; index >= 0; index -= 1)
        {
            if (clampedKills < ArenaConfig.BestiaryConfig.RankKillThresholds[index])
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
        if (string.Equals(playerActorId, ArenaConfig.CharacterIds.Mirai, StringComparison.Ordinal))
        {
            return ArenaConfig.PlayerClassMirai;
        }

        if (string.Equals(playerActorId, ArenaConfig.CharacterIds.Sylwen, StringComparison.Ordinal))
        {
            return ArenaConfig.PlayerClassSylwen;
        }

        if (string.Equals(playerActorId, ArenaConfig.CharacterIds.Velvet, StringComparison.Ordinal))
        {
            return ArenaConfig.PlayerClassVelvet;
        }

        return ArenaConfig.PlayerClassMirai;
    }

    private void ApplySigilPassiveModifiersAtBattleStart(StoredBattle state)
    {
        if (_accountStateStore is null)
        {
            return;
        }

        AccountState accountState;
        try
        {
            accountState = _accountStateStore.GetAccountState(DefaultAccountId);
        }
        catch
        {
            return;
        }

        if (!accountState.Characters.TryGetValue(state.PlayerActorId, out var character))
        {
            return;
        }

        var aggregatedModifiers = ResolveSigilPassiveModifiersForCharacter(accountState, character);
        state.PlayerModifiers.FlatDamageBonus += Math.Max(0, aggregatedModifiers.FlatDamageBonus);
        state.PlayerModifiers.PercentDamageBonus += Math.Max(0, aggregatedModifiers.PercentDamageBonus);
        state.PlayerModifiers.PercentMaxHpBonus += Math.Max(0, aggregatedModifiers.PercentMaxHpBonus);
        state.PlayerModifiers.CritChanceBonusPercent = Math.Clamp(
            state.PlayerModifiers.CritChanceBonusPercent + Math.Max(0, aggregatedModifiers.CritChanceBonusPercent),
            0,
            ArenaConfig.SigilConfig.MaxAdditionalCritChancePercent);
        state.PlayerModifiers.CritDamageBonusPercent = Math.Clamp(
            state.PlayerModifiers.CritDamageBonusPercent + Math.Max(0, aggregatedModifiers.CritDamageBonusPercent),
            0,
            ArenaConfig.SigilConfig.MaxAdditionalCritDamagePercent);
        state.PlayerModifiers.LifeLeechBonusPercent = Math.Clamp(
            state.PlayerModifiers.LifeLeechBonusPercent + Math.Max(0, aggregatedModifiers.LifeLeechBonusPercent),
            0,
            ArenaConfig.SigilConfig.MaxAdditionalLifeLeechPercent);
        state.PlayerModifiers.GlobalCooldownReductionPercent = Math.Clamp(
            state.PlayerModifiers.GlobalCooldownReductionPercent + Math.Max(0, aggregatedModifiers.GlobalCooldownReductionPercent),
            0,
            ArenaConfig.MaxGlobalCooldownReductionPercent);

        var player = GetPlayerActor(state);
        if (player is null)
        {
            return;
        }

        var resolvedMaxHp = ResolvePlayerMaxHp(state);
        player.MaxHp = resolvedMaxHp;
        player.Hp = resolvedMaxHp;
        player.MaxShield = ComputePlayerMaxShield(resolvedMaxHp);
        player.Shield = Math.Min(player.Shield, player.MaxShield);

        // Apply weapon enchantments from the equipped weapon
        var equippedWeaponInstanceId = character.Equipment.WeaponInstanceId;
        if (!string.IsNullOrWhiteSpace(equippedWeaponInstanceId) &&
            character.Inventory.EquipmentInstances.TryGetValue(equippedWeaponInstanceId, out var equippedWeapon))
        {
            if (equippedWeapon.DamageElementEnchant.HasValue)
            {
                state.EquippedWeaponElement = equippedWeapon.DamageElementEnchant.Value;
            }

            if (equippedWeapon.ResistanceElementEnchant.HasValue)
            {
                state.EquippedWeaponResistanceElement = equippedWeapon.ResistanceElementEnchant.Value;
            }
        }
    }

    private static ArenaConfig.SigilConfig.SigilPassiveStatBundle ResolveSigilPassiveModifiersForCharacter(
        AccountState accountState,
        CharacterState character)
    {
        var flatDamageBonus = 0;
        var percentDamageBonus = 0;
        var percentMaxHpBonus = 0;
        var critChanceBonusPercent = 0;
        var critDamageBonusPercent = 0;
        var lifeLeechBonusPercent = 0;
        var globalCooldownReductionPercent = 0;

        for (var slotIndex = 1; slotIndex <= ArenaConfig.SigilConfig.SlotLevelRanges.Length; slotIndex += 1)
        {
            var sigilInstanceId = character.SigilLoadout.GetSlotInstanceId(slotIndex);
            if (string.IsNullOrWhiteSpace(sigilInstanceId))
            {
                continue;
            }

            if (slotIndex > 1 &&
                string.IsNullOrWhiteSpace(character.SigilLoadout.GetSlotInstanceId(slotIndex - 1)))
            {
                continue;
            }

            if (!accountState.SigilInventory.TryGetValue(sigilInstanceId, out var sigil))
            {
                continue;
            }

            if (sigil.IsLocked)
            {
                continue;
            }

            if (sigil.SlotIndex != slotIndex)
            {
                continue;
            }

            if (sigil.RequiresAscendantUnlock && !IsAscendantTierUnlocked(character, slotIndex))
            {
                continue;
            }

            int expectedSlotIndex;
            try
            {
                expectedSlotIndex = SigilSlotResolver.ResolveSlotIndexForLevel(sigil.SigilLevel);
            }
            catch
            {
                continue;
            }

            if (expectedSlotIndex != slotIndex)
            {
                continue;
            }

            var passiveStatBundle = ArenaConfig.SigilConfig.ResolvePassiveStatBundle(
                ResolveSigilDefinitionId(sigil),
                sigil.SigilLevel);
            flatDamageBonus += Math.Max(0, passiveStatBundle.FlatDamageBonus);
            percentDamageBonus += Math.Max(0, passiveStatBundle.PercentDamageBonus);
            percentMaxHpBonus += Math.Max(0, passiveStatBundle.PercentMaxHpBonus);
            critChanceBonusPercent += Math.Max(0, passiveStatBundle.CritChanceBonusPercent);
            critDamageBonusPercent += Math.Max(0, passiveStatBundle.CritDamageBonusPercent);
            lifeLeechBonusPercent += Math.Max(0, passiveStatBundle.LifeLeechBonusPercent);
            globalCooldownReductionPercent += Math.Max(0, passiveStatBundle.GlobalCooldownReductionPercent);
        }

        return new ArenaConfig.SigilConfig.SigilPassiveStatBundle(
            FlatDamageBonus: flatDamageBonus,
            PercentDamageBonus: percentDamageBonus,
            PercentMaxHpBonus: percentMaxHpBonus,
            CritChanceBonusPercent: Math.Clamp(
                critChanceBonusPercent,
                0,
                ArenaConfig.SigilConfig.MaxAdditionalCritChancePercent),
            CritDamageBonusPercent: Math.Clamp(
                critDamageBonusPercent,
                0,
                ArenaConfig.SigilConfig.MaxAdditionalCritDamagePercent),
            LifeLeechBonusPercent: Math.Clamp(
                lifeLeechBonusPercent,
                0,
                ArenaConfig.SigilConfig.MaxAdditionalLifeLeechPercent),
            GlobalCooldownReductionPercent: Math.Clamp(
                globalCooldownReductionPercent,
                0,
                ArenaConfig.MaxGlobalCooldownReductionPercent));
    }

    private static bool IsAscendantTierUnlocked(CharacterState character, int slotIndex)
    {
        var tierIndex = slotIndex - 1;
        return character.AscendantSigilSlotsUnlocked.TryGetValue(tierIndex, out var unlocked) && unlocked;
    }

    private static string ResolveSigilDefinitionId(SigilInstance sigil)
    {
        if (!string.IsNullOrWhiteSpace(sigil.DefinitionId))
        {
            return sigil.DefinitionId;
        }

        return ArenaConfig.SigilConfig.ResolveDefinitionIdForSpeciesId(sigil.SpeciesId);
    }

    private static IReadOnlyList<string> ResolveFixedWeaponKitForPlayerClass(string playerClassId)
    {
        if (FixedWeaponKitByPlayerClassId.TryGetValue(playerClassId, out var fixedWeaponKit))
        {
            return fixedWeaponKit;
        }

        return FixedWeaponKitByPlayerClassId[ArenaConfig.PlayerClassMirai];
    }

    private static IReadOnlyList<string> ResolveFixedSkillIdsForPlayerClass(string playerClassId)
    {
        if (FixedSkillKitByPlayerClassId.TryGetValue(playerClassId, out var fixedSkillKit))
        {
            return fixedSkillKit;
        }

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
        if (AssistOffenseSkillPriorityByPlayerClassId.TryGetValue(state.PlayerClassId, out var explicitPriority))
        {
            return explicitPriority;
        }

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

        return RunLevelSkillUpgradeOrderByPlayerClassId[ArenaConfig.PlayerClassMirai];
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
        if (ShouldBypassPlayerGlobalCooldown(state))
        {
            return 0;
        }

        var reductionPercent = ResolveCardGlobalCooldownReductionPercent(state);
        return Math.Max(1, ApplyPercentReduction(ArenaConfig.PlayerGlobalCooldownMs, reductionPercent));
    }

    private static int ResolvePlayerCriticalHitChancePercent(StoredBattle state)
    {
        return Math.Clamp(
            ArenaConfig.CriticalHitChancePercent + Math.Clamp(
                state.PlayerModifiers.CritChanceBonusPercent,
                0,
                ArenaConfig.SigilConfig.MaxAdditionalCritChancePercent),
            0,
            100);
    }

    private static int ResolvePlayerCriticalDamageBonusPercent(StoredBattle state)
    {
        return Math.Clamp(
            state.PlayerModifiers.CritDamageBonusPercent,
            0,
            ArenaConfig.SigilConfig.MaxAdditionalCritDamagePercent);
    }

    private static int ResolvePlayerLifeLeechPercent(StoredBattle state)
    {
        return Math.Clamp(
            ArenaConfig.PlayerLifeLeechPercent + Math.Clamp(
                state.PlayerModifiers.LifeLeechBonusPercent,
                0,
                ArenaConfig.SigilConfig.MaxAdditionalLifeLeechPercent),
            0,
            100);
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
                var previousLockedTargetId = state.LockedTargetEntityId;
                var normalizedTargetId = string.IsNullOrWhiteSpace(command.TargetEntityId)
                    ? null
                    : command.TargetEntityId.Trim();

                if (normalizedTargetId is null)
                {
                    TryResetMobFocusOnLockedTargetSwitch(state, events, previousLockedTargetId, null);
                    state.LockedTargetEntityId = null;
                    commandResults.Add(new CommandResultDto(index, commandType, true, null));
                    continue;
                }

                if (!state.Actors.TryGetValue(normalizedTargetId, out var lockedTarget) ||
                    !string.Equals(lockedTarget.Kind, "mob", StringComparison.Ordinal))
                {
                    // Invalid lock requests are normalized into a deterministic clear lock.
                    TryResetMobFocusOnLockedTargetSwitch(state, events, previousLockedTargetId, null);
                    state.LockedTargetEntityId = null;
                    commandResults.Add(new CommandResultDto(index, commandType, true, null));
                    continue;
                }

                TryResetMobFocusOnLockedTargetSwitch(state, events, previousLockedTargetId, normalizedTargetId);
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

            var activeUltimateSkillId = ResolveActiveUltimateSkillId(state);
            if (!string.IsNullOrEmpty(activeUltimateSkillId) &&
                string.Equals(normalizedSkillId, activeUltimateSkillId, StringComparison.Ordinal))
            {
                // Manual ultimate casts route through TryFireUltimate and silently skip when gauge is not full.
                if (state.UltimateGauge >= ArenaConfig.UltimateConfig.GaugeMax)
                {
                    var player = GetPlayerActor(state);
                    if (player is not null)
                    {
                        _ = TryFireUltimate(state, events, player, ref pendingLifeLeechHeal);
                    }
                }

                commandResults.Add(new CommandResultDto(index, commandType, true, null));
                continue;
            }

            var castResult = TryExecutePlayerSkillCast(state, events, normalizedSkillId, ref pendingLifeLeechHeal);
            commandResults.Add(new CommandResultDto(index, commandType, castResult.Success, castResult.Reason));
        }

        return commandResults;
    }

    private static void TryResetMobFocusOnLockedTargetSwitch(
        StoredBattle state,
        List<BattleEventDto> events,
        string? previousLockedTargetId,
        string? newLockedTargetId)
    {
        if (string.IsNullOrWhiteSpace(previousLockedTargetId) ||
            string.Equals(previousLockedTargetId, newLockedTargetId, StringComparison.Ordinal))
        {
            return;
        }

        if (!state.Actors.TryGetValue(previousLockedTargetId, out var previousLockedTarget) ||
            !string.Equals(previousLockedTarget.Kind, "mob", StringComparison.Ordinal))
        {
            return;
        }

        previousLockedTarget.FocusStacks = 0;
        previousLockedTarget.DeadeyeConsecutiveHits = 0;
        events.Add(new FocusResetEventDto(MobId: previousLockedTargetId));
    }

    private static string? ResolveActiveUltimateSkillId(StoredBattle state)
    {
        if (string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassMirai, StringComparison.Ordinal))
        {
            return ArenaConfig.SkillIds.MiraiCollapseField;
        }

        if (string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassSylwen, StringComparison.Ordinal))
        {
            return ArenaConfig.SkillIds.SylwenSilverTempest;
        }

        if (string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassVelvet, StringComparison.Ordinal))
        {
            return ArenaConfig.SkillIds.VelvetStormCollapse;
        }

        return null;
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

        if (state.PlayerGlobalCooldownRemainingMs > 0 && !ShouldBypassPlayerGlobalCooldown(state))
        {
            return SkillCastResult.Fail(ArenaConfig.GlobalCooldownReason);
        }

        var player = GetPlayerActor(state);
        if (player is null)
        {
            return SkillCastResult.Fail(ArenaConfig.NoTargetReason);
        }

        var explicitDispatchResult = TryDispatchExplicitSkillCases(
            state,
            events,
            normalizedSkillId,
            player,
            skill);
        if (explicitDispatchResult.HasValue)
        {
            return explicitDispatchResult.Value;
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

        if (string.Equals(normalizedSkillId, ArenaConfig.SkillIds.MiraiRendPulse, StringComparison.Ordinal))
        {
            var hitAnyTarget = ApplyAreaSquareSkill(
                state,
                events,
                player,
                radius: ArenaConfig.SkillConfig.MiraiRendPulseRadius,
                damage: ArenaConfig.SkillConfig.MiraiRendPulseDamage,
                fxId: ArenaConfig.HitSmallFxId,
                element: GetPlayerBaseElement(state),
                ref pendingLifeLeechHeal,
                postModifierFlatDamageBonusResolver: ResolveMiraiSunderBrandBonusDamage,
                onSuccessfulHit: hitMob =>
                {
                    ApplyMiraiSunderBrand(hitMob);
                    events.Add(new SunderBrandUpdatedEventDto(MobId: hitMob.ActorId, StackCount: hitMob.SunderBrandStacks));
                });
            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(hitAnyTarget ? null : ArenaConfig.NoTargetReason);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.SkillIds.MiraiGraveFang, StringComparison.Ordinal))
        {
            var graveFangTarget = ResolveAssistTarget(state);
            var playerPos = new TilePos(player.TileX, player.TileY);
            var targetPos = graveFangTarget is not null
                ? new TilePos(graveFangTarget.TileX, graveFangTarget.TileY)
                : new TilePos(player.TileX + 1, player.TileY);
            var graveFangTiles = BuildGraveFangTiles(playerPos, targetPos)
                .Select(tile => (TileX: tile.X, TileY: tile.Y));
            var hitAnyTarget = ApplyTileSkill(
                state,
                events,
                graveFangTiles,
                ArenaConfig.SkillConfig.MiraiGraveFangDamage,
                ArenaConfig.HitSmallFxId,
                GetPlayerBaseElement(state),
                player,
                ref pendingLifeLeechHeal,
                postModifierFlatDamageBonusResolver: ResolveMiraiSunderBrandBonusDamage,
                onSuccessfulHit: hitMob =>
                {
                    ApplyMiraiSunderBrand(hitMob);
                    events.Add(new SunderBrandUpdatedEventDto(MobId: hitMob.ActorId, StackCount: hitMob.SunderBrandStacks));
                });
            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(hitAnyTarget ? null : ArenaConfig.NoTargetReason);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.SkillIds.MiraiDreadSweep, StringComparison.Ordinal))
        {
            var hitAnyTarget = ApplyTileSkill(
                state,
                events,
                BuildDreadSweepTiles((player.TileX, player.TileY), state.PlayerFacingDirection),
                ArenaConfig.SkillConfig.MiraiDreadSweepDamage,
                ArenaConfig.HitSmallFxId,
                GetPlayerBaseElement(state),
                player,
                ref pendingLifeLeechHeal,
                postModifierFlatDamageBonusResolver: ResolveMiraiSunderBrandBonusDamage,
                onSuccessfulHit: hitMob =>
                {
                    ApplyMiraiSunderBrand(hitMob);
                    events.Add(new SunderBrandUpdatedEventDto(MobId: hitMob.ActorId, StackCount: hitMob.SunderBrandStacks));
                });
            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(hitAnyTarget ? null : ArenaConfig.NoTargetReason);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.SkillIds.SylwenWhisperShot, StringComparison.Ordinal))
        {
            var hitAnyTarget = TryExecuteSylwenWhisperShot(
                state,
                events,
                player);
            if (!hitAnyTarget)
            {
                return SkillCastResult.Fail(ArenaConfig.NoTargetReason);
            }

            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(null);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.SkillIds.SylwenGalePierce, StringComparison.Ordinal))
        {
            var hitAnyTarget = TryExecuteSylwenGalePierce(
                state,
                events,
                player);
            if (!hitAnyTarget)
            {
                return SkillCastResult.Fail(ArenaConfig.NoTargetReason);
            }

            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(null);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.SkillIds.VelvetVoidChain, StringComparison.Ordinal))
        {
            var hitAnyTarget = TryExecuteVelvetVoidChain(
                state,
                events,
                player);
            if (!hitAnyTarget)
            {
                return SkillCastResult.Fail(ArenaConfig.NoTargetReason);
            }

            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(null);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.SkillIds.VelvetUmbralPath, StringComparison.Ordinal))
        {
            var hitAnyTarget = TryExecuteVelvetUmbralPath(
                state,
                events,
                player);
            if (!hitAnyTarget)
            {
                return SkillCastResult.Fail(ArenaConfig.NoTargetReason);
            }

            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(null);
        }

        if (string.Equals(normalizedSkillId, ArenaConfig.SkillIds.VelvetDeathStrike, StringComparison.Ordinal))
        {
            var hitAnyTarget = TryExecuteVelvetDeathStrike(
                state,
                events,
                player);
            if (!hitAnyTarget)
            {
                return SkillCastResult.Fail(ArenaConfig.NoTargetReason);
            }

            ApplyPlayerCooldownsForCast(state, skill);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            return SkillCastResult.Ok(null);
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

    private static SkillCastResult? TryDispatchExplicitSkillCases(
        StoredBattle state,
        List<BattleEventDto> events,
        string normalizedSkillId,
        StoredActor player,
        StoredSkill skill)
    {
        SkillCastResult? dispatchResult = null;

        switch (normalizedSkillId)
        {
            case var id when id == ArenaConfig.SkillIds.SylwenThornfall:
            {
                var target = ResolveAssistTarget(state);
                if (target is null)
                {
                    dispatchResult = SkillCastResult.Fail(ArenaConfig.NoTargetReason);
                    break; // no target - skip, no fallthrough
                }

                var placed = TryExecuteSylwenThornfall(state, events, target);
                if (!placed)
                {
                    dispatchResult = SkillCastResult.Fail(ArenaConfig.NoTargetReason);
                    break; // explicit break - no fallthrough
                }

                ApplyPlayerCooldownsForCast(state, skill);
                GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
                dispatchResult = SkillCastResult.Ok(null);
                break; // explicit break - no fallthrough
            }
            default:
                break;
        }

        return dispatchResult;
    }

    private static void ApplyPlayerCooldownsForCast(StoredBattle state, StoredSkill skill)
    {
        skill.CooldownRemainingMs = ResolveSkillCooldownTotalMs(state, skill);
        state.PlayerGlobalCooldownRemainingMs = ResolvePlayerGlobalCooldownMs(state);
    }

    private static bool ShouldBypassPlayerGlobalCooldown(StoredBattle state)
    {
        return string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassSylwen, StringComparison.Ordinal) &&
               state.SilverTempestActive &&
               state.SilverTempestRemainingMs > 0;
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

        if (hasAutoAttackTarget)
        {
            foreach (var skillId in offenseSkillPriority)
            {
                // Ultimate skill IDs bypass the autoSkills toggle and delegate directly to TryFireUltimate.
                if (string.Equals(skillId, ArenaConfig.SkillIds.MiraiCollapseField, StringComparison.Ordinal) ||
                    string.Equals(skillId, ArenaConfig.SkillIds.SylwenSilverTempest, StringComparison.Ordinal) ||
                    string.Equals(skillId, ArenaConfig.SkillIds.VelvetStormCollapse, StringComparison.Ordinal))
                {
                    if (TryFireUltimate(state, events, player, ref pendingLifeLeechHeal))
                    {
                        return true;
                    }

                    continue;
                }

                if (!assist.AutoSkills.TryGetValue(skillId, out var isEnabled) || !isEnabled)
                {
                    continue;
                }

                if (string.Equals(skillId, ArenaConfig.SigilBoltSkillId, StringComparison.Ordinal))
                {
                    if (TryExecuteSigilBolt(state, events))
                    {
                        events.Add(new AssistCastEventDto(ArenaConfig.SigilBoltSkillId, ArenaConfig.AssistReasonAutoOffense, ArenaConfig.GetSkillDisplayName(ArenaConfig.SigilBoltSkillId) ?? ArenaConfig.SigilBoltSkillId));
                        return true;
                    }

                    continue;
                }

                if (string.Equals(skillId, ArenaConfig.ShotgunSkillId, StringComparison.Ordinal))
                {
                    if (TryExecuteShotgun(state, events))
                    {
                        events.Add(new AssistCastEventDto(ArenaConfig.ShotgunSkillId, ArenaConfig.AssistReasonAutoOffense, ArenaConfig.GetSkillDisplayName(ArenaConfig.ShotgunSkillId) ?? ArenaConfig.ShotgunSkillId));
                        return true;
                    }

                    continue;
                }

                if (string.Equals(skillId, ArenaConfig.VoidRicochetSkillId, StringComparison.Ordinal))
                {
                    if (TryExecuteVoidRicochet(state, events))
                    {
                        events.Add(new AssistCastEventDto(ArenaConfig.VoidRicochetSkillId, ArenaConfig.AssistReasonAutoOffense, ArenaConfig.GetSkillDisplayName(ArenaConfig.VoidRicochetSkillId) ?? ArenaConfig.VoidRicochetSkillId));
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
        var assistCastHitTiles = ResolveAssistCastHitTiles(state, skillId);
        var castResult = TryExecutePlayerSkillCast(state, events, skillId, ref pendingLifeLeechHeal);
        if (!castResult.Success)
        {
            return false;
        }

        events.Add(new AssistCastEventDto(
            skillId,
            reason,
            ArenaConfig.GetSkillDisplayName(skillId) ?? skillId,
            assistCastHitTiles));
        return true;
    }

    private static IReadOnlyList<TilePos>? ResolveAssistCastHitTiles(StoredBattle state, string skillId)
    {
        var player = GetPlayerActor(state);
        if (player is null)
        {
            return null;
        }

        if (string.Equals(skillId, ArenaConfig.SkillIds.MiraiDreadSweep, StringComparison.Ordinal))
        {
            var dreadSweepTiles = BuildDreadSweepTiles((player.TileX, player.TileY), state.PlayerFacingDirection)
                .Select(tile => new TilePos(tile.TileX, tile.TileY))
                .ToList();
            return dreadSweepTiles.Count > 0 ? dreadSweepTiles : null;
        }

        if (string.Equals(skillId, ArenaConfig.SkillIds.MiraiGraveFang, StringComparison.Ordinal))
        {
            var target = ResolveAssistTarget(state);
            var playerPos = new TilePos(player.TileX, player.TileY);
            var targetPos = target is not null
                ? new TilePos(target.TileX, target.TileY)
                : new TilePos(player.TileX + 1, player.TileY);
            var graveFangTiles = BuildGraveFangTiles(playerPos, targetPos);
            return graveFangTiles.Count > 0 ? graveFangTiles : null;
        }

        return null;
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

        var skillId = ArenaConfig.UltimateConfig.UltimateSkillId;
        if (string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassMirai, StringComparison.Ordinal))
        {
            _ = ApplyMiraiCollapseFieldUltimate(state, events, player, ref pendingLifeLeechHeal);
            skillId = ArenaConfig.SkillIds.MiraiCollapseField;
        }
        else if (string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassSylwen, StringComparison.Ordinal))
        {
            state.SilverTempestActive = true;
            state.SilverTempestRemainingMs = ArenaConfig.SkillConfig.SylwenSilverTempestDurationMs;
            state.PlayerGlobalCooldownRemainingMs = 0;
            skillId = ArenaConfig.SkillIds.SylwenSilverTempest;
            events.Add(new SilverTempestActivatedEventDto(
                DurationMs: ArenaConfig.SkillConfig.SylwenSilverTempestDurationMs));
        }
        else if (string.Equals(state.PlayerClassId, ArenaConfig.PlayerClassVelvet, StringComparison.Ordinal))
        {
            _ = ApplyVelvetStormCollapseUltimate(state, events, player);
            skillId = ArenaConfig.SkillIds.VelvetStormCollapse;
        }
        else
        {
            _ = ApplyAreaSquareSkill(
                state,
                events,
                player,
                ArenaConfig.UltimateConfig.AoeRadius,
                ArenaConfig.UltimateConfig.BaseDamage,
                ArenaConfig.AvalancheFxId,
                GetPlayerBaseElement(state),
                ref pendingLifeLeechHeal);
        }

        state.UltimateGauge = 0;
        state.UltimateReady = false;
        Console.WriteLine("Ultimate fired");
        events.Add(new AssistCastEventDto(
            skillId,
            ArenaConfig.AssistReasonAutoOffense,
            ArenaConfig.GetSkillDisplayName(skillId) ?? skillId));
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

    private static bool ApplyMiraiCollapseFieldUltimate(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player,
        ref int pendingLifeLeechHeal)
    {
        var targets = state.Actors.Values
            .Where(actor => actor.Kind == "mob" && actor.Hp > 0)
            .OrderBy(actor => ComputeChebyshevDistance(actor, player.TileX, player.TileY))
            .ThenBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();

        var movedMobs = new List<CollapseFieldMobPositionDto>(targets.Count);
        foreach (var target in targets)
        {
            if (!state.Actors.TryGetValue(target.ActorId, out var liveTarget) || liveTarget.Hp <= 0)
            {
                continue;
            }

            PullMobTowardPlayerForCollapseField(state, liveTarget, player);
            movedMobs.Add(new CollapseFieldMobPositionDto(
                MobId: liveTarget.ActorId,
                Position: new TilePos(liveTarget.TileX, liveTarget.TileY)));
        }

        events.Add(new CollapseFieldActivatedEventDto(
            PlayerPosition: new TilePos(player.TileX, player.TileY),
            Mobs: movedMobs));

        foreach (var movedMob in movedMobs)
        {
            if (!state.Actors.TryGetValue(movedMob.MobId, out var liveTarget) || liveTarget.Hp <= 0)
            {
                continue;
            }

            var hpDamageApplied = ApplyDamageToMob(
                state,
                events,
                liveTarget,
                ArenaConfig.SkillConfig.MiraiCollapseFieldDamage,
                GetPlayerBaseElement(state),
                attacker: player,
                additionalFlatDamageAfterModifiers: ResolveMiraiSunderBrandBonusDamage(liveTarget));
            pendingLifeLeechHeal += ComputeLifeLeechHeal(state, hpDamageApplied);
            if (liveTarget.Hp <= 0)
            {
                continue;
            }

            liveTarget.IsImmobilized = true;
            liveTarget.ImmobilizeRemainingMs = ArenaConfig.SkillConfig.MiraiCollapseFieldImmobilizeDurationMs;
        }

        return movedMobs.Count > 0;
    }

    private static void PullMobTowardPlayerForCollapseField(StoredBattle state, StoredActor mob, StoredActor player)
    {
        while (mob.Hp > 0 && ComputeChebyshevDistance(mob, player.TileX, player.TileY) > ArenaConfig.SkillConfig.MiraiCollapseFieldStopDistanceChebyshev)
        {
            if (!TryGetFirstWalkableGreedyStepTowardTarget(state, mob, player.TileX, player.TileY, out var destination))
            {
                break;
            }

            if (!destination.HasValue)
            {
                break;
            }

            if (!TryMoveMobToTile(state, mob, destination))
            {
                break;
            }
        }
    }

    private static void ApplyMiraiSunderBrand(StoredActor mob)
    {
        if (mob.Hp <= 0 || !string.Equals(mob.Kind, "mob", StringComparison.Ordinal))
        {
            return;
        }

        mob.SunderBrandStacks += ArenaConfig.SkillConfig.MiraiSunderBrandStacksPerHit;
    }

    private static int ResolveMiraiSunderBrandBonusDamage(StoredActor mob)
    {
        if (!string.Equals(mob.Kind, "mob", StringComparison.Ordinal) || mob.SunderBrandStacks <= 0)
        {
            return 0;
        }

        return mob.SunderBrandStacks * ArenaConfig.SkillConfig.MiraiSunderBrandFlatDamagePerStack;
    }

    private static void ApplyVelvetCorrosion(StoredActor mob)
    {
        if (mob.Hp <= 0 || !string.Equals(mob.Kind, "mob", StringComparison.Ordinal))
        {
            return;
        }

        mob.CorrosionStacks += ArenaConfig.SkillConfig.VelvetCorrosionStacksPerHit;
    }

    private static double ResolveVelvetCorrosionDamageMultiplier(StoredActor mob)
    {
        if (!string.Equals(mob.Kind, "mob", StringComparison.Ordinal) || mob.CorrosionStacks <= 0)
        {
            return 1d;
        }

        return 1d + (mob.CorrosionStacks * ArenaConfig.SkillConfig.VelvetCorrosionDamageAmpPerStack);
    }

    private static bool ApplyVelvetStormCollapseUltimate(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player)
    {
        var targets = state.Actors.Values
            .Where(actor => actor.Kind == "mob" && actor.Hp > 0)
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();

        var detonations = new List<StormCollapseDetonationMobDto>(targets.Count);
        foreach (var target in targets)
        {
            if (!state.Actors.TryGetValue(target.ActorId, out var liveTarget) || liveTarget.Hp <= 0)
            {
                continue;
            }

            var corrosionStacksBefore = Math.Max(0, liveTarget.CorrosionStacks);
            var stackMultiplier = Math.Max(
                ArenaConfig.SkillConfig.VelvetStormCollapseMinimumStacksMultiplier,
                corrosionStacksBefore);
            var stormDamage = ArenaConfig.SkillConfig.VelvetStormCollapseBaseDamage * stackMultiplier;

            var hpDamageApplied = ApplyDamageToMob(
                state,
                events,
                liveTarget,
                stormDamage,
                GetPlayerBaseElement(state),
                attacker: player,
                finalDamageMultiplierResolver: ResolveVelvetCorrosionDamageMultiplier);
            ApplyPlayerLifeLeech(state, events, ComputeLifeLeechHeal(state, hpDamageApplied));
            liveTarget.CorrosionStacks = 0;

            detonations.Add(new StormCollapseDetonationMobDto(
                MobId: liveTarget.ActorId,
                CorrosionStacksBeforeDetonation: corrosionStacksBefore,
                DamageDealt: hpDamageApplied));
        }

        events.Add(new StormCollapseDetonatedEventDto(Mobs: detonations));
        return detonations.Count > 0;
    }

    private static bool TryExecuteSylwenThornfall(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor targetMob)
    {
        var crossTiles = BuildThornfallCrossTiles(
            targetPos: new TilePos(targetMob.TileX, targetMob.TileY));
        if (crossTiles.Count == 0)
        {
            return false;
        }

        var affectedTiles = crossTiles
            .Select(tile => (TileX: tile.X, TileY: tile.Y))
            .ToList();
        EmitFxForTiles(events, affectedTiles, ArenaConfig.AvalancheFxId, GetPlayerBaseElement(state));
        events.Add(new ThornfallPlacedEventDto(FanTiles: crossTiles));

        AddDamagingHazardDecalZone(
            state,
            crossTiles,
            ArenaConfig.SkillConfig.SylwenThornfallDurationMs,
            ArenaConfig.SkillConfig.SylwenThornfallDamagePerTick,
            entityType: ArenaConfig.SkillIds.SylwenThornfall);

        return true;
    }

    private static StoredActor? ResolveAssistTarget(StoredBattle state)
    {
        var player = GetPlayerActor(state);
        if (player is null)
        {
            return null;
        }

        var lockedTarget = ResolveLockedTargetMobAnyDistance(state);
        if (lockedTarget is not null && lockedTarget.Hp > 0)
        {
            return lockedTarget;
        }

        return state.Actors.Values
            .Where(actor => string.Equals(actor.Kind, "mob", StringComparison.Ordinal) && actor.Hp > 0)
            .OrderBy(actor => ComputeChebyshevDistance(actor, player.TileX, player.TileY))
            .ThenBy(actor => actor.ActorId, StringComparer.Ordinal)
            .FirstOrDefault();
    }

    private static List<TilePos> BuildThornfallCrossTiles(TilePos targetPos)
    {
        var offsets = new[]
        {
            (0, 0),   // center
            (0, -1),  // north
            (-1, 0),  // west
            (1, 0),   // east
            (0, 1),   // south
        };

        return offsets
            .Select(offset => new TilePos(targetPos.X + offset.Item1, targetPos.Y + offset.Item2))
            .Where(tile => IsInBounds(tile.X, tile.Y))
            .ToList();
    }

    private static IEnumerable<TilePos> GetFanNeighbors(int dx, int dy, TilePos center)
    {
        if (dx == 1 && dy == 0)
        {
            return
            [
                new TilePos(center.X, center.Y - 1),
                new TilePos(center.X, center.Y + 1)
            ];
        }

        if (dx == -1 && dy == 0)
        {
            return
            [
                new TilePos(center.X, center.Y - 1),
                new TilePos(center.X, center.Y + 1)
            ];
        }

        if (dx == 0 && dy == 1)
        {
            return
            [
                new TilePos(center.X - 1, center.Y),
                new TilePos(center.X + 1, center.Y)
            ];
        }

        if (dx == 0 && dy == -1)
        {
            return
            [
                new TilePos(center.X - 1, center.Y),
                new TilePos(center.X + 1, center.Y)
            ];
        }

        if (dx == 1 && dy == -1)
        {
            return
            [
                new TilePos(center.X - 1, center.Y),
                new TilePos(center.X, center.Y + 1)
            ];
        }

        if (dx == 1 && dy == 1)
        {
            return
            [
                new TilePos(center.X, center.Y - 1),
                new TilePos(center.X - 1, center.Y)
            ];
        }

        if (dx == -1 && dy == 1)
        {
            return
            [
                new TilePos(center.X + 1, center.Y),
                new TilePos(center.X, center.Y - 1)
            ];
        }

        if (dx == -1 && dy == -1)
        {
            return
            [
                new TilePos(center.X, center.Y + 1),
                new TilePos(center.X + 1, center.Y)
            ];
        }

        return [];
    }

    private static List<TilePos> BuildGraveFangTiles(TilePos playerPos, TilePos targetPos)
    {
        var dx = Math.Sign(targetPos.X - playerPos.X);
        var dy = Math.Sign(targetPos.Y - playerPos.Y);

        if (dx == 0 && dy == 0) dx = 1; // default facing right if on same tile

        var center = new TilePos(playerPos.X + dx, playerPos.Y + dy);
        var neighbors = GetFanNeighbors(dx, dy, center);

        return new[] { center }
            .Concat(neighbors)
            .Where(tile => IsInBounds(tile.X, tile.Y))
            .Distinct()
            .ToList();
    }

    private static void ApplySylwenDeadeyeGraceOnWhisperHit(StoredActor mob)
    {
        if (mob.Hp <= 0 || !string.Equals(mob.Kind, "mob", StringComparison.Ordinal))
        {
            return;
        }

        mob.DeadeyeConsecutiveHits += ArenaConfig.SkillConfig.SylwenDeadeyeGraceConsecutiveHitsPerWhisperHit;
        mob.FocusStacks += ArenaConfig.SkillConfig.SylwenDeadeyeGraceFocusStacksPerHit;
    }

    private static int ResolveSylwenFocusBonusDamage(StoredActor mob)
    {
        if (!string.Equals(mob.Kind, "mob", StringComparison.Ordinal) || mob.FocusStacks <= 0)
        {
            return 0;
        }

        var bonusDamage = ArenaConfig.SkillConfig.SylwenWhisperShotDamage *
                          mob.FocusStacks *
                          (ArenaConfig.SkillConfig.SylwenDeadeyeGraceFocusBonusPercentPerStack / 100d);
        return Math.Max(0, (int)Math.Round(bonusDamage, MidpointRounding.AwayFromZero));
    }

    private static bool IsHeadshot(StoredActor mob)
    {
        if (!string.Equals(mob.Kind, "mob", StringComparison.Ordinal))
        {
            return false;
        }

        return mob.DeadeyeConsecutiveHits > 0 &&
               mob.DeadeyeConsecutiveHits % ArenaConfig.SkillConfig.SylwenDeadeyeGraceHeadshotEveryNHits == 0;
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
        if (slot.IsEliteSlot)
        {
            var eliteIndex = NextIntFromBattleRng(state, EliteCommanderPool.Length);
            slot.Archetype = EliteCommanderPool[eliteIndex];
        }

        var config = GetMobConfig(slot.Archetype);
        var spawnAsElite = slot.IsEliteSlot || ShouldSpawnEliteForSlot(state, slot);
        var maxHp = ResolveScaledMobMaxHp(state, config, spawnAsElite);
        if (ShouldApplyElementBonus(state, config.AttackElement))
        {
            maxHp = ScaleByMultiplier(maxHp, ArenaConfig.ElementalConfig.DailyElementBonusMultiplier);
        }

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
            ResolveMobAutoAttackCooldownMs(config, spawnedMob, state));
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

        var isRangedAutoAttack =
            string.Equals(state.PlayerActorId, ArenaConfig.CharacterIds.Sylwen, StringComparison.Ordinal) ||
            string.Equals(state.PlayerActorId, ArenaConfig.CharacterIds.Velvet, StringComparison.Ordinal);

        if (isRangedAutoAttack)
        {
            var rangedTarget = ResolveRangedTarget(
                state,
                ArenaConfig.AutoAttackRangedMaxRange,
                requireLOS: false);
            if (rangedTarget is null)
            {
                return;
            }

            var fromTile = new TilePos(player.TileX, player.TileY);
            var toTile = new TilePos(rangedTarget.TileX, rangedTarget.TileY);
            events.Add(new RangedProjectileFiredEventDto(
                WeaponId: ArenaConfig.WeaponIds.AutoAttackRanged,
                FromTile: fromTile,
                ToTile: toTile,
                TargetActorId: rangedTarget.ActorId,
                Pierces: false));

            var rangedHpDamageApplied = ApplyRangedDamageToMob(
                state,
                rangedTarget,
                ArenaConfig.PlayerAutoAttackDamage,
                ArenaConfig.WeaponIds.AutoAttackRanged,
                events,
                emitProjectileEvent: false,
                projectilePierces: false,
                projectileFromTile: fromTile,
                applyLifeLeech: false);
            pendingLifeLeechHeal += ComputeLifeLeechHeal(state, rangedHpDamageApplied);
            GrantPlayerShield(state, events, ArenaConfig.PlayerShieldGainPerAction);
            state.PlayerAttackCooldownRemainingMs = ResolvePlayerAutoAttackCooldownMs(state);
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
        pendingLifeLeechHeal += ComputeLifeLeechHeal(state, hpDamageApplied);
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

        // Active boss gets priority over regular mobs
        var boss = state.Actors.Values.FirstOrDefault(actor => actor.Kind == "boss" && actor.Hp > 0);
        if (boss is not null)
        {
            return boss;
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

            if (liveMob.IsStunned)
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
                elementType: config.AttackElement,
                durationMs: attackFxDuration);

            events.Add(new FxSpawnEventDto(
                FxId: ArenaConfig.HitSmallFxId,
                TileX: player.TileX,
                TileY: player.TileY,
                Layer: "hitFx",
                DurationMs: 620,
                Element: config.AttackElement));

            ApplyDamageToPlayer(
                state,
                events,
                player,
                ResolveMobOutgoingDamage(state, liveMob, config.AutoAttackDamage),
                config.AttackElement,
                attacker: liveMob,
                isRangedAutoAttack: config.AutoAttackRangeTiles > 1);
            slot.AttackCooldownRemainingMs = ResolveMobAutoAttackCooldownMs(config, liveMob, state);
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
            elementType: config.AttackElement,
            durationMs: ArenaConfig.MeleeSwingDurationMs);
        EmitFxForTiles(events, tiles, config.AbilityFxId, config.AttackElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            config.AttackElement,
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
            elementType: config.AttackElement,
            durationMs: ArenaConfig.RangedProjectileDurationMs);
        EmitFxForTiles(events, tiles, config.AbilityFxId, config.AttackElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            config.AttackElement,
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

        EmitFxForTiles(events, lineTiles, config.AbilityFxId, config.AttackElement);
        if (playerCollinearInFront)
        {
            ApplyDamageToPlayer(
                state,
                events,
                player,
                ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
                config.AttackElement,
                attacker: mob);
        }

        return true;
    }

    private static bool TryCastShamanStormPulseAbility(
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

        var pulseTiles = BuildSquareTiles(mob.TileX, mob.TileY, config.AbilityRangeTiles, includeCenter: true).ToList();
        EmitFxForTiles(events, pulseTiles, config.AbilityFxId, config.AttackElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            config.AttackElement,
            attacker: mob);
        return true;
    }

    private static void TryCastSkeletonSoulBurst(
        StoredBattle state,
        StoredActor mob,
        StoredActor player,
        List<BattleEventDto> events)
    {
        if (!IsAdjacent(mob, player))
        {
            return;
        }

        var skeletonElement = MobConfigs[MobArchetype.MeleeSkeleton].AttackElement;
        var tiles = new[] { (mob.TileX, mob.TileY) };
        EmitFxForTiles(events, tiles, ArenaConfig.MobSkeletonSoulBurstFxId, skeletonElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, ArenaConfig.MeleeSkeletonAbilityDamage),
            skeletonElement,
            attacker: mob);
    }

    private static bool TryCastWogolGroundSlam(
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

        var aoeSquareTiles = BuildSquareTiles(mob.TileX, mob.TileY, 1, includeCenter: true).ToList();
        EmitFxForTiles(events, aoeSquareTiles, config.AbilityFxId, config.AttackElement);
        var playerInAoe = ComputeChebyshevDistance(mob, player.TileX, player.TileY) <= 1;
        if (playerInAoe)
        {
            ApplyDamageToPlayer(
                state,
                events,
                player,
                ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
                config.AttackElement,
                attacker: mob);
        }

        return true;
    }

    private static bool TryCastWarriorCleaveStrike(
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
            elementType: config.AttackElement,
            durationMs: ArenaConfig.MeleeSwingDurationMs);
        EmitFxForTiles(events, tiles, config.AbilityFxId, config.AttackElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            config.AttackElement,
            attacker: mob);
        return true;
    }

    private static bool TryCastZombieSelfHeal(
        StoredBattle state,
        StoredActor mob,
        MobArchetypeConfig config,
        List<BattleEventDto> events)
    {
        if (mob.Hp >= mob.MaxHp)
        {
            return false;
        }

        mob.Hp = Math.Min(mob.Hp + ArenaConfig.MeleeZombieSelfHealAmount, mob.MaxHp);
        var tiles = new[] { (mob.TileX, mob.TileY) };
        EmitFxForTiles(events, tiles, config.AbilityFxId, config.AttackElement);
        return true;
    }

    private static bool TryCastImpFireballBarrage(
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

        var damagePerProjectile = Math.Max(1, config.AbilityDamage / 3);
        for (var i = 0; i < 3; i++)
        {
            EmitAttackFx(
                state,
                events,
                fxKind: CombatFxKind.RangedProjectile,
                fromActor: mob,
                toActor: player,
                elementType: config.AttackElement,
                durationMs: ArenaConfig.RangedProjectileDurationMs);
            EmitFxForTiles(events, new[] { (player.TileX, player.TileY) }, config.AbilityFxId, config.AttackElement);
            ApplyDamageToPlayer(
                state,
                events,
                player,
                ResolveMobOutgoingDamage(state, mob, damagePerProjectile),
                config.AttackElement,
                attacker: mob);
        }

        return true;
    }

    private static bool TryCastSwampyMudLob(
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

        EmitAttackFx(
            state,
            events,
            fxKind: CombatFxKind.RangedProjectile,
            fromActor: mob,
            toActor: player,
            elementType: config.AttackElement,
            durationMs: ArenaConfig.RangedProjectileDurationMs);
        EmitFxForTiles(events, new[] { (player.TileX, player.TileY) }, config.AbilityFxId, config.AttackElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            config.AttackElement,
            attacker: mob);

        AddDamagingHazardDecal(
            state,
            player.TileX,
            player.TileY,
            ArenaConfig.RangedSwampyMudLobDecalDurationMs,
            ArenaConfig.RangedSwampyMudLobDecalDamagePerTick);

        return true;
    }

    private static bool TryCastMuddyOozeShot(
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

        EmitAttackFx(
            state,
            events,
            fxKind: CombatFxKind.RangedProjectile,
            fromActor: mob,
            toActor: player,
            elementType: config.AttackElement,
            durationMs: ArenaConfig.RangedProjectileDurationMs);
        EmitFxForTiles(events, new[] { (player.TileX, player.TileY) }, config.AbilityFxId, config.AttackElement);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mob, config.AbilityDamage),
            config.AttackElement,
            attacker: mob);
        return true;
    }

    private static void AddDamagingHazardDecal(
        StoredBattle state,
        int tileX,
        int tileY,
        int durationMs,
        int damagePerTick,
        string entityType = "hazard")
    {
        var entityId = $"hazard_{state.Tick}_{tileX}_{tileY}_{NextTickEventId(state)}";
        state.Decals.Add(new StoredDecal(
            entityId: entityId,
            decalKind: DecalKind.DamagingHazard,
            entityType: entityType,
            mobType: null,
            tileX: tileX,
            tileY: tileY,
            spriteKey: null,
            remainingMs: durationMs,
            totalMs: durationMs,
            createdTick: state.Tick,
            damagePerTick: damagePerTick));
    }

    private static void AddDamagingHazardDecalZone(
        StoredBattle state,
        IEnumerable<TilePos> tiles,
        int durationMs,
        int damagePerTick,
        string entityType)
    {
        var uniqueInBoundsTiles = tiles
            .Where(tile => IsInBounds(tile.X, tile.Y))
            .Distinct()
            .ToList();

        foreach (var tile in uniqueInBoundsTiles)
        {
            AddDamagingHazardDecal(
                state,
                tile.X,
                tile.Y,
                durationMs,
                damagePerTick,
                entityType);
        }
    }

    private static bool ApplyAreaSquareSkill(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player,
        int radius,
        int damage,
        string fxId,
        ElementType element,
        ref int pendingLifeLeechHeal,
        Func<StoredActor, int>? postModifierFlatDamageBonusResolver = null,
        Action<StoredActor>? onSuccessfulHit = null)
    {
        var tiles = BuildSquareTiles(player.TileX, player.TileY, radius, includeCenter: false);
        return ApplyTileSkill(
            state,
            events,
            tiles,
            damage,
            fxId,
            element,
            player,
            ref pendingLifeLeechHeal,
            postModifierFlatDamageBonusResolver,
            onSuccessfulHit);
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
            pendingLifeLeechHeal += ComputeLifeLeechHeal(state, hpDamageApplied);
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
        ref int pendingLifeLeechHeal,
        Func<StoredActor, int>? postModifierFlatDamageBonusResolver = null,
        Action<StoredActor>? onSuccessfulHit = null)
    {
        var affectedTiles = SanitizeSkillTiles(tiles, attacker.TileX, attacker.TileY);
        EmitFxForTiles(events, affectedTiles, fxId, element);

        var targetMobIds = ResolveMobIdsOnTiles(state, affectedTiles).ToList();
        foreach (var mobId in targetMobIds)
        {
            if (state.Actors.TryGetValue(mobId, out var mob))
            {
                var hpDamageApplied = ApplyDamageToMob(
                    state,
                    events,
                    mob,
                    damage,
                    element,
                    attacker,
                    additionalFlatDamageAfterModifiers: postModifierFlatDamageBonusResolver?.Invoke(mob) ?? 0,
                    onSuccessfulHit: onSuccessfulHit);
                pendingLifeLeechHeal += ComputeLifeLeechHeal(state, hpDamageApplied);
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

    private static string ResolveHitKind(StoredBattle state, bool allowCriticalHits, int criticalHitChancePercent)
    {
        if (!allowCriticalHits)
        {
            return BattleHitKinds.Normal;
        }

        return NextIntFromCritRng(state, 100) < Math.Clamp(criticalHitChancePercent, 0, 100)
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
            .Where(actor => (actor.Kind == "mob" || actor.Kind == "boss") && tileSet.Contains((actor.TileX, actor.TileY)))
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

        var isPlayerResistanceHit = false;
        if (state.EquippedWeaponResistanceElement.HasValue)
        {
            var elemMult = ResolveElementalModifier(element, ElementType.Physical, state.EquippedWeaponResistanceElement.Value);
            if (elemMult < 1.0f)
            {
                isPlayerResistanceHit = true;
                modifiedDamage = Math.Max(1, (int)Math.Round(modifiedDamage * elemMult));
            }
        }

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
        var hitKind = ResolveHitKind(state, allowCriticalHits, ArenaConfig.CriticalHitChancePercent);
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
            HitKind: hitKind,
            IsResistanceHit: isPlayerResistanceHit));

        AddUltimateGauge(
            state,
            damageAppliedToPlayer * ArenaConfig.UltimateConfig.GaugePerDamageTaken);

        if (isCrit)
        {
            EmitCritTextEvent(events, player.TileX, player.TileY, nowMs);
        }

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
        bool allowCriticalHits = true,
        int additionalFlatDamageAfterModifiers = 0,
        Action<StoredActor>? onSuccessfulHit = null,
        Func<StoredActor, double>? finalDamageMultiplierResolver = null)
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
        var attackerIsPlayer = attacker is not null && string.Equals(attacker.Kind, "player", StringComparison.Ordinal);
        var hitKind = ResolveHitKind(
            state,
            allowCriticalHits,
            attackerIsPlayer
                ? ResolvePlayerCriticalHitChancePercent(state)
                : ArenaConfig.CriticalHitChancePercent);
        var isCrit = string.Equals(hitKind, BattleHitKinds.Crit, StringComparison.Ordinal);
        if (isCrit && attackerIsPlayer)
        {
            remainingDamage = ApplyPercentIncrease(remainingDamage, ResolvePlayerCriticalDamageBonusPercent(state));
        }

        var isWeaknessHit = false;
        var isResistanceHit = false;
        if (string.Equals(mob.Kind, "boss", StringComparison.Ordinal))
        {
            // Boss has physical resistance; also track elemental weakness/resistance from its BossDef
            var bossDef = ArenaConfig.BossConfig.TryResolveBossById(mob.ActorId);
            if (bossDef is not null)
            {
                float bossMult;
                if (element == ElementType.Physical)
                {
                    bossMult = ArenaConfig.BossConfig.PhysicalResistance;
                    isResistanceHit = true;
                }
                else
                {
                    bossMult = ResolveElementalModifier(element, bossDef.WeakTo, ElementType.Physical);
                    if (bossMult > 1.0f) isWeaknessHit = true;
                    else if (bossMult < 1.0f) isResistanceHit = true;
                }
                if (bossMult != 1.0f)
                    remainingDamage = Math.Max(1, (int)Math.Round(remainingDamage * bossMult));
            }
        }
        else if (mob.MobType is MobArchetype mobArchetypeForElem && MobConfigs.TryGetValue(mobArchetypeForElem, out var mobElemConfig))
        {
            var elementalMult = ResolveElementalModifier(element, mobElemConfig.WeakTo, mobElemConfig.ResistantTo);
            if (elementalMult > 1.0f)
                isWeaknessHit = true;
            else if (elementalMult < 1.0f)
                isResistanceHit = true;
            if (elementalMult != 1.0f)
                remainingDamage = Math.Max(1, (int)Math.Round(remainingDamage * elementalMult));
        }

        if (GetBuffingEliteArchetype(state, mob) == MobArchetype.EliteIceZombie)
        {
            remainingDamage = ApplyPercentReduction(remainingDamage, ArenaConfig.EliteCommanderDamageReductionPercent);
            remainingDamage = Math.Max(1, remainingDamage);
        }

        if (additionalFlatDamageAfterModifiers > 0)
        {
            remainingDamage = Math.Max(0, remainingDamage + additionalFlatDamageAfterModifiers);
        }

        if (remainingDamage > 0 && finalDamageMultiplierResolver is not null)
        {
            var resolvedMultiplier = finalDamageMultiplierResolver(mob);
            if (!double.IsFinite(resolvedMultiplier))
            {
                resolvedMultiplier = 1d;
            }

            resolvedMultiplier = Math.Max(0d, resolvedMultiplier);
            remainingDamage = Math.Max(
                0,
                (int)Math.Round(
                    remainingDamage * resolvedMultiplier,
                    MidpointRounding.AwayFromZero));
        }

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
            HitKind: hitKind,
            IsWeaknessHit: isWeaknessHit,
            IsResistanceHit: isResistanceHit));

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

        if (onSuccessfulHit is not null && (absorbed + hpDamageApplied) > 0)
        {
            onSuccessfulHit(mob);
        }

        if (!isFinalBlow)
        {
            return hpDamageApplied;
        }

        if (string.Equals(mob.Kind, "boss", StringComparison.Ordinal))
        {
            OnBossDeath(state, events, mob);
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

        EmitDeathEvent(state, events, mob, element, attacker?.ActorId, mob.IsMimic ? "mimic" : null);
        if (mob.IsElite && mob.MobType is MobArchetype eliteMobType)
        {
            events.Add(new EliteDiedEventDto(
                EliteEntityId: mob.ActorId,
                MobType: eliteMobType));
        }

        if (mob.IsMimic)
        {
            TryOfferCardChoice(state, events, CardOfferSource.Chest);
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
            events.Add(new FocusResetEventDto(MobId: mob.ActorId));
        }

        if (mob.MobType == MobArchetype.MeleeSkeleton)
        {
            var playerForBurst = GetPlayerActor(state);
            if (playerForBurst is not null)
            {
                TryCastSkeletonSoulBurst(state, mob, playerForBurst, events);
            }
        }

        mob.SunderBrandStacks = 0;
        mob.CorrosionStacks = 0;
        mob.FocusStacks = 0;
        mob.DeadeyeConsecutiveHits = 0;
        mob.IsStunned = false;
        mob.StunRemainingMs = 0;
        mob.IsImmobilized = false;
        mob.ImmobilizeRemainingMs = 0;
        state.Actors.Remove(mob.ActorId);
        return hpDamageApplied;
    }

    private static void EmitDeathEvent(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor entity,
        ElementType? elementType,
        string? killerEntityId,
        string? entityTypeOverride = null)
    {
        events.Add(new DeathEventDto(
            EntityId: entity.ActorId,
            EntityType: entityTypeOverride ?? entity.Kind,
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

    private static int ComputeLifeLeechHeal(StoredBattle state, int hpDamageApplied)
    {
        if (hpDamageApplied <= 0)
        {
            return 0;
        }

        var lifeLeechPercent = ResolvePlayerLifeLeechPercent(state);
        if (lifeLeechPercent <= 0)
        {
            return 0;
        }

        return (int)Math.Floor(hpDamageApplied * (lifeLeechPercent / 100.0d));
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

        player.Hp = Math.Min(player.Hp + appliedHeal, player.MaxHp);
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

        // Boss defeated victory
        if (state.BossSpawned)
        {
            var bossActor = state.Actors.Values.FirstOrDefault(actor => actor.Kind == "boss");
            if (bossActor is not null && bossActor.Hp <= 0)
            {
                EndRun(state, events, ArenaConfig.RunEndReasonVictoryBoss);
                return true;
            }
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

        var resolvedReason = runEndReason switch
        {
            ArenaConfig.RunEndReasonDefeatDeath => ArenaConfig.RunEndReasonDefeatDeath,
            ArenaConfig.RunEndReasonVictoryBoss => ArenaConfig.RunEndReasonVictoryBoss,
            _ => ArenaConfig.RunEndReasonVictoryTime
        };
        var endedAtMs = GetElapsedMsForTick(state.Tick);
        state.IsRunEnded = true;
        state.RunEndReason = resolvedReason;
        state.RunEndedAtMs = endedAtMs;
        state.BattleStatus = string.Equals(resolvedReason, ArenaConfig.RunEndReasonDefeatDeath, StringComparison.Ordinal)
            ? ArenaConfig.StatusDefeat
            : ArenaConfig.StatusVictory;
        state.IsPaused = false;
        state.PendingWhisperShotHits.Clear();
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

        var totalKills = ResolveTotalKillsForRunRewards(state);
        var masteryXpAward = ArenaConfig.MasteryConfig.XpPerRunCompleted +
                             (totalKills * ArenaConfig.MasteryConfig.XpPerKill);
        if (masteryXpAward > 0)
        {
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

        var accountXpAward = ArenaConfig.ZoneConfig.AccountXpPerRunCompleted +
                             (totalKills * ArenaConfig.ZoneConfig.AccountXpPerKill);
        if (accountXpAward > 0)
        {
            try
            {
                _accountStateStore.AwardAccountXp(
                    accountId: DefaultAccountId,
                    xpAmount: accountXpAward);
            }
            catch
            {
                // Keep battle completion robust even if account progression sync fails.
            }
        }

        var runCompleted = !string.Equals(
            state.RunEndReason,
            ArenaConfig.RunEndReasonDefeatDeath,
            StringComparison.Ordinal);
        var runSummary = new RunSummary(
            KillCount: totalKills,
            EliteKillCount: Math.Max(0, state.EliteKills),
            ChestsOpened: Math.Max(0, state.ChestsOpened),
            RunLevel: Math.Max(ArenaConfig.RunInitialLevel, state.RunLevel),
            RunCompleted: runCompleted);

        try
        {
            _accountStateStore.EvaluateContractsAfterRun(DefaultAccountId, runSummary);
        }
        catch
        {
            // Keep battle completion robust even if account progression sync fails.
        }
    }

    private static int ResolveTotalKillsForRunRewards(StoredBattle state)
    {
        return Math.Max(0, state.TotalKills) + Math.Max(0, state.EliteKills);
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

    private static IEnumerable<(int TileX, int TileY)> BuildFrontalConeTiles(int playerX, int playerY, string facingDirection)
    {
        var normalizedFacing = NormalizeDirection(facingDirection) ?? ArenaConfig.FacingUp;
        return normalizedFacing switch
        {
            ArenaConfig.FacingUp =>
            [
                (playerX - 1, playerY - 1),
                (playerX, playerY - 1),
                (playerX + 1, playerY - 1)
            ],
            ArenaConfig.FacingUpRight =>
            [
                (playerX, playerY - 1),
                (playerX + 1, playerY - 1),
                (playerX + 1, playerY)
            ],
            ArenaConfig.FacingRight =>
            [
                (playerX + 1, playerY - 1),
                (playerX + 1, playerY),
                (playerX + 1, playerY + 1)
            ],
            ArenaConfig.FacingDownRight =>
            [
                (playerX + 1, playerY),
                (playerX + 1, playerY + 1),
                (playerX, playerY + 1)
            ],
            ArenaConfig.FacingDown =>
            [
                (playerX - 1, playerY + 1),
                (playerX, playerY + 1),
                (playerX + 1, playerY + 1)
            ],
            ArenaConfig.FacingDownLeft =>
            [
                (playerX - 1, playerY),
                (playerX - 1, playerY + 1),
                (playerX, playerY + 1)
            ],
            ArenaConfig.FacingLeft =>
            [
                (playerX - 1, playerY - 1),
                (playerX - 1, playerY),
                (playerX - 1, playerY + 1)
            ],
            ArenaConfig.FacingUpLeft =>
            [
                (playerX - 1, playerY),
                (playerX - 1, playerY - 1),
                (playerX, playerY - 1)
            ],
            _ =>
            [
                (playerX - 1, playerY - 1),
                (playerX, playerY - 1),
                (playerX + 1, playerY - 1)
            ]
        };
    }

    private static IEnumerable<(int TileX, int TileY)> BuildDreadSweepTiles((int TileX, int TileY) playerPos, string facingDirection)
    {
        var normalizedFacing = NormalizeDirection(facingDirection) ?? ArenaConfig.FacingUp;
        var targetPos = normalizedFacing switch
        {
            ArenaConfig.FacingUp => (TileX: playerPos.TileX, TileY: playerPos.TileY - 1),
            ArenaConfig.FacingUpRight => (TileX: playerPos.TileX + 1, TileY: playerPos.TileY - 1),
            ArenaConfig.FacingRight => (TileX: playerPos.TileX + 1, TileY: playerPos.TileY),
            ArenaConfig.FacingDownRight => (TileX: playerPos.TileX + 1, TileY: playerPos.TileY + 1),
            ArenaConfig.FacingDown => (TileX: playerPos.TileX, TileY: playerPos.TileY + 1),
            ArenaConfig.FacingDownLeft => (TileX: playerPos.TileX - 1, TileY: playerPos.TileY + 1),
            ArenaConfig.FacingLeft => (TileX: playerPos.TileX - 1, TileY: playerPos.TileY),
            ArenaConfig.FacingUpLeft => (TileX: playerPos.TileX - 1, TileY: playerPos.TileY - 1),
            _ => (TileX: playerPos.TileX + 1, TileY: playerPos.TileY)
        };

        return BuildDreadSweepTiles(playerPos, targetPos);
    }

    private static List<(int TileX, int TileY)> BuildDreadSweepTiles(
        (int TileX, int TileY) playerPos,
        (int TileX, int TileY) targetPos)
    {
        var dx = Math.Sign(targetPos.TileX - playerPos.TileX);
        var dy = Math.Sign(targetPos.TileY - playerPos.TileY);
        if (dx == 0 && dy == 0)
        {
            dx = 1;
        }

        var tiles = new List<(int TileX, int TileY)>();
        for (var tileY = 0; tileY < ArenaConfig.Height; tileY += 1)
        {
            for (var tileX = 0; tileX < ArenaConfig.Width; tileX += 1)
            {
                if (tileX == playerPos.TileX && tileY == playerPos.TileY)
                {
                    continue;
                }

                var deltaX = tileX - playerPos.TileX;
                var deltaY = tileY - playerPos.TileY;
                var forward = (deltaX * dx) + (deltaY * dy);
                if (forward <= 0)
                {
                    continue;
                }

                var lateral = Math.Abs((deltaX * dy) - (deltaY * dx));
                if (lateral > forward)
                {
                    continue;
                }

                // Keep the cone strict and deep without over-widening on a 7x7 board:
                // allow the 45deg boundary only on the first forward band.
                if (forward > 1 && lateral == forward)
                {
                    continue;
                }

                tiles.Add((tileX, tileY));
            }
        }

        return tiles;
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
        string AbilityFxId,
        ElementType AttackElement,
        ElementType WeakTo,
        ElementType ResistantTo,
        bool IsEliteCommander = false);

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

    private sealed class RangedShamanBehavior : IMobBehavior
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
            return TryCastShamanStormPulseAbility(state, mob, player, config, events);
        }
    }

    private sealed class MeleeSkeletonBehavior : IMobBehavior
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
            // Soul Burst is death-triggered only; cooldown is 99999ms so it never fires via normal ability loop.
            return false;
        }
    }

    private sealed class MeleeWogolBehavior : IMobBehavior
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
            return TryCastWogolGroundSlam(state, mob, player, config, events);
        }
    }

    private sealed class MeleeWarriorBehavior : IMobBehavior
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
            return TryCastWarriorCleaveStrike(state, mob, player, config, events);
        }
    }

    private sealed class MeleeZombieBehavior : IMobBehavior
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
            return TryCastZombieSelfHeal(state, mob, config, events);
        }
    }

    private sealed class MeleeTinyZombieBehavior : IMobBehavior
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
            return false;
        }
    }

    private sealed class RangedImpBehavior : IMobBehavior
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
            return TryCastImpFireballBarrage(state, mob, player, config, events);
        }
    }

    private sealed class RangedSwampyBehavior : IMobBehavior
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
            return TryCastSwampyMudLob(state, mob, player, config, events);
        }
    }

    private sealed class RangedMuddyBehavior : IMobBehavior
    {
        public bool TryChooseMove(
            StoredBattle state,
            StoredActor mob,
            StoredActor player,
            MobSlotState slot,
            MobArchetypeConfig config,
            out (int TileX, int TileY)? destination)
        {
            return TryChooseAggressiveBandMove(state, mob, player, slot, out destination);
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
            return TryCastMuddyOozeShot(state, mob, player, config, events);
        }
    }

    private sealed class MeleeSlugBehavior : IMobBehavior
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
            return false;
        }
    }

    private sealed class EliteGreedyMeleeBehavior : IMobBehavior
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
            return false;
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

        if (state.ZoneIndex < 1 || state.ZoneIndex > ArenaConfig.ZoneConfig.ZoneCount)
        {
            throw new InvalidOperationException(
                $"Zone index is invalid: zoneIndex={state.ZoneIndex}, max={ArenaConfig.ZoneConfig.ZoneCount}.");
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
            state.PlayerModifiers.CritChanceBonusPercent < 0 ||
            state.PlayerModifiers.CritChanceBonusPercent > ArenaConfig.SigilConfig.MaxAdditionalCritChancePercent ||
            state.PlayerModifiers.CritDamageBonusPercent < 0 ||
            state.PlayerModifiers.CritDamageBonusPercent > ArenaConfig.SigilConfig.MaxAdditionalCritDamagePercent ||
            state.PlayerModifiers.LifeLeechBonusPercent < 0 ||
            state.PlayerModifiers.LifeLeechBonusPercent > ArenaConfig.SigilConfig.MaxAdditionalLifeLeechPercent ||
            state.PlayerModifiers.GlobalCooldownReductionPercent < 0 ||
            state.PlayerModifiers.GlobalCooldownReductionPercent > ArenaConfig.MaxGlobalCooldownReductionPercent)
        {
            throw new InvalidOperationException("Player modifiers are invalid.");
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

        if (state.SilverTempestRemainingMs < 0)
        {
            throw new InvalidOperationException(
                $"Silver Tempest remaining duration is invalid: {state.SilverTempestRemainingMs}.");
        }

        if (!state.SilverTempestActive && state.SilverTempestRemainingMs > 0)
        {
            throw new InvalidOperationException(
                "Silver Tempest remaining duration is positive while the buff is inactive.");
        }

        foreach (var pendingHit in state.PendingWhisperShotHits)
        {
            if (string.IsNullOrWhiteSpace(pendingHit.TargetActorId))
            {
                throw new InvalidOperationException("Pending Whisper Shot hit has invalid target actor id.");
            }

            if (pendingHit.DamageBase < 0)
            {
                throw new InvalidOperationException(
                    $"Pending Whisper Shot hit has invalid base damage: {pendingHit.DamageBase}.");
            }

            if (pendingHit.DelayRemainingMs < 0)
            {
                throw new InvalidOperationException(
                    $"Pending Whisper Shot hit has invalid delay: {pendingHit.DelayRemainingMs}.");
            }
        }

        if (state.IsRunEnded && state.PendingWhisperShotHits.Count > 0)
        {
            throw new InvalidOperationException("Pending Whisper Shot hits must be empty when run is ended.");
        }
    }

    private sealed class StoredBattle
    {
        public StoredBattle(
            string battleId,
            string arenaId,
            string playerActorId,
            string playerClassId,
            ArenaType arenaType,
            ArenaConfig.ElementalArenaConfig.ElementalArenaDef? elementalArenaDef,
            ElementType dailyElement,
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
            int zoneIndex,
            int ultimateGauge,
            bool ultimateReady,
            bool silverTempestActive,
            int silverTempestRemainingMs,
            List<PendingHit> pendingWhisperShotHits,
            bool masteryXpAwardedAtRunEnd)
        {
            BattleId = battleId;
            ArenaId = arenaId;
            PlayerActorId = playerActorId;
            PlayerClassId = playerClassId;
            ArenaType = arenaType;
            ElementalArenaDef = elementalArenaDef;
            DailyElement = dailyElement;
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
            ZoneIndex = zoneIndex;
            UltimateGauge = ultimateGauge;
            UltimateReady = ultimateReady;
            SilverTempestActive = silverTempestActive;
            SilverTempestRemainingMs = silverTempestRemainingMs;
            PendingWhisperShotHits = pendingWhisperShotHits;
            MasteryXpAwardedAtRunEnd = masteryXpAwardedAtRunEnd;
        }

        public object Sync { get; } = new();

        public string BattleId { get; }

        public string ArenaId { get; }

        public string PlayerActorId { get; }

        public string PlayerClassId { get; }

        public ArenaType ArenaType { get; }

        public ArenaConfig.ElementalArenaConfig.ElementalArenaDef? ElementalArenaDef { get; }

        public ElementType? ForcedElement => ElementalArenaDef?.ForcedElement;

        public ElementType DailyElement { get; }

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

        public int MimicAttackCooldownRemainingMs { get; set; }

        public bool BossSpawned { get; set; }

        public long MobSpawnPausedUntilMs { get; set; }

        public int BossAttackCooldownRemainingMs { get; set; }

        public int BossAbilityCooldownRemainingMs { get; set; }

        public int BossMoveCooldownRemainingMs { get; set; }

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

        public ElementType? EquippedWeaponElement { get; set; }

        public ElementType? EquippedWeaponResistanceElement { get; set; }

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

        public int ZoneIndex { get; set; }

        public int UltimateGauge { get; set; }

        public bool UltimateReady { get; set; }

        public bool SilverTempestActive { get; set; }

        public int SilverTempestRemainingMs { get; set; }

        public List<PendingHit> PendingWhisperShotHits { get; }

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

        public int CritChanceBonusPercent { get; set; }

        public int CritDamageBonusPercent { get; set; }

        public int LifeLeechBonusPercent { get; set; }

        public int GlobalCooldownReductionPercent { get; set; }
    }

    public sealed record PendingHit(string TargetActorId, int DamageBase, int DelayRemainingMs);

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
            int? mobSlotIndex,
            bool isMimic = false,
            bool isStunned = false,
            int stunRemainingMs = 0,
            bool isImmobilized = false,
            int immobilizeRemainingMs = 0,
            int sunderBrandStacks = 0,
            int corrosionStacks = 0,
            int focusStacks = 0,
            int deadeyeConsecutiveHits = 0)
        {
            ActorId = actorId;
            Kind = kind;
            MobType = mobType;
            IsElite = isElite;
            IsMimic = isMimic;
            BuffSourceEliteId = buffSourceEliteId;
            FacingDirection = NormalizeDirection(facingDirection) ?? ArenaConfig.FacingUp;
            TileX = tileX;
            TileY = tileY;
            Hp = hp;
            MaxHp = maxHp;
            Shield = shield;
            MaxShield = maxShield;
            MobSlotIndex = mobSlotIndex;
            IsStunned = isStunned;
            StunRemainingMs = Math.Max(0, stunRemainingMs);
            IsImmobilized = isImmobilized;
            ImmobilizeRemainingMs = Math.Max(0, immobilizeRemainingMs);
            SunderBrandStacks = Math.Max(0, sunderBrandStacks);
            CorrosionStacks = Math.Max(0, corrosionStacks);
            FocusStacks = Math.Max(0, focusStacks);
            DeadeyeConsecutiveHits = Math.Max(0, deadeyeConsecutiveHits);
        }

        public string ActorId { get; }

        public string Kind { get; }

        public MobArchetype? MobType { get; }

        public bool IsElite { get; }

        public bool IsMimic { get; }

        public string? BuffSourceEliteId { get; set; }

        public string FacingDirection { get; set; }

        public int TileX { get; set; }

        public int TileY { get; set; }

        public int Hp { get; set; }

        public int MaxHp { get; set; }

        public int Shield { get; set; }

        public int MaxShield { get; set; }

        public int? MobSlotIndex { get; }

        // Mirai — Sunder Brand
        public int SunderBrandStacks { get; set; } = 0;

        // Velvet — Arcane Decay / Corrosion
        public int CorrosionStacks { get; set; } = 0;

        // Sylwen — Deadeye Grace / Focus
        public int FocusStacks { get; set; } = 0;
        public int DeadeyeConsecutiveHits { get; set; } = 0; // resets on target switch

        // Crowd control states
        public bool IsStunned { get; set; } = false;
        public int StunRemainingMs { get; set; } = 0;

        public bool IsImmobilized { get; set; } = false;
        public int ImmobilizeRemainingMs { get; set; } = 0;
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
            int createdTick,
            int damagePerTick = 0)
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
            DamagePerTick = damagePerTick;
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

        public int DamagePerTick { get; }
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

        public MobArchetype Archetype { get; set; }

        public bool IsEliteSlot { get; }

        public int RespawnRemainingMs { get; set; }

        public int AttackCooldownRemainingMs { get; set; }

        public int AbilityCooldownRemainingMs { get; set; }

        public int MoveCooldownRemainingMs { get; set; }

        public int CommitTicksRemaining { get; set; }
    }
}
