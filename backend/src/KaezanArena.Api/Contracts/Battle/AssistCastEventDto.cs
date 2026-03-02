namespace KaezanArena.Api.Contracts.Battle;

public sealed record AssistCastEventDto(
    string SkillId,
    string Reason) : BattleEventDto;
