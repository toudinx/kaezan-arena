namespace KaezanArena.Api.Contracts.Battle;

public sealed record StormCollapseDetonatedEventDto(
    IReadOnlyList<StormCollapseDetonationMobDto> Mobs) : BattleEventDto;
