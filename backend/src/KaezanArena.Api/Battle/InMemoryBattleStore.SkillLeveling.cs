namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private static readonly string[] InitialSkillOrder =
    [
        ExoriSkillId,
        ExoriMasSkillId,
        ExoriMinSkillId,
        HealSkillId,
        GuardSkillId,
        AvalancheSkillId
    ];

    private static readonly IReadOnlyDictionary<string, int> SkillBaseCooldownTotalMsById =
        new Dictionary<string, int>(StringComparer.Ordinal)
        {
            [ExoriSkillId] = ExoriCooldownTotalMs,
            [ExoriMasSkillId] = ExoriMasCooldownTotalMs,
            [ExoriMinSkillId] = ExoriMinCooldownTotalMs,
            [HealSkillId] = HealCooldownTotalMs,
            [GuardSkillId] = GuardCooldownTotalMs,
            [AvalancheSkillId] = AvalancheCooldownTotalMs
        };

    private static Dictionary<string, StoredSkill> BuildInitialSkills()
    {
        var skills = new Dictionary<string, StoredSkill>(StringComparer.Ordinal);
        foreach (var skillId in InitialSkillOrder)
        {
            skills[skillId] = new StoredSkill(
                skillId: skillId,
                cooldownRemainingMs: 0,
                cooldownTotalMs: ResolveBaseSkillCooldownTotalMs(skillId),
                level: SkillInitialLevel);
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
        var clampedLevel = Math.Max(RunInitialLevel, runLevel);
        return RunLevelXpBase + ((clampedLevel - RunInitialLevel) * RunLevelXpIncrementPerLevel);
    }

    private static void ApplyDeterministicSkillUpgradeForRunLevel(StoredBattle state)
    {
        var upgradedSkillId = ResolveDeterministicUpgradeSkillId(state.RunLevel);
        if (upgradedSkillId is null || !state.Skills.TryGetValue(upgradedSkillId, out var upgradedSkill))
        {
            return;
        }

        upgradedSkill.Level = Math.Max(SkillInitialLevel, upgradedSkill.Level + 1);
        upgradedSkill.CooldownRemainingMs = Math.Min(
            upgradedSkill.CooldownRemainingMs,
            ResolveSkillCooldownTotalMs(state, upgradedSkill));
    }

    private static string? ResolveDeterministicUpgradeSkillId(int runLevel)
    {
        if (runLevel <= RunInitialLevel || RunLevelSkillUpgradeOrder.Length == 0)
        {
            return null;
        }

        var upgradeIndex = (runLevel - RunInitialLevel - 1) % RunLevelSkillUpgradeOrder.Length;
        return RunLevelSkillUpgradeOrder[upgradeIndex];
    }

    private static int ResolveSkillBonusLevels(StoredSkill skill)
    {
        return Math.Max(0, skill.Level - SkillInitialLevel);
    }

    private static int ResolveSkillLevelCooldownReductionPercent(StoredSkill skill)
    {
        var reduction = ResolveSkillBonusLevels(skill) * SkillCooldownReductionPerLevelPercent;
        return Math.Clamp(reduction, 0, SkillCooldownReductionMaxPercent);
    }

    private static int ResolveSkillHealPercent(StoredSkill skill)
    {
        return ResolveSkillScaledPercent(HealPercentOfMaxHp, skill);
    }

    private static int ResolveSkillGuardPercent(StoredSkill skill)
    {
        return ResolveSkillScaledPercent(GuardPercentOfMaxHp, skill);
    }

    private static int ResolveSkillScaledPercent(int basePercent, StoredSkill skill)
    {
        return basePercent + (ResolveSkillBonusLevels(skill) * SkillDefensivePercentBonusPerLevel);
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
            MaxGlobalCooldownReductionPercent);
    }
}
