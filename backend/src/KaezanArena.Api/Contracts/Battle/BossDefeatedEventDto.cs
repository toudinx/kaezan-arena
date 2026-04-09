namespace KaezanArena.Api.Contracts.Battle;

public sealed record BossDefeatedEventDto(
    string BossId,
    string DisplayName) : BattleEventDto;
