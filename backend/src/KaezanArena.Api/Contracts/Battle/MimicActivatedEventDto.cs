namespace KaezanArena.Api.Contracts.Battle;

public sealed record MimicActivatedEventDto(
    string PoiId,
    string ActorId,
    int TileX,
    int TileY) : BattleEventDto;
