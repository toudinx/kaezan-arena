namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleStartResponseDto(
    string BattleId,
    int Tick,
    IReadOnlyList<ActorStateDto> Actors,
    IReadOnlyList<SkillStateDto> Skills,
    int GlobalCooldownRemainingMs,
    int GlobalCooldownTotalMs,
    int AltarCooldownRemainingMs,
    int Seed,
    string FacingDirection,
    string BattleStatus,
    string? EffectiveTargetEntityId,
    string? LockedTargetEntityId,
    BattleTilePosDto? GroundTargetPos,
    AssistConfigDto AssistConfig,
    ElementType PlayerBaseElement,
    ElementType? WeaponElement,
    IReadOnlyList<BattleDecalDto> Decals,
    IReadOnlyList<BattleBuffDto> ActiveBuffs,
    IReadOnlyList<BattlePoiDto> ActivePois);
