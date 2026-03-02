namespace KaezanArena.Api.Contracts.Battle;

public sealed record ReflectEventDto(
    string SourceEntityId,
    int SourceTileX,
    int SourceTileY,
    string TargetEntityId,
    int TargetTileX,
    int TargetTileY,
    int Amount,
    ElementType ElementType,
    MobArchetype? TargetMobType) : BattleEventDto;
