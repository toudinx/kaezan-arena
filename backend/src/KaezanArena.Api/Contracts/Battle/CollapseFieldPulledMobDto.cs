namespace KaezanArena.Api.Contracts.Battle;

public sealed record CollapseFieldPulledMobDto(
    string MobId,
    TilePos FromPosition,
    TilePos ToPosition);
