namespace KaezanArena.Api.Contracts.Battle;

public sealed record BossStateDto(
    string BossId,
    string DisplayName,
    int Hp,
    int MaxHp,
    int TileX,
    int TileY,
    string AttackElement);
