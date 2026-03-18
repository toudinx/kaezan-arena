namespace KaezanArena.Api.Contracts.Battle;

public sealed record RangedProjectileFiredEventDto(
    string WeaponId,
    TilePos FromTile,
    TilePos ToTile,
    string? TargetActorId,
    bool Pierces) : BattleEventDto;
