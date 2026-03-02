namespace KaezanArena.Api.Contracts.Battle;

public sealed record DeathEventDto(
    string EntityId,
    string EntityType,
    MobArchetype? MobType,
    int TileX,
    int TileY,
    ElementType? ElementType,
    string? KillerEntityId,
    int TickIndex) : BattleEventDto;
