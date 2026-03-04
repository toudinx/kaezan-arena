namespace KaezanArena.Api.Contracts.Battle;

public sealed record LevelUpEventDto(
    int PreviousLevel,
    int NewLevel,
    int RunXp,
    int XpToNextLevel) : BattleEventDto;
