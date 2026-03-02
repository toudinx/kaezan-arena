namespace KaezanArena.Api.Contracts.Battle;

public sealed record PoiInteractedEventDto(
    string PoiId,
    string PoiType,
    int TileX,
    int TileY) : BattleEventDto;

