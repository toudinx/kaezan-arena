namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleStepRequestDto(
    string BattleId,
    int? ClientTick,
    IReadOnlyList<BattleCommandDto>? Commands);
