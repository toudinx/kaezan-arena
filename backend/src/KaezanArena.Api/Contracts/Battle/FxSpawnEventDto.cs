namespace KaezanArena.Api.Contracts.Battle;

public sealed record FxSpawnEventDto(
    string FxId,
    int TileX,
    int TileY,
    string Layer,
    int DurationMs,
    ElementType Element) : BattleEventDto;
