namespace KaezanArena.Api.Contracts.Battle;

public sealed record BleedingMarkUpdatedEventDto(
    string MobId,
    int StackCount) : BattleEventDto;

