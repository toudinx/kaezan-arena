namespace KaezanArena.Api.Contracts.Battle;

public sealed record EliteSpawnedEventDto(
    string EliteEntityId,
    MobArchetype MobType) : BattleEventDto;
