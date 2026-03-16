namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleStepRequestDto(
    string BattleId,
    int? ClientTick,
    int? StepCount = null,
    IReadOnlyList<BattleCommandDto>? Commands = null);
