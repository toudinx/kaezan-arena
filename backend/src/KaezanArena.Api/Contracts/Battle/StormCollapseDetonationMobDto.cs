namespace KaezanArena.Api.Contracts.Battle;

public sealed record StormCollapseDetonationMobDto(
    string MobId,
    int CorrosionStacksBeforeDetonation,
    int DamageDealt);
