namespace KaezanArena.Api.Contracts.Battle;

public sealed record InteractFailedEventDto(
    string? PoiId,
    string Reason) : BattleEventDto;

