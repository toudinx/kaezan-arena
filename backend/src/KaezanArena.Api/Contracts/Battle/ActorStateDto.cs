namespace KaezanArena.Api.Contracts.Battle;

public sealed record ActorStateDto(
    string ActorId,
    string Kind,
    MobArchetype? MobType,
    int? MobTierIndex,
    bool IsElite,
    bool IsBuffedByElite,
    string? BuffSourceEliteId,
    int TileX,
    int TileY,
    int Hp,
    int MaxHp,
    int Shield,
    int MaxShield,
    string? AttackElement = null,
    string? WeakTo = null,
    string? ResistantTo = null);
