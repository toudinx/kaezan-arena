namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleCardOfferDto(
    string Id,
    string Name,
    string Description,
    IReadOnlyList<string> Tags,
    int RarityWeight,
    int MaxStacks,
    int CurrentStacks,
    BattleCardScalingParamsDto ScalingParams);
