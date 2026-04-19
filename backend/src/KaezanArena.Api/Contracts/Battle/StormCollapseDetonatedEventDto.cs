namespace KaezanArena.Api.Contracts.Battle;

public sealed record StormCollapseDetonatedEventDto(
    TilePos TargetPosition,
    IReadOnlyList<TilePos> AffectedTiles,
    int UltimateLevel,
    IReadOnlyList<StormCollapseDetonationMobDto> Hits) : BattleEventDto;
