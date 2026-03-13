using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private const string ReplayActionTypeStep = "step";
    private const string ReplayActionTypeChooseCard = "choose_card";

    public bool TryExportReplay(string battleId, out BattleReplayDto replay)
    {
        replay = new BattleReplayDto(
            ArenaId: string.Empty,
            PlayerId: string.Empty,
            Seed: 0,
            Actions: []);
        if (string.IsNullOrWhiteSpace(battleId) || !_battles.TryGetValue(battleId.Trim(), out var state))
        {
            return false;
        }

        lock (state.Sync)
        {
            replay = new BattleReplayDto(
                ArenaId: state.ArenaId,
                PlayerId: state.PlayerActorId,
                Seed: state.Seed,
                Actions: CloneReplayActions(state.ReplayActions));
            return true;
        }
    }

    private static void AppendReplayStepAction(
        StoredBattle state,
        int? clientTick,
        IReadOnlyList<BattleCommandDto>? commands)
    {
        state.ReplayActions.Add(new BattleReplayActionDto(
            Type: ReplayActionTypeStep,
            ClientTick: clientTick,
            Commands: CloneReplayCommands(commands)));
    }

    private static void AppendReplayChooseCardAction(
        StoredBattle state,
        string choiceId,
        string selectedCardId)
    {
        state.ReplayActions.Add(new BattleReplayActionDto(
            Type: ReplayActionTypeChooseCard,
            ChoiceId: choiceId,
            SelectedCardId: selectedCardId));
    }

    private static IReadOnlyList<BattleReplayActionDto> CloneReplayActions(IReadOnlyList<BattleReplayActionDto> actions)
    {
        if (actions.Count == 0)
        {
            return [];
        }

        return actions
            .Select(CloneReplayAction)
            .ToList();
    }

    private static BattleReplayActionDto CloneReplayAction(BattleReplayActionDto action)
    {
        return new BattleReplayActionDto(
            Type: action.Type,
            ClientTick: action.ClientTick,
            Commands: CloneReplayCommands(action.Commands),
            ChoiceId: action.ChoiceId,
            SelectedCardId: action.SelectedCardId);
    }

    private static IReadOnlyList<BattleCommandDto>? CloneReplayCommands(IReadOnlyList<BattleCommandDto>? commands)
    {
        if (commands is null)
        {
            return null;
        }

        if (commands.Count == 0)
        {
            return [];
        }

        return commands
            .Select(CloneReplayCommand)
            .ToList();
    }

    private static BattleCommandDto CloneReplayCommand(BattleCommandDto command)
    {
        return new BattleCommandDto(
            Type: command.Type,
            SkillId: command.SkillId,
            Dir: command.Dir,
            TargetEntityId: command.TargetEntityId,
            Paused: command.Paused,
            GroundTileX: command.GroundTileX,
            GroundTileY: command.GroundTileY,
            PoiId: command.PoiId,
            AssistConfig: CloneReplayAssistConfig(command.AssistConfig));
    }

    private static AssistConfigDto? CloneReplayAssistConfig(AssistConfigDto? config)
    {
        if (config is null)
        {
            return null;
        }

        return new AssistConfigDto(
            Enabled: config.Enabled,
            AutoHealEnabled: config.AutoHealEnabled,
            HealAtHpPercent: config.HealAtHpPercent,
            AutoGuardEnabled: config.AutoGuardEnabled,
            GuardAtHpPercent: config.GuardAtHpPercent,
            AutoOffenseEnabled: config.AutoOffenseEnabled,
            OffenseMode: config.OffenseMode,
            AutoSkills: CloneReplayAutoSkills(config.AutoSkills),
            MaxAutoCastsPerTick: config.MaxAutoCastsPerTick);
    }

    private static IReadOnlyDictionary<string, bool>? CloneReplayAutoSkills(IReadOnlyDictionary<string, bool>? source)
    {
        if (source is null)
        {
            return null;
        }

        return new Dictionary<string, bool>(source, StringComparer.Ordinal);
    }
}
