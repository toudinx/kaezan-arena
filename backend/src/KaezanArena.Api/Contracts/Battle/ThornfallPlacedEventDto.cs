namespace KaezanArena.Api.Contracts.Battle;

public sealed record ThornfallPlacedEventDto(
    IReadOnlyList<TilePos> CrossTiles,
    int UltimateLevel) : BattleEventDto;
