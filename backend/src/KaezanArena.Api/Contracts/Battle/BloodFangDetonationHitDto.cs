namespace KaezanArena.Api.Contracts.Battle;

public sealed record BloodFangDetonationHitDto(
    string MobId,
    TilePos Position,
    int AoeDamage,
    int StacksConsumed,
    int StackDamage,
    bool WasExecuted,
    bool HadStacksBeforeConsumption);
