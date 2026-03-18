namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleRangedConfigDto(
    int AutoAttackRangedMaxRange,
    float RangedProjectileSpeedTiles,
    int RangedDefaultCooldownMs,
    IReadOnlyDictionary<string, string> ProjectileColorByWeaponId);
