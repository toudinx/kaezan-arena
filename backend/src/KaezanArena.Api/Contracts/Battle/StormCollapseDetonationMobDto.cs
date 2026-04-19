namespace KaezanArena.Api.Contracts.Battle;

public sealed record StormCollapseDetonationMobDto(
    string MobId,
    TilePos MobPosition,
    int StacksConsumed,
    int AoeDamage);
