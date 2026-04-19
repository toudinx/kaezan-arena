namespace KaezanArena.Api.Contracts.Battle;

public sealed record WindBreakActivatedEventDto(
    int DurationMs) : BattleEventDto;
