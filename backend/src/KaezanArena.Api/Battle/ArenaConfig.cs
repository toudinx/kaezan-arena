using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public static class ArenaConfig
{
    public const int DefaultStepDeltaMs = 250;
    public const int MinStepDeltaMs = 50;
    public const int MaxStepDeltaMs = 2000;
    public const int Width = 7;
    public const int Height = 7;
    public const int PlayerTileX = 3;
    public const int PlayerTileY = 3;
    public const int MaxAliveMobs = 10;
    public const long RunDurationMs = 180_000;
    public const long RunMidgameTargetMs = RunDurationMs / 2;

    #region Player Stats
    public const int PlayerBaseHp = 120;
    public const int PlayerMoveCooldownMs = 300;
    public const int PlayerAutoAttackCooldownMs = 800;
    public const int PlayerGlobalCooldownMs = 400;
    #endregion  

    #region Player Combat
    public const int PlayerAutoAttackDamage = 8;
    public const int PlayerShieldGainPerAction = 2;
    public const int PlayerLifeLeechPercent = 30;
    public const double PlayerDamageVarianceMinMultiplier = 0.90d;
    public const double PlayerDamageVarianceMaxMultiplier = 1.10d;
    public const double MobDamageVarianceMinMultiplier = 0.85d;
    public const double MobDamageVarianceMaxMultiplier = 1.15d;
    public const int CriticalHitChancePercent = 20;
    #endregion

    #region Ranged Weapon Config
    public const int AutoAttackRangedMaxRange = 7;
    public const float RangedProjectileSpeedTiles = 10.0f;
    public const int RangedDefaultCooldownMs = 800;
    #endregion

    #region Sigil Bolt
    public const int SigilBoltDamageBase = 15;
    public const int SigilBoltCooldownMs = 800;
    public const int SigilBoltMaxRange = AutoAttackRangedMaxRange;
    public const bool SigilBoltRequiresLOS = true;
    #endregion

    #region Shotgun
    public const int ShotgunDamageBase = SigilBoltDamageBase;
    public const int ShotgunCooldownMs = SigilBoltCooldownMs;
    public const int ShotgunVisualProjectileCount = 5;  
    public const int ShotgunMaxRange = AutoAttackRangedMaxRange;
    public const bool ShotgunRequiresLOS = true;
    public const int ShotgunKnockbackTiles = 1;
    #endregion

    #region Void Ricochet
    public const int VoidRicochetDamageBase = SigilBoltDamageBase;
    public const int VoidRicochetCooldownMs = 2000;
    // VoidRicochetMaxBounces: base value, can be increased by passive cards.
    public const int VoidRicochetMaxBounces = 3;
    public const int VoidRicochetMaxTotalTiles = 40;
    public const bool VoidRicochetRequiresLOS = false;
    #endregion

    #region Visual / FX Timing
    public const int CritTextDurationMs = 800;
    public const string CritTextLabel = "CRIT!";
    public const int MeleeSwingDurationMs = 120;
    public const int RangedProjectileDurationMs = 220;
    public const int DeathBurstDurationMs = 320;
    public const int CorpseDecalLifetimeMs = 1200;
    #endregion

    #region Mob Spawn & Respawn
    public const int MobRespawnDelayMs = 750;
    public const int MobSpawnRingMinDistance = 2;
    public const int MobSpawnRingMaxDistance = 4;
    public const int EarlyMobConcurrentCap = 2;
    #endregion

    #region Ranged Mob Behavior
    public const int RangedPreferredDistanceMin = 2;
    public const int RangedPreferredDistanceMax = 3;
    public const int RangedApproachDistance = 4;
    public const int RangedCommitWindowTicks = 2;
    #endregion

    #region Skill IDs
    public const string ExoriSkillId = "exori";
    public const string ExoriMasSkillId = "exori_mas";
    public const string ExoriMinSkillId = "exori_min";
    public const string SigilBoltSkillId = "sigil_bolt";
    public const string ShotgunSkillId = "shotgun";
    public const string VoidRicochetSkillId = "void_ricochet";
    public const string HealSkillId = "heal";
    public const string GuardSkillId = "guard";
    public const string AvalancheSkillId = "avalanche";
    #endregion

    #region Skill FX IDs
    public const string ExoriFxId = "fx.skill.exori";
    public const string ExoriMasFxId = "fx.skill.exori_mas";
    public const string ExoriMinFxId = "fx.skill.exori_min";
    public const string HealFxId = "fx.hit.small";
    public const string GuardFxId = "fx.hit.small";
    public const string AvalancheFxId = "fx.skill.exori_mas";
    public const string HitSmallFxId = "fx.hit.small";
    #endregion

    #region Skill Element Types
    public const ElementType ExoriElement = ElementType.Fire;
    public const ElementType ExoriMasElement = ElementType.Energy;
    public const ElementType ExoriMinElement = ElementType.Ice;
    public const ElementType HealElement = ElementType.Holy;
    public const ElementType GuardElement = ElementType.Energy;
    public const ElementType AvalancheElement = ElementType.Ice;
    public const ElementType DefaultMobElement = ElementType.Physical;
    #endregion

    #region Mob FX IDs
    public const string MobCleaveFxId = "fx.mob.brute.cleave";
    public const string MobPowerShotFxId = "fx.mob.archer.power_shot";
    public const string MobDemonBeamFxId = "fx.mob.demon.beam";
    public const string MobShamanStormPulseFxId = "fx.mob.shaman.storm_pulse";
    public const string MobSkeletonSoulBurstFxId = "fx.mob.skeleton.soul_burst";
    public const string MobWogolGroundSlamFxId = "fx.mob.wogol.ground_slam";
    public const string MobWarriorCleaveFxId = "fx.mob.warrior.cleave";
    public const string MobZombieSelfHealFxId = "fx.mob.zombie.self_heal";
    public const string MobImpFireballFxId = "fx.mob.imp.fireball";
    public const string MobSwampyMudLobFxId = "fx.mob.swampy.mud_lob";
    public const string MobMuddyOozeShotFxId = "fx.mob.muddy.ooze_shot";
    #endregion

    #region Skill Cooldowns
    public const int ExoriCooldownTotalMs = 1200;
    public const int ExoriMasCooldownTotalMs = 2000;
    public const int ExoriMinCooldownTotalMs = 800;
    public const int SigilBoltCooldownTotalMs = SigilBoltCooldownMs;
    public const int ShotgunCooldownTotalMs = ShotgunCooldownMs;
    public const int VoidRicochetCooldownTotalMs = VoidRicochetCooldownMs;
    public const int HealCooldownTotalMs = 7000;
    public const int GuardCooldownTotalMs = 10000;
    public const int AvalancheCooldownTotalMs = 2500;
    #endregion

    #region Skill Leveling
    public const int SkillInitialLevel = 1;
    public const int SkillCooldownReductionPerLevelPercent = 4;
    public const int SkillCooldownReductionMaxPercent = 32;
    public const int SkillDefensivePercentBonusPerLevel = 2;
    #endregion

    #region Skill Effects
    public const int AvalancheDamage = 3;
    public const int AvalancheRangeTilesManhattan = 3;
    public const int HealPercentOfMaxHp = 22;
    public const int GuardPercentOfMaxHp = 10;
    #endregion

    public static class UltimateConfig
    {
        public const int GaugeMax = 100;
        public const int GaugePerKill = 12;
        public const int GaugePerDamageTaken = 3; // per damage point received
        public const int BaseDamage = 20;
        public const int AoeRadius = 2;
        public const string UltimateSkillId = "skill:ultimate";
    }

    public static class MasteryConfig
    {
        public const int XpPerRunCompleted = 100;
        public const int XpPerKill = 2;
        public const int XpRequiredPerLevelMultiplier = 120;
        public const int XpRequiredPerLevelBase = 80;
        public const int MasteryLevelCap = 50;
        public const int MilestoneLevelInterval = 10;
        public const int InitialUnlockedSigilSlots = 1;
        public const int MaxUnlockedSigilSlots = 5;

        // Milestone rewards per milestone index (0 = level 10, 1 = level 20, etc.)
        public static readonly int[] KaerosRewardPerMilestone = [30, 40, 50, 60, 100];
        public static readonly int[] EchoFragmentsRewardPerMilestone = [200, 350, 500, 700, 1000];
        public static readonly int[] SigilSlotsUnlockedPerMilestone = [2, 3, 4, 5, 5];

        // Barrier materials
        public const string HollowEssenceId = "material:hollow_essence";
        public const int HollowEssenceCostForMilestone1 = 20; // 10 -> 11
    }

    public static class SigilConfig
    {
        public sealed record SigilPassiveStatProfile(
            int FlatDamageDivisor,
            int PercentDamageDivisor,
            int PercentMaxHpDivisor,
            int CritChanceDivisor,
            int CritDamageDivisor,
            int LifeLeechDivisor,
            int CooldownReductionDivisor);

        public sealed record SigilPassiveStatBundle(
            int FlatDamageBonus = 0,
            int PercentDamageBonus = 0,
            int PercentMaxHpBonus = 0,
            int CritChanceBonusPercent = 0,
            int CritDamageBonusPercent = 0,
            int LifeLeechBonusPercent = 0,
            int GlobalCooldownReductionPercent = 0);

        public static class TierIds
        {
            public const string Hollow = "sigil_tier:hollow";
            public const string Brave = "sigil_tier:brave";
            public const string Awakened = "sigil_tier:awakened";
            public const string Exalted = "sigil_tier:exalted";
            public const string Ascendant = "sigil_tier:ascendant";
        }

        public static class DefinitionIds
        {
            public const string MeleeBrute = "sigil_def:melee_brute";
            public const string RangedArcher = "sigil_def:ranged_archer";
            public const string MeleeDemon = "sigil_def:melee_demon";
            public const string RangedShaman = "sigil_def:ranged_shaman";
        }

        // Slot index (1-based) -> level range [min, max]
        public static readonly (int Min, int Max)[] SlotLevelRanges =
        [
            (1, 20),   // Slot 1 - Hollow
            (21, 40),  // Slot 2 - Brave
            (41, 60),  // Slot 3 - Awakened
            (61, 80),  // Slot 4 - Exalted
            (81, 95)   // Slot 5 - Ascendant tier 5
        ];

        public static readonly string[] SlotTierNames =
            ["Hollow", "Brave", "Awakened", "Exalted", "Ascendant"];

        public static readonly string[] SlotTierIds =
            [TierIds.Hollow, TierIds.Brave, TierIds.Awakened, TierIds.Exalted, TierIds.Ascendant];

        // Stat bonus per sigil level (flat HP bonus for now)
        public const int HpBonusPerSigilLevel = 2;

        // Species IDs that can drop Sigils (mirrors ArenaConfig.SpeciesIds)
        public static readonly string[] ValidSpeciesIds =
            [SpeciesIds.MeleeBrute, SpeciesIds.RangedArcher, SpeciesIds.MeleeDemon, SpeciesIds.RangedShaman];

        public static readonly IReadOnlyDictionary<string, string> DefinitionIdBySpeciesId =
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [SpeciesIds.MeleeBrute] = DefinitionIds.MeleeBrute,
                [SpeciesIds.RangedArcher] = DefinitionIds.RangedArcher,
                [SpeciesIds.MeleeDemon] = DefinitionIds.MeleeDemon,
                [SpeciesIds.RangedShaman] = DefinitionIds.RangedShaman
            };

        public static readonly IReadOnlyDictionary<string, string> SpeciesIdByDefinitionId =
            DefinitionIdBySpeciesId.ToDictionary(entry => entry.Value, entry => entry.Key, StringComparer.Ordinal);

        public const int MaxAdditionalCritChancePercent = 50;
        public const int MaxAdditionalCritDamagePercent = 300;
        public const int MaxAdditionalLifeLeechPercent = 50;

        public static readonly IReadOnlyDictionary<string, SigilPassiveStatProfile> PassiveStatProfilesByDefinitionId =
            new Dictionary<string, SigilPassiveStatProfile>(StringComparer.Ordinal)
            {
                [DefinitionIds.MeleeBrute] = new SigilPassiveStatProfile(
                    FlatDamageDivisor: 0,
                    PercentDamageDivisor: 0,
                    PercentMaxHpDivisor: 4,
                    CritChanceDivisor: 0,
                    CritDamageDivisor: 0,
                    LifeLeechDivisor: 10,
                    CooldownReductionDivisor: 0),
                [DefinitionIds.RangedArcher] = new SigilPassiveStatProfile(
                    FlatDamageDivisor: 0,
                    PercentDamageDivisor: 0,
                    PercentMaxHpDivisor: 0,
                    CritChanceDivisor: 8,
                    CritDamageDivisor: 4,
                    LifeLeechDivisor: 0,
                    CooldownReductionDivisor: 0),
                [DefinitionIds.MeleeDemon] = new SigilPassiveStatProfile(
                    FlatDamageDivisor: 3,
                    PercentDamageDivisor: 10,
                    PercentMaxHpDivisor: 0,
                    CritChanceDivisor: 0,
                    CritDamageDivisor: 0,
                    LifeLeechDivisor: 0,
                    CooldownReductionDivisor: 0),
                [DefinitionIds.RangedShaman] = new SigilPassiveStatProfile(
                    FlatDamageDivisor: 0,
                    PercentDamageDivisor: 8,
                    PercentMaxHpDivisor: 0,
                    CritChanceDivisor: 0,
                    CritDamageDivisor: 0,
                    LifeLeechDivisor: 0,
                    CooldownReductionDivisor: 10)
            };

        // Sigil drops
        public const int SigilDropChancePercent = 8; // per kill of the species
        public const int HollowSigilLevelMin = 1;
        public const int HollowSigilLevelMax = 20;

        public static bool IsValidSlotIndex(int slotIndex)
        {
            return slotIndex >= 1 && slotIndex <= SlotLevelRanges.Length;
        }

        public static bool IsValidSpeciesId(string speciesId)
        {
            return ValidSpeciesIds.Contains(speciesId, StringComparer.Ordinal);
        }

        public static string ResolveTierIdForSlotIndex(int slotIndex)
        {
            var safeIndex = Math.Clamp(slotIndex, 1, SlotTierIds.Length);
            return SlotTierIds[safeIndex - 1];
        }

        public static string ResolveTierNameForSlotIndex(int slotIndex)
        {
            var safeIndex = Math.Clamp(slotIndex, 1, SlotTierNames.Length);
            return SlotTierNames[safeIndex - 1];
        }

        public static string ResolveDefinitionIdForSpeciesId(string speciesId)
        {
            if (DefinitionIdBySpeciesId.TryGetValue(speciesId, out var definitionId))
            {
                return definitionId;
            }

            return $"sigil_def:{speciesId}";
        }

        public static SigilPassiveStatBundle ResolvePassiveStatBundle(string definitionId, int sigilLevel)
        {
            var safeLevel = Math.Max(1, sigilLevel);
            if (!PassiveStatProfilesByDefinitionId.TryGetValue(definitionId, out var profile))
            {
                return new SigilPassiveStatBundle();
            }

            return new SigilPassiveStatBundle(
                FlatDamageBonus: ResolveSigilStatByDivisor(safeLevel, profile.FlatDamageDivisor),
                PercentDamageBonus: ResolveSigilStatByDivisor(safeLevel, profile.PercentDamageDivisor),
                PercentMaxHpBonus: ResolveSigilStatByDivisor(safeLevel, profile.PercentMaxHpDivisor),
                CritChanceBonusPercent: ResolveSigilStatByDivisor(safeLevel, profile.CritChanceDivisor),
                CritDamageBonusPercent: ResolveSigilStatByDivisor(safeLevel, profile.CritDamageDivisor),
                LifeLeechBonusPercent: ResolveSigilStatByDivisor(safeLevel, profile.LifeLeechDivisor),
                GlobalCooldownReductionPercent: ResolveSigilStatByDivisor(safeLevel, profile.CooldownReductionDivisor));
        }

        private static int ResolveSigilStatByDivisor(int level, int divisor)
        {
            if (divisor <= 0)
            {
                return 0;
            }

            return Math.Max(0, level / divisor);
        }
    }

    public static class ZoneConfig
    {
        public const int ZoneCount = 5;
        public const int AccountLevelCap = 100;
        public static readonly int[] AccountLevelToUnlockZone = [1, 21, 41, 61, 81];

        // HP and damage multipliers per zone (applied on top of existing run scaling)
        public static readonly float[] ZoneHpMultiplier = [1.0f, 1.5f, 2.2f, 3.2f, 4.5f];
        public static readonly float[] ZoneDmgMultiplier = [1.0f, 1.4f, 2.0f, 2.8f, 3.8f];

        // Account XP sources
        public const int AccountXpPerRunCompleted = 50;
        public const int AccountXpPerKill = 1;

        // XP required per account level (linear: level * 200 + 100)
        public static int XpRequiredForLevel(int level) => (Math.Max(1, level) * 200) + 100;
    }

    public static class BestiaryConfig
    {
        /// <summary>Single source of truth for kill thresholds per rank. Index = rank-1 (0-based). Length = MaxRank.</summary>
        public static readonly int[] RankKillThresholds = [0, 10, 30, 60, 100];
        public const int MaxRank = 5;

        /// <summary>
        /// Tier index (0-based) → species IDs required for Ascendant unlock.
        /// Empty arrays mark future tiers not yet implemented.
        /// </summary>
        public static readonly string[][] TierSpecies =
        [
            [SpeciesIds.MeleeBrute, SpeciesIds.RangedArcher, SpeciesIds.MeleeDemon, SpeciesIds.RangedShaman, SpeciesIds.MeleeSkeleton, SpeciesIds.MeleeWogol, SpeciesIds.MeleeWarrior, SpeciesIds.MeleeZombie, SpeciesIds.MeleeTinyZombie, SpeciesIds.RangedImp, SpeciesIds.RangedSwampy, SpeciesIds.RangedMuddy, SpeciesIds.MeleeSlug], // Hollow — Ascendant 96
            [], // Brave — future
            [], // Awakened — future
            [], // Exalted — future
            [], // Ascendant tier 5 — future
        ];

        /// <summary>Tier index (0-based) → Sigil slot index (1-based) that gets the Ascendant upgrade.</summary>
        public static readonly int[] TierToSigilSlot = [1, 2, 3, 4, 5];
    }

    public static class ContractConfig
    {
        public const int DailyContractCount = 3;
        public const int KaerosRewardPerContract = 20;
        public const int AccountXpRewardPerContract = 80;

        // Contract type IDs
        public const string TypeCompleteRun = "complete_run";
        public const string TypeReachRunLevel = "reach_run_level";
        public const string TypeKillCount = "kill_count";
        public const string TypeOpenChests = "open_chests";
        public const string TypeKillElites = "kill_elites";
    }

    #region Player Class
    public const int KinaReflectPercent = 20;
    public const int KinaRangedReflectMultiplier = 2;
    public const string PlayerClassKina = "kina";
    public const string PlayerClassRangedPrototype = "ranged_prototype";
    public const string CharacterSubtitleKina = "Melee Kit";
    public const string CharacterSubtitleRangedPrototype = "Ranged Kit [WIP]";
    public const string CharacterSubtitleLizard = "Melee Kit [WIP]";
    #endregion

    #region Run Progression
    public const int RunInitialLevel = 1;
    public const int RunInitialXp = 0;
    public const int NormalMobKillXp = 10;
    public const int EliteMobKillXp = 10;
    public const int RunLevelXpBase = 60;
    public const int RunLevelXpIncrementPerLevel = 40;
    #endregion

    #region Card System
    public const int MaxCardOfferCount = 3;
    public const int MaxCardSelectionsPerRun = 12;
    public const int MaxDistinctPassiveCards = 4;
    public const int MaxGlobalCooldownReductionPercent = 60;
    public const string CardTagOffense = "offense";
    public const string CardTagDefense = "defense";
    public const string CardTagUtility = "utility";
    public const string CardTagSustain = "sustain";
    public const string CardTagMobility = "mobility";
    public const string CardTagSkill = "skill";
    #endregion

    #region Mob Scaling Multipliers
    public const double MobHpMultStart = 1.0d;
    public const double MobHpMultEnd = 3.2d;
    public const double MobDmgMultStart = 0.70d;
    public const double MobDmgMultEnd = 2.6d;
    public const double EliteHpMultiplierFactor = 1.35d;
    public const double EliteDmgMultiplierFactor = 1.30d;
    public const bool IsRunLevelHpSeasoningEnabled = true;
    public const double RunLevelHpSeasoningPerLevel = 0.015d;
    #endregion

    #region Elite Commander System
    public const int EliteCommanderMaxBuffTargets = 3;
    public const int EliteCommanderDamageBonusPercent = 40;
    public const int EliteCommanderAttackSpeedBonusPercent = 30;
    #endregion

    #region Battle Status Strings
    public const string StatusStarted = "started";
    public const string StatusDefeat = "defeat";
    public const string StatusVictory = "victory";
    public const string RunEndReasonVictoryTime = "victory_time";
    public const string RunEndReasonDefeatDeath = "defeat_death";
    #endregion

    #region Facing Direction Strings
    public const string FacingUp = "up";
    public const string FacingUpRight = "up_right";
    public const string FacingDown = "down";
    public const string FacingDownRight = "down_right";
    public const string FacingLeft = "left";
    public const string FacingRight = "right";
    public const string FacingDownLeft = "down_left";
    public const string FacingUpLeft = "up_left";
    #endregion

    #region Command Type Strings
    public const string CastSkillCommandType = "cast_skill";
    public const string SetFacingCommandType = "set_facing";
    public const string MovePlayerCommandType = "move_player";
    public const string InteractPoiCommandType = "interact_poi";
    public const string SetTargetCommandType = "set_target";
    public const string SetGroundTargetCommandType = "set_ground_target";
    public const string SetAssistConfigCommandType = "set_assist_config";
    public const string SetPausedCommandType = "set_paused";
    #endregion

    #region Assist System
    public const string AssistReasonAutoHeal = "auto_heal";
    public const string AssistReasonAutoGuard = "auto_guard";
    public const string AssistReasonAutoOffense = "auto_offense";
    public const string AssistOffenseModeCooldownSpam = "cooldown_spam";
    public const string AssistOffenseModeSmart = "smart";
    public const int AssistDefaultHealAtHpPercent = 40;
    public const int AssistDefaultGuardAtHpPercent = 60;
    public const int AssistDefaultMaxAutoCastsPerTick = 1;
    #endregion

    #region Reject / Error Reason Strings
    public const string UnknownCommandReason = "unknown_command";
    public const string UnknownSkillReason = "unknown_skill";
    public const string UnknownDirectionReason = "unknown_direction";
    public const string InvalidGroundTargetReason = "invalid_ground_target";
    public const string NoTargetReason = "no_target";
    public const string OutOfRangeReason = "out_of_range";
    public const string CooldownReason = "cooldown";
    public const string GlobalCooldownReason = "global_cooldown";
    public const string MoveBlockedReason = "move_blocked";
    public const string UnknownPoiReason = "unknown_poi";
    public const string PlayerDeadReason = "player_dead";
    public const string NotStartedReason = "not_started";
    public const string DefeatReason = "defeat";
    public const string PausedReason = "paused";
    public const string AwaitingCardChoiceReason = "awaiting_card_choice";
    #endregion

    #region Move Status / Reason Strings
    public const string MoveStatusAccepted = "Accepted";
    public const string MoveStatusBlocked = "Blocked";
    public const string MoveReasonNone = "None";
    public const string MoveReasonOccupied = "Occupied";
    public const string MoveReasonCornerBlock = "CornerBlock";
    public const string MoveReasonCooldown = "Cooldown";
    public const string MoveReasonOutOfBounds = "OutOfBounds";
    #endregion

    #region Legacy End Reason Strings
    public const string EndReasonDeath = "death";
    public const string EndReasonTime = "time";
    #endregion

    #region POI Type Strings
    public const string PoiTypeChest = "chest";
    public const string PoiTypeSpeciesChest = "species_chest";
    public const string PoiTypeAltar = "altar";
    #endregion

    #region Buff IDs
    public const string HealingAmplifierBuffId = "healing_amplifier";
    public const string AntiRangedPressureBuffId = "anti_ranged_pressure";
    public const string ThornsBoostBuffId = "thorns_boost";
    public const string DamageBoostBuffId = "damage_boost";
    #endregion

    #region POI Spawn Parameters
    public const int PoiSpawnMaxChebyshev = 2;
    public const int AltarSpawnCheckMs = 9000;
    public const int AltarSpawnChancePercent = 35;
    public const int AltarLifetimeMs = 10000;
    public const int AltarCooldownMs = 12000;
    public const int AltarSummonSpawnCount = 2;
    public const int ChestSpawnCheckMs = 65_000;
    public const int ChestSpawnChancePercent = 90;
    public const int MaxChestsPerRun = 3;
    public const int ChestLifetimeMs = 10000;
    public const int SpeciesChestLifetimeMs = 10000;
    #endregion

    #region Buff Bonus Values
    public const int HealAmplifierBonusPercent = 10;
    public const int AntiRangedPressureReductionPercent = 20;
    public const int ThornsBoostBonusPercent = 30;
    public const int DamageBoostBonusPercent = 25;
    #endregion

    #region Bestiary Thresholds
    public const int BestiaryFirstChestBaseKills = 150;
    public const int BestiaryFirstChestRandomInclusiveMax = 30;
    public const int BestiaryChestIncrementBaseKills = 300;
    public const int BestiaryChestIncrementRandomInclusiveMax = 50;
    public const string InitialChestPoiId = "poi.chest.0000";
    #endregion

    #region Mob Config Values
    public const int MeleeBruteMaxHp = 90;
    public const int MeleeBruteMoveCooldownMs = 500;
    public const int MeleeBruteAutoAttackRangeTiles = 1;
    public const int MeleeBruteAutoAttackDamage = 2;
    public const int MeleeBruteAutoAttackCooldownMs = 1000;
    public const int MeleeBruteAbilityDamage = 5;
    public const int MeleeBruteAbilityRangeTiles = 1;
    public const int MeleeBruteAbilityCooldownMs = 2500;
    public const int RangedArcherMaxHp = 70;
    public const int RangedArcherMoveCooldownMs = 500;
    public const int RangedArcherAutoAttackRangeTiles = 4;
    public const int RangedArcherAutoAttackDamage = 1;
    public const int RangedArcherAutoAttackCooldownMs = 1250;
    public const int RangedArcherAbilityDamage = 3;
    public const int RangedArcherAbilityRangeTiles = 4;
    public const int RangedArcherAbilityCooldownMs = 2800;
    public const int MeleeDemonMaxHp = 104;
    public const int MeleeDemonMoveCooldownMs = 500;
    public const int MeleeDemonAutoAttackRangeTiles = 1;
    public const int MeleeDemonAutoAttackDamage = 2;
    public const int MeleeDemonAutoAttackCooldownMs = 1000;
    public const int MeleeDemonAbilityDamage = 6;
    public const int MeleeDemonAbilityRangeTiles = 4;
    public const int MeleeDemonAbilityCooldownMs = 3000;
    public const int RangedShamanMaxHp = 100;
    public const int RangedShamanMoveCooldownMs = 500;
    public const int RangedShamanAutoAttackRangeTiles = 4;
    public const int RangedShamanAutoAttackDamage = 1;
    public const int RangedShamanAutoAttackCooldownMs = 1250;
    public const int RangedShamanAbilityDamage = 4;
    public const int RangedShamanAbilityRangeTiles = 2;
    public const int RangedShamanAbilityCooldownMs = 3600;
    public const int MeleeSkeletonMaxHp = 55;
    public const int MeleeSkeletonMoveCooldownMs = 350;
    public const int MeleeSkeletonAutoAttackRangeTiles = 1;
    public const int MeleeSkeletonAutoAttackDamage = 1;
    public const int MeleeSkeletonAutoAttackCooldownMs = 800;
    public const int MeleeSkeletonAbilityDamage = 3;
    public const int MeleeSkeletonAbilityRangeTiles = 1;
    public const int MeleeSkeletonAbilityCooldownMs = 99999;
    public const int MeleeWogolMaxHp = 85;
    public const int MeleeWogolMoveCooldownMs = 400;
    public const int MeleeWogolAutoAttackRangeTiles = 1;
    public const int MeleeWogolAutoAttackDamage = 3;
    public const int MeleeWogolAutoAttackCooldownMs = 900;
    public const int MeleeWogolAbilityDamage = 5;
    public const int MeleeWogolAbilityRangeTiles = 1;
    public const int MeleeWogolAbilityCooldownMs = 2800;
    public const int MeleeWarriorMaxHp = 75;
    public const int MeleeWarriorMoveCooldownMs = 380;
    public const int MeleeWarriorAutoAttackRangeTiles = 1;
    public const int MeleeWarriorAutoAttackDamage = 4;
    public const int MeleeWarriorAutoAttackCooldownMs = 800;
    public const int MeleeWarriorAbilityDamage = 6;
    public const int MeleeWarriorAbilityRangeTiles = 1;
    public const int MeleeWarriorAbilityCooldownMs = 2500;
    public const int MeleeZombieMaxHp = 90;
    public const int MeleeZombieMoveCooldownMs = 550;
    public const int MeleeZombieAutoAttackRangeTiles = 1;
    public const int MeleeZombieAutoAttackDamage = 2;
    public const int MeleeZombieAutoAttackCooldownMs = 1100;
    public const int MeleeZombieAbilityDamage = 0;
    public const int MeleeZombieAbilityRangeTiles = 0;
    public const int MeleeZombieAbilityCooldownMs = 4000;
    public const int MeleeZombieSelfHealAmount = 12;
    public const int MeleeTinyZombieMaxHp = 30;
    public const int MeleeTinyZombieMoveCooldownMs = 320;
    public const int MeleeTinyZombieAutoAttackRangeTiles = 1;
    public const int MeleeTinyZombieAutoAttackDamage = 1;
    public const int MeleeTinyZombieAutoAttackCooldownMs = 700;
    public const int MeleeTinyZombieAbilityDamage = 0;
    public const int MeleeTinyZombieAbilityRangeTiles = 0;
    public const int MeleeTinyZombieAbilityCooldownMs = 99999;
    public const int RangedImpMaxHp = 55;
    public const int RangedImpMoveCooldownMs = 380;
    public const int RangedImpAutoAttackRangeTiles = 4;
    public const int RangedImpAutoAttackDamage = 2;
    public const int RangedImpAutoAttackCooldownMs = 800;
    public const int RangedImpAbilityDamage = 2;
    public const int RangedImpAbilityRangeTiles = 4;
    public const int RangedImpAbilityCooldownMs = 2200;
    public const int RangedSwampyMaxHp = 110;
    public const int RangedSwampyMoveCooldownMs = 600;
    public const int RangedSwampyAutoAttackRangeTiles = 3;
    public const int RangedSwampyAutoAttackDamage = 2;
    public const int RangedSwampyAutoAttackCooldownMs = 1400;
    public const int RangedSwampyAbilityDamage = 3;
    public const int RangedSwampyAbilityRangeTiles = 3;
    public const int RangedSwampyAbilityCooldownMs = 3500;
    public const int RangedSwampyMudLobDecalDurationMs = 3000;
    public const int RangedSwampyMudLobDecalDamagePerTick = 1;
    public const int RangedMuddyMaxHp = 70;
    public const int RangedMuddyMoveCooldownMs = 480;
    public const int RangedMuddyAutoAttackRangeTiles = 2;
    public const int RangedMuddyAutoAttackDamage = 2;
    public const int RangedMuddyAutoAttackCooldownMs = 1000;
    public const int RangedMuddyAbilityDamage = 3;
    public const int RangedMuddyAbilityRangeTiles = 2;
    public const int RangedMuddyAbilityCooldownMs = 2800;
    public const int RangedMuddyPreferredDistanceMin = 1;
    public const int RangedMuddyPreferredDistanceMax = 2;
    public const int MeleeSlugMaxHp = 100;
    public const int MeleeSlugMoveCooldownMs = 700;
    public const int MeleeSlugAutoAttackRangeTiles = 1;
    public const int MeleeSlugAutoAttackDamage = 3;
    public const int MeleeSlugAutoAttackCooldownMs = 1500;
    public const int MeleeSlugAbilityDamage = 0;
    public const int MeleeSlugAbilityRangeTiles = 0;
    public const int MeleeSlugAbilityCooldownMs = 99999;
    #endregion

    #region Batch Processing
    public const int MaxBatchStepCount = 16;
    #endregion

    #region Initial State Values
    public const int InitialChestSpawnCheckAtMs = 45_000;
    #endregion

    #region Stable Entity IDs
    /// <summary>Stable weapon (skill) IDs. Values are the authoritative keys for display name lookup.</summary>
    public static class WeaponIds
    {
        public const string ExoriMin  = "weapon:exori_min";
        public const string Exori     = "weapon:exori";
        public const string ExoriMas  = "weapon:exori_mas";
        public const string SigilBolt = "weapon:sigil_bolt";
        public const string ShotgunId = "weapon:shotgun";
        public const string VoidRicochetId = "weapon:void_ricochet";
        public const string Avalanche = "weapon:avalanche";
        public const string Heal      = "weapon:heal";
        public const string Guard     = "weapon:guard";
    }

    /// <summary>
    /// Single source of truth for projectile tint colors used by ranged weapon visuals.
    /// Keys are stable IDs from <see cref="WeaponIds"/>.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> RangedProjectileColorByWeaponId =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            [WeaponIds.ExoriMin] = "#7dd3fc",
            [WeaponIds.Exori] = "#ff9f2d",
            [WeaponIds.ExoriMas] = "#a78bfa",
            [WeaponIds.SigilBolt] = "#22d3ee",
            [WeaponIds.ShotgunId] = "#fb7185",
            [WeaponIds.VoidRicochetId] = "#8b5cf6",
            [WeaponIds.Avalanche] = "#93c5fd",
            [WeaponIds.Heal] = "#fde68a",
            [WeaponIds.Guard] = "#93c5fd"
        };

    /// <summary>Stable character IDs. Values are the authoritative keys for display name lookup.</summary>
    public static class CharacterIds
    {
        public const string Kina = "character:kina";
        public const string RangedPrototype = "character:ranged_prototype";
        public const string Lizard = "character:lizard";
        /// <summary>Legacy character ID for Kaelis Dawn (persisted before stable ID migration). Maps to the Kina melee kit.</summary>
        public const string KaelisDawn = "kaelis_01";
        /// <summary>Legacy character ID for Kaelis Ember (persisted before stable ID migration). Maps to the Ranged Prototype kit.</summary>
        public const string KaelisEmber = "kaelis_02";
    }

    /// <summary>
    /// Single source of truth for fixed-kit weapon IDs by character.
    /// The list order represents fixed slot order.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> FixedWeaponKitByCharacterId =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [CharacterIds.Kina] =
            [
                WeaponIds.ExoriMin,
                WeaponIds.Exori,
                WeaponIds.ExoriMas
            ],
            [CharacterIds.RangedPrototype] =
            [
                WeaponIds.SigilBolt,
                WeaponIds.ShotgunId,
                WeaponIds.VoidRicochetId
            ],
            [CharacterIds.Lizard] =
            [
                WeaponIds.ExoriMin,
                WeaponIds.Exori,
                WeaponIds.ExoriMas
            ],
            [CharacterIds.KaelisDawn] =
            [
                WeaponIds.ExoriMin,
                WeaponIds.Exori,
                WeaponIds.ExoriMas
            ],
            [CharacterIds.KaelisEmber] =
            [
                WeaponIds.SigilBolt,
                WeaponIds.ShotgunId,
                WeaponIds.VoidRicochetId
            ]
        };

    /// <summary>Returns fixed-kit weapon IDs for a character, defaulting to Kina when unknown.</summary>
    public static IReadOnlyList<string> GetFixedWeaponKitForCharacterId(string characterId)
    {
        if (FixedWeaponKitByCharacterId.TryGetValue(characterId, out var fixedKit))
        {
            return fixedKit;
        }

        return FixedWeaponKitByCharacterId[CharacterIds.Kina];
    }

    /// <summary>Stable mob species ID strings. Values match the protocol species field used in snapshots.</summary>
    public static class SpeciesIds
    {
        public const string MeleeBrute      = "melee_brute";
        public const string RangedArcher    = "ranged_archer";
        public const string MeleeDemon      = "melee_demon";
        public const string RangedShaman    = "ranged_shaman";
        public const string MeleeSkeleton   = "melee_skeleton";
        public const string MeleeWogol      = "melee_wogol";
        public const string MeleeWarrior    = "melee_warrior";
        public const string MeleeZombie     = "melee_zombie";
        public const string MeleeTinyZombie = "melee_tiny_zombie";
        public const string RangedImp       = "ranged_imp";
        public const string RangedSwampy    = "ranged_swampy";
        public const string RangedMuddy     = "ranged_muddy";
        public const string MeleeSlug       = "melee_slug";
    }
    #endregion

    #region Display Names
    /// <summary>
    /// Single source of truth for all entity display names.
    /// Keys are stable IDs from <see cref="WeaponIds"/>, <see cref="CharacterIds"/>, and <see cref="SpeciesIds"/>.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> DisplayNames =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            [WeaponIds.ExoriMin]        = "Exori Min",
            [WeaponIds.Exori]           = "Exori",
            [WeaponIds.ExoriMas]        = "Exori Mas",
            [WeaponIds.SigilBolt]       = "Sigil Bolt",
            [WeaponIds.ShotgunId]       = "Shotgun",
            [WeaponIds.VoidRicochetId]  = "Void Ricochet",
            [WeaponIds.Avalanche]       = "Avalanche",
            [WeaponIds.Heal]            = "Heal",
            [WeaponIds.Guard]           = "Guard",
            [CharacterIds.Kina]            = "Kina",
            [CharacterIds.RangedPrototype] = "Prototype",
            [CharacterIds.Lizard]          = "Kaelis Vex",
            [CharacterIds.KaelisDawn]      = "Kaelis Dawn",
            [CharacterIds.KaelisEmber]     = "Kaelis Ember",
            [SpeciesIds.MeleeBrute]      = "Melee Brute",
            [SpeciesIds.RangedArcher]    = "Ranged Archer",
            [SpeciesIds.MeleeDemon]      = "Melee Demon",
            [SpeciesIds.RangedShaman]    = "Hollow Shaman",
            [SpeciesIds.MeleeSkeleton]   = "Hollow Skeleton",
            [SpeciesIds.MeleeWogol]      = "Hollow Wogol",
            [SpeciesIds.MeleeWarrior]    = "Hollow Warrior",
            [SpeciesIds.MeleeZombie]     = "Hollow Zombie",
            [SpeciesIds.MeleeTinyZombie] = "Hollow Tiny Zombie",
            [SpeciesIds.RangedImp]       = "Hollow Imp",
            [SpeciesIds.RangedSwampy]    = "Hollow Swampy",
            [SpeciesIds.RangedMuddy]     = "Hollow Muddy",
            [SpeciesIds.MeleeSlug]       = "Hollow Slug",
        };

    // Maps simulation skill logic IDs to stable WeaponIds for display name resolution.
    private static readonly IReadOnlyDictionary<string, string> SkillIdToWeaponId =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            [ExoriSkillId]     = WeaponIds.Exori,
            [ExoriMinSkillId]  = WeaponIds.ExoriMin,
            [ExoriMasSkillId]  = WeaponIds.ExoriMas,
            [SigilBoltSkillId] = WeaponIds.SigilBolt,
            [ShotgunSkillId]   = WeaponIds.ShotgunId,
            [VoidRicochetSkillId] = WeaponIds.VoidRicochetId,
            [AvalancheSkillId] = WeaponIds.Avalanche,
            [HealSkillId]      = WeaponIds.Heal,
            [GuardSkillId]     = WeaponIds.Guard,
        };

    /// <summary>Returns the display name for a simulation skill ID, or null if not found.</summary>
    public static string? GetSkillDisplayName(string skillId) =>
        SkillIdToWeaponId.TryGetValue(skillId, out var weaponId) &&
        DisplayNames.TryGetValue(weaponId, out var name)
            ? name
            : null;

    // Maps stable WeaponIds back to simulation skill logic IDs.
    private static readonly IReadOnlyDictionary<string, string> WeaponIdToSkillId =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            [WeaponIds.Exori]     = ExoriSkillId,
            [WeaponIds.ExoriMin]  = ExoriMinSkillId,
            [WeaponIds.ExoriMas]  = ExoriMasSkillId,
            [WeaponIds.SigilBolt] = SigilBoltSkillId,
            [WeaponIds.ShotgunId] = ShotgunSkillId,
            [WeaponIds.VoidRicochetId] = VoidRicochetSkillId,
            [WeaponIds.Avalanche] = AvalancheSkillId,
            [WeaponIds.Heal]      = HealSkillId,
            [WeaponIds.Guard]     = GuardSkillId,
        };

    /// <summary>Returns the simulation skill ID for a stable weapon ID, or null if not found.</summary>
    public static string? GetSkillIdForWeaponId(string weaponId) =>
        WeaponIdToSkillId.TryGetValue(weaponId, out var skillId) ? skillId : null;
    #endregion

    public static int NormalizeStepDeltaMs(int? configuredStepDeltaMs)
    {
        if (!configuredStepDeltaMs.HasValue)
        {
            return DefaultStepDeltaMs;
        }

        return Math.Clamp(configuredStepDeltaMs.Value, MinStepDeltaMs, MaxStepDeltaMs);
    }
}
