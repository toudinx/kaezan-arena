namespace KaezanArena.Api.Contracts.Battle;

public sealed record AttackFxEventDto(
    CombatFxKind FxKind,
    int FromTileX,
    int FromTileY,
    int ToTileX,
    int ToTileY,
    ElementType ElementType,
    int DurationMs,
    int CreatedAtTick,
    int EventId) : BattleEventDto;
