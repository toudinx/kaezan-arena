using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed record BattleSnapshot(
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
    bool IsGameOver,
    string? EndReason,
    string? EffectiveTargetEntityId,
    string? LockedTargetEntityId,
    BattleTilePosDto? GroundTargetPos,
    AssistConfigDto AssistConfig,
    ElementType PlayerBaseElement,
    ElementType? WeaponElement,
    IReadOnlyList<BattleDecalDto> Decals,
    IReadOnlyList<BattleBuffDto> ActiveBuffs,
    IReadOnlyList<BestiaryEntryDto> Bestiary,
    string? PendingSpeciesChest,
    IReadOnlyList<BattlePoiDto> ActivePois,
    IReadOnlyList<BattleEventDto> Events,
    IReadOnlyList<CommandResultDto> CommandResults);
