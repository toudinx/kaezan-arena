namespace KaezanArena.Api.Contracts.Battle;

public sealed record FocusResetEventDto(
    string MobId) : BattleEventDto;
