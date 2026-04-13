namespace KaezanArena.Api.Contracts.Battle;

public sealed record HeadshotEventDto(
    string MobId,
    int DamageDealt) : BattleEventDto;
