namespace KaezanArena.Api.Contracts.Battle;

public sealed record BossSpawnedEventDto(
    string BossId,
    string DisplayName,
    int TileX,
    int TileY) : BattleEventDto;
