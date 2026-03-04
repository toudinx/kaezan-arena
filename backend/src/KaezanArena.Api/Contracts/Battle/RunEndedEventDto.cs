namespace KaezanArena.Api.Contracts.Battle;

public sealed record RunEndedEventDto(
    string Reason,
    long TimestampMs) : BattleEventDto;
