namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private static readonly IReadOnlyDictionary<string, int> SkillBaseCooldownTotalMsById =
        new Dictionary<string, int>(StringComparer.Ordinal)
        {
            [ArenaConfig.ExoriSkillId] = ArenaConfig.ExoriCooldownTotalMs,
            [ArenaConfig.ExoriMasSkillId] = ArenaConfig.ExoriMasCooldownTotalMs,
            [ArenaConfig.ExoriMinSkillId] = ArenaConfig.ExoriMinCooldownTotalMs,
            [ArenaConfig.SigilBoltSkillId] = ArenaConfig.SigilBoltCooldownTotalMs,
            [ArenaConfig.ShotgunSkillId] = ArenaConfig.ShotgunCooldownTotalMs,
            [ArenaConfig.VoidRicochetSkillId] = ArenaConfig.VoidRicochetCooldownTotalMs,
            [ArenaConfig.HealSkillId] = ArenaConfig.HealCooldownTotalMs,
            [ArenaConfig.GuardSkillId] = ArenaConfig.GuardCooldownTotalMs,
            [ArenaConfig.AvalancheSkillId] = ArenaConfig.AvalancheCooldownTotalMs,
            [ArenaConfig.SkillIds.MiraiRendClaw] = ArenaConfig.SkillConfig.MiraiRendClawCooldownMs,
            [ArenaConfig.SkillIds.MiraiPrimalRoar] = ArenaConfig.SkillConfig.MiraiPrimalRoarCooldownMs,
            [ArenaConfig.SkillIds.MiraiCollapseField] = ArenaConfig.SkillConfig.MiraiCollapseFieldCooldownMs,
            [ArenaConfig.SkillIds.SylwenWhisperShot] = ArenaConfig.SkillConfig.SylwenWhisperShotCooldownMs,
            [ArenaConfig.SkillIds.SylwenGalePierce] = ArenaConfig.SkillConfig.SylwenGalePierceCooldownMs,
            [ArenaConfig.SkillIds.SylwenWindBreak] = ArenaConfig.SkillConfig.SylwenWindBreakCooldownMs,
            [ArenaConfig.SkillIds.VelvetVoidChain] = ArenaConfig.SkillConfig.VelvetVoidChainCooldownMs,
            [ArenaConfig.SkillIds.VelvetUmbralPath] = ArenaConfig.SkillConfig.VelvetUmbralPathCooldownMs,
            [ArenaConfig.SkillIds.VelvetDeathStrike] = ArenaConfig.SkillConfig.VelvetDeathStrikeCooldownMs
        };

    private static Dictionary<string, StoredSkill> BuildInitialSkills(string playerClassId)
    {
        var skills = new Dictionary<string, StoredSkill>(StringComparer.Ordinal);
        foreach (var skillId in ResolveFixedSkillIdsForPlayerClass(playerClassId))
        {
            skills[skillId] = new StoredSkill(
                skillId: skillId,
                cooldownRemainingMs: 0,
                cooldownTotalMs: ResolveBaseSkillCooldownTotalMs(skillId),
                level: ArenaConfig.SkillInitialLevel);
        }

        return skills;
    }

    private static int ResolveBaseSkillCooldownTotalMs(string skillId)
    {
        if (SkillBaseCooldownTotalMsById.TryGetValue(skillId, out var cooldownTotalMs))
        {
            return cooldownTotalMs;
        }

        throw new InvalidOperationException($"Unknown skill id '{skillId}' for base cooldown resolution.");
    }

    private static int GetXpToNextLevel(int runLevel)
    {
        var clampedLevel = Math.Max(ArenaConfig.RunInitialLevel, runLevel);
        return ArenaConfig.RunLevelXpBase + ((clampedLevel - ArenaConfig.RunInitialLevel) * ArenaConfig.RunLevelXpIncrementPerLevel);
    }

    private static void ApplyDeterministicSkillUpgradeForRunLevel(StoredBattle state)
    {
        var upgradedSkillId = ResolveDeterministicUpgradeSkillId(state, state.RunLevel);
        if (upgradedSkillId is null || !state.Skills.TryGetValue(upgradedSkillId, out var upgradedSkill))
        {
            return;
        }

        upgradedSkill.Level = Math.Max(ArenaConfig.SkillInitialLevel, upgradedSkill.Level + 1);
        upgradedSkill.CooldownRemainingMs = Math.Min(
            upgradedSkill.CooldownRemainingMs,
            ResolveSkillCooldownTotalMs(state, upgradedSkill));
    }

    private static string? ResolveDeterministicUpgradeSkillId(StoredBattle state, int runLevel)
    {
        var upgradeOrder = ResolveRunLevelSkillUpgradeOrder(state);
        if (runLevel <= ArenaConfig.RunInitialLevel || upgradeOrder.Count == 0)
        {
            return null;
        }

        var upgradeIndex = (runLevel - ArenaConfig.RunInitialLevel - 1) % upgradeOrder.Count;
        return upgradeOrder[upgradeIndex];
    }

    private static int ResolveSkillBonusLevels(StoredSkill skill)
    {
        return Math.Max(0, skill.Level - ArenaConfig.SkillInitialLevel);
    }

    private static int ResolveSkillLevelCooldownReductionPercent(StoredSkill skill)
    {
        var reduction = ResolveSkillBonusLevels(skill) * ArenaConfig.SkillCooldownReductionPerLevelPercent;
        return Math.Clamp(reduction, 0, ArenaConfig.SkillCooldownReductionMaxPercent);
    }

    private static int ResolveSkillHealPercent(StoredSkill skill)
    {
        return ResolveSkillScaledPercent(ArenaConfig.HealPercentOfMaxHp, skill);
    }

    private static int ResolveSkillGuardPercent(StoredSkill skill)
    {
        return ResolveSkillScaledPercent(ArenaConfig.GuardPercentOfMaxHp, skill);
    }

    private static int ResolveSkillScaledPercent(int basePercent, StoredSkill skill)
    {
        return basePercent + (ResolveSkillBonusLevels(skill) * ArenaConfig.SkillDefensivePercentBonusPerLevel);
    }

    private static int ResolveSkillCooldownTotalMs(StoredBattle state, StoredSkill skill)
    {
        var leveledBaseCooldownMs = ApplyPercentReduction(
            skill.CooldownTotalMs,
            ResolveSkillLevelCooldownReductionPercent(skill));
        var cardReductionPercent = ResolveCardGlobalCooldownReductionPercent(state);
        return Math.Max(1, ApplyPercentReduction(leveledBaseCooldownMs, cardReductionPercent));
    }

    private static int ResolveCardGlobalCooldownReductionPercent(StoredBattle state)
    {
        return Math.Clamp(
            state.PlayerModifiers.GlobalCooldownReductionPercent,
            0,
            ArenaConfig.MaxGlobalCooldownReductionPercent);
    }
}
