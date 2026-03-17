namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    // Fixed 3-slot offensive kit. Heal and Guard are preserved as implementations
    // but are no longer seeded at run start — they return as free-slot runes in a future step.
    private static readonly string[] InitialSkillOrder =
    [
        ArenaConfig.ExoriMinSkillId,
        ArenaConfig.ExoriSkillId,
        ArenaConfig.ExoriMasSkillId
    ];

    private static readonly IReadOnlyDictionary<string, int> SkillBaseCooldownTotalMsById =
        new Dictionary<string, int>(StringComparer.Ordinal)
        {
            [ArenaConfig.ExoriSkillId] = ArenaConfig.ExoriCooldownTotalMs,
            [ArenaConfig.ExoriMasSkillId] = ArenaConfig.ExoriMasCooldownTotalMs,
            [ArenaConfig.ExoriMinSkillId] = ArenaConfig.ExoriMinCooldownTotalMs,
            [ArenaConfig.HealSkillId] = ArenaConfig.HealCooldownTotalMs,
            [ArenaConfig.GuardSkillId] = ArenaConfig.GuardCooldownTotalMs,
            [ArenaConfig.AvalancheSkillId] = ArenaConfig.AvalancheCooldownTotalMs
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
        var upgradedSkillId = ResolveDeterministicUpgradeSkillId(state.RunLevel);
        if (upgradedSkillId is null || !state.Skills.TryGetValue(upgradedSkillId, out var upgradedSkill))
        {
            return;
        }

        upgradedSkill.Level = Math.Max(ArenaConfig.SkillInitialLevel, upgradedSkill.Level + 1);
        upgradedSkill.CooldownRemainingMs = Math.Min(
            upgradedSkill.CooldownRemainingMs,
            ResolveSkillCooldownTotalMs(state, upgradedSkill));
    }

    private static string? ResolveDeterministicUpgradeSkillId(int runLevel)
    {
        if (runLevel <= ArenaConfig.RunInitialLevel || RunLevelSkillUpgradeOrder.Length == 0)
        {
            return null;
        }

        var upgradeIndex = (runLevel - ArenaConfig.RunInitialLevel - 1) % RunLevelSkillUpgradeOrder.Length;
        return RunLevelSkillUpgradeOrder[upgradeIndex];
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
