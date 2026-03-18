namespace KaezanArena.Api.Contracts.Battle;

public sealed record MobKnockedBackEventDto(
    string ActorId,
    TilePos FromTile,
    TilePos ToTile) : BattleEventDto;
