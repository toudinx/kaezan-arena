namespace KaezanArena.Api.Contracts.Battle;

public sealed record CritTextEventDto(
    string Text,
    int TileX,
    int TileY,
    long StartAtMs,
    int DurationMs) : BattleEventDto;
