namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleDecalDto(
    string EntityId,
    DecalKind DecalKind,
    string EntityType,
    MobArchetype? MobType,
    int TileX,
    int TileY,
    string? SpriteKey,
    int RemainingMs,
    int TotalMs,
    int CreatedTick);
