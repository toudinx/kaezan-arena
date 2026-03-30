namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleSpawnPacingDto(
    int MaxAliveMobs,
    int EliteSpawnChancePercent);
