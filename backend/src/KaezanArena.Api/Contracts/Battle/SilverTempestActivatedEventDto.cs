namespace KaezanArena.Api.Contracts.Battle;

public sealed record SilverTempestActivatedEventDto(
    int DurationMs) : BattleEventDto;
