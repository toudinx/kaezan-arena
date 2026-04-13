namespace KaezanArena.Api.Contracts.Battle;

public sealed record SunderBrandUpdatedEventDto(
    string MobId,
    int StackCount) : BattleEventDto;
