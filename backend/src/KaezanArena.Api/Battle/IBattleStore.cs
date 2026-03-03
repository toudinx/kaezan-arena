using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public interface IBattleStore
{
    BattleSnapshot StartBattle(string arenaId, string playerId, int? seed);

    BattleSnapshot StepBattle(string battleId, int? clientTick, IReadOnlyList<BattleCommandDto>? commands);

    bool TryGetBattleSeed(string battleId, out int seed);
}
