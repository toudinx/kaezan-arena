namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private static SpawnPacingDirector ResolveSpawnPacingDirector(StoredBattle state)
    {
        var nowMs = GetElapsedMsForTick(state.Tick);
        var clampedNowMs = Math.Clamp(nowMs, 0L, (long)ArenaConfig.RunDurationMs);
        var normalizedRunProgress = ArenaConfig.RunDurationMs <= 0
            ? 1.0d
            : clampedNowMs / (double)ArenaConfig.RunDurationMs;

        var baseMaxAlive = EarlyMobConcurrentCap + (int)Math.Floor(
            (ArenaConfig.MaxAliveMobs - EarlyMobConcurrentCap) * normalizedRunProgress);
        var killDrivenMobCapBonus = Math.Min(1, Math.Max(0, state.TotalKills) / 70);
        var maxAliveMobs = Math.Clamp(
            baseMaxAlive + killDrivenMobCapBonus,
            EarlyMobConcurrentCap,
            ArenaConfig.MaxAliveMobs);

        var timeDrivenEliteBonus = (int)Math.Floor(40d * normalizedRunProgress);
        var killDrivenEliteBonus = Math.Min(25, Math.Max(0, state.TotalKills) / 8);
        var eliteSpawnChancePercent = Math.Clamp(
            25 + timeDrivenEliteBonus + killDrivenEliteBonus,
            25,
            90);

        return new SpawnPacingDirector(
            MaxAliveMobs: maxAliveMobs,
            EliteSpawnChancePercent: eliteSpawnChancePercent);
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

        var nowMs = GetElapsedMsForTick(state.Tick);
        var scaling = ResolveScalingDirectorV2(nowMs, state.RunLevel);
        var adjusted = ScaleByMultiplier(
            baseDamage,
            attacker.IsElite
                ? scaling.EliteDmgMult
                : scaling.NormalDmgMult);

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
        var nowMs = GetElapsedMsForTick(state.Tick);
        var scaling = ResolveScalingDirectorV2(nowMs, state.RunLevel);
        return ScaleByMultiplier(
            config.MaxHp,
            isElite
                ? scaling.EliteHpMult
                : scaling.NormalHpMult);
    }

    private static ScalingDirectorV2 ResolveScalingDirectorV2(long nowMs, int runLevel)
    {
        var t = Clamp01(Math.Max(0L, nowMs) / (double)ArenaConfig.RunDurationMs);
        var baseNormalHpMult = Lerp(MobHpMultStart, MobHpMultEnd, t);
        var normalDmgMult = Lerp(MobDmgMultStart, MobDmgMultEnd, t);
        var baseEliteHpMult = baseNormalHpMult * EliteHpMultiplierFactor;
        var eliteDmgMult = normalDmgMult * EliteDmgMultiplierFactor;

        var lvlFactor = IsRunLevelHpSeasoningEnabled
            ? ResolveRunLevelHpFactor(runLevel)
            : 1.0d;
        return new ScalingDirectorV2(
            NormalHpMult: baseNormalHpMult * lvlFactor,
            NormalDmgMult: normalDmgMult,
            EliteHpMult: baseEliteHpMult * lvlFactor,
            EliteDmgMult: eliteDmgMult,
            LvlFactor: lvlFactor,
            IsLvlFactorEnabled: IsRunLevelHpSeasoningEnabled);
    }

    private static double ResolveRunLevelHpFactor(int runLevel)
    {
        var clampedRunLevel = Math.Max(RunInitialLevel, runLevel);
        return 1.0d + (RunLevelHpSeasoningPerLevel * (clampedRunLevel - RunInitialLevel));
    }

    private static int ScaleByMultiplier(int baseValue, double multiplier)
    {
        if (baseValue <= 0)
        {
            return 0;
        }

        var clampedMultiplier = Math.Max(0d, multiplier);
        var scaled = (int)Math.Round(baseValue * clampedMultiplier, MidpointRounding.AwayFromZero);
        return Math.Max(1, scaled);
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
                state,
                baseDamage,
                PlayerDamageVarianceMinMultiplier,
                PlayerDamageVarianceMaxMultiplier);
        }

        return RollDamage(
            state,
            baseDamage,
            MobDamageVarianceMinMultiplier,
            MobDamageVarianceMaxMultiplier);
    }

    private static int RollDamage(StoredBattle state, int baseDamage, double minMultiplier, double maxMultiplier)
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
        var multiplier = clampedMin + ((clampedMax - clampedMin) * NextUnitDoubleFromBattleRng(state));
        var scaledDamage = baseDamage * multiplier;
        var flooredDamage = (int)Math.Floor(scaledDamage);
        var fractionalDamage = Math.Clamp(scaledDamage - flooredDamage, 0d, 1d);

        var rolledDamage = flooredDamage;
        if (fractionalDamage > 0d && NextUnitDoubleFromBattleRng(state) < fractionalDamage)
        {
            rolledDamage += 1;
        }

        return Math.Max(1, rolledDamage);
    }
}
