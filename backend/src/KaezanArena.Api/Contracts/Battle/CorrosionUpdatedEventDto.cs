namespace KaezanArena.Api.Contracts.Battle;

public sealed record CorrosionUpdatedEventDto(
    string MobId,
    int StackCount) : BattleEventDto;
