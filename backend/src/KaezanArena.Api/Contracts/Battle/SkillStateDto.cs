namespace KaezanArena.Api.Contracts.Battle;

public sealed record SkillStateDto(
    string SkillId,
    string? DisplayName,
    int CooldownRemainingMs,
    int CooldownTotalMs);
