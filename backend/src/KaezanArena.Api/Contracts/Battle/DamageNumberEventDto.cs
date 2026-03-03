namespace KaezanArena.Api.Contracts.Battle;

public sealed record DamageNumberEventDto(
    string? SourceEntityId,
    int? SourceTileX,
    int? SourceTileY,
    string? AttackerEntityId,
    int? AttackerTileX,
    int? AttackerTileY,
    string TargetEntityId,
    int TargetTileX,
    int TargetTileY,
    int DamageAmount,
    ElementType ElementType,
    bool IsKill,
    bool IsCrit,
    int HitId,
    int ShieldDamageAmount = 0,
    int HpDamageAmount = 0,
    string HitKind = BattleHitKinds.Normal) : BattleEventDto;
