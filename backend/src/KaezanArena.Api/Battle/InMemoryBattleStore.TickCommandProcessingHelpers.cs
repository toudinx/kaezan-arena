using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private static IReadOnlyList<CommandResultDto> BuildStatusRejectedCommandResults(
        StoredBattle state,
        IReadOnlyList<BattleCommandDto>? commands)
    {
        var commandResults = new List<CommandResultDto>();
        if (commands is null || commands.Count == 0)
        {
            return commandResults;
        }

        var reason = string.Equals(state.BattleStatus, ArenaConfig.StatusDefeat, StringComparison.Ordinal)
            ? ArenaConfig.DefeatReason
            : ArenaConfig.NotStartedReason;

        for (var index = 0; index < commands.Count; index += 1)
        {
            var command = commands[index];
            var commandType = NormalizeCommandType(command.Type);
            commandResults.Add(new CommandResultDto(index, commandType, false, reason));
        }

        return commandResults;
    }

    private static IReadOnlyDictionary<int, CommandResultDto> ApplyPauseCommands(
        StoredBattle state,
        IReadOnlyList<BattleCommandDto>? commands)
    {
        if (commands is null || commands.Count == 0)
        {
            return new Dictionary<int, CommandResultDto>();
        }

        var commandResults = new Dictionary<int, CommandResultDto>();
        for (var index = 0; index < commands.Count; index += 1)
        {
            var command = commands[index];
            var commandType = NormalizeCommandType(command.Type);
            if (!string.Equals(commandType, ArenaConfig.SetPausedCommandType, StringComparison.Ordinal))
            {
                continue;
            }

            if (!command.Paused.HasValue)
            {
                commandResults[index] = new CommandResultDto(index, commandType, false, ArenaConfig.UnknownCommandReason);
                continue;
            }

            state.IsPaused = command.Paused.Value;
            commandResults[index] = new CommandResultDto(index, commandType, true, null);
        }

        return commandResults;
    }

    private static IReadOnlyList<CommandResultDto> BuildPausedCommandResults(
        IReadOnlyList<BattleCommandDto>? commands,
        IReadOnlyDictionary<int, CommandResultDto> preAppliedPauseResults)
    {
        var commandResults = new List<CommandResultDto>();
        if (commands is null || commands.Count == 0)
        {
            return commandResults;
        }

        for (var index = 0; index < commands.Count; index += 1)
        {
            if (preAppliedPauseResults.TryGetValue(index, out var preAppliedResult))
            {
                commandResults.Add(preAppliedResult);
                continue;
            }

            var commandType = NormalizeCommandType(commands[index].Type);
            commandResults.Add(new CommandResultDto(index, commandType, false, ArenaConfig.PausedReason));
        }

        return commandResults;
    }

    private static IReadOnlyList<CommandResultDto> BuildAwaitingCardChoiceCommandResults(
        IReadOnlyList<BattleCommandDto>? commands,
        IReadOnlyDictionary<int, CommandResultDto> preAppliedPauseResults)
    {
        var commandResults = new List<CommandResultDto>();
        if (commands is null || commands.Count == 0)
        {
            return commandResults;
        }

        for (var index = 0; index < commands.Count; index += 1)
        {
            if (preAppliedPauseResults.TryGetValue(index, out var preAppliedResult))
            {
                commandResults.Add(preAppliedResult);
                continue;
            }

            var commandType = NormalizeCommandType(commands[index].Type);
            commandResults.Add(new CommandResultDto(index, commandType, false, ArenaConfig.AwaitingCardChoiceReason));
        }

        return commandResults;
    }

    private static IReadOnlyDictionary<int, CommandResultDto> MergePreAppliedCommandResults(
        IReadOnlyDictionary<int, CommandResultDto> left,
        IReadOnlyDictionary<int, CommandResultDto> right)
    {
        if (left.Count == 0)
        {
            return right;
        }

        if (right.Count == 0)
        {
            return left;
        }

        var merged = new Dictionary<int, CommandResultDto>(left.Count + right.Count);
        foreach (var entry in left)
        {
            merged[entry.Key] = entry.Value;
        }

        foreach (var entry in right)
        {
            merged[entry.Key] = entry.Value;
        }

        return merged;
    }

    private static IReadOnlyList<CommandResultDto> BuildOrderedCommandResults(
        IReadOnlyDictionary<int, CommandResultDto> commandResults)
    {
        if (commandResults.Count == 0)
        {
            return [];
        }

        return commandResults.Values
            .OrderBy(result => result.Index)
            .ToList();
    }

}
