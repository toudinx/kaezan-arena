namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleScalingDto(
    double NormalHpMult,
    double NormalDmgMult,
    double EliteHpMult,
    double EliteDmgMult,
    double LvlFactor,
    bool IsLvlFactorEnabled);
