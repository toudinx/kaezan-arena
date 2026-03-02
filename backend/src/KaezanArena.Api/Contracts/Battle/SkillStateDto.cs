namespace KaezanArena.Api.Contracts.Battle;

public sealed record SkillStateDto(
    string SkillId,
    int CooldownRemainingMs,
    int CooldownTotalMs);
