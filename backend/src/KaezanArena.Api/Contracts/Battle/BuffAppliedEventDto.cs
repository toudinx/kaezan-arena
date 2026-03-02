namespace KaezanArena.Api.Contracts.Battle;

public sealed record BuffAppliedEventDto(
    string BuffId,
    int DurationMs) : BattleEventDto;
