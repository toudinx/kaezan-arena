namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleCardScalingParamsDto(
    int BaseStackMultiplierPercent,
    int AdditionalStackMultiplierPercent);
