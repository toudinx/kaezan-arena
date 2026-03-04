namespace KaezanArena.Api.Contracts.Battle;

public sealed record EliteDiedEventDto(
    string EliteEntityId,
    MobArchetype MobType) : BattleEventDto;
