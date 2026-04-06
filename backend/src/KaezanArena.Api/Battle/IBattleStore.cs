using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public interface IBattleStore
{
    BattleSnapshot StartBattle(string arenaId, string playerId, int? seed, int zoneIndex = 1);

    BattleSnapshot StepBattle(string battleId, int? clientTick, IReadOnlyList<BattleCommandDto>? commands, int? stepCount = null);

    BattleSnapshot ChooseCard(string battleId, string choiceId, string selectedCardId);

    bool TryGetBattleSeed(string battleId, out int seed);

    bool TryExportReplay(string battleId, out BattleReplayDto replay);

    bool TryGetBattleElementalArenaDef(string battleId, out ArenaConfig.ElementalArenaConfig.ElementalArenaDef? def);
}
