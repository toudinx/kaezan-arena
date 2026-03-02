namespace KaezanArena.Api.Contracts.Battle;

public sealed record AssistConfigDto(
    bool? Enabled = null,
    bool? AutoHealEnabled = null,
    int? HealAtHpPercent = null,
    bool? AutoGuardEnabled = null,
    int? GuardAtHpPercent = null,
    bool? AutoOffenseEnabled = null,
    string? OffenseMode = null,
    IReadOnlyDictionary<string, bool>? AutoSkills = null,
    int? MaxAutoCastsPerTick = null);
