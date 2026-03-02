namespace KaezanArena.Api.Contracts.Battle;

public sealed record ActorStateDto(
    string ActorId,
    string Kind,
    MobArchetype? MobType,
    int TileX,
    int TileY,
    int Hp,
    int MaxHp,
    int Shield,
    int MaxShield);
