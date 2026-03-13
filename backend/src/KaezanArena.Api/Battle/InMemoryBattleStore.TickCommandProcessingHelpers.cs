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

        var reason = string.Equals(state.BattleStatus, StatusDefeat, StringComparison.Ordinal)
            ? DefeatReason
            : NotStartedReason;

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
            if (!string.Equals(commandType, SetPausedCommandType, StringComparison.Ordinal))
            {
                continue;
            }

            if (!command.Paused.HasValue)
            {
                commandResults[index] = new CommandResultDto(index, commandType, false, UnknownCommandReason);
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
            commandResults.Add(new CommandResultDto(index, commandType, false, PausedReason));
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
            commandResults.Add(new CommandResultDto(index, commandType, false, AwaitingCardChoiceReason));
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

    private static IReadOnlyDictionary<int, CommandResultDto> ApplyMoveCommandsBeforeMobMovement(
        StoredBattle state,
        IReadOnlyList<BattleCommandDto>? commands,
        ref bool hasExplicitFacingCommand)
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
            if (!string.Equals(commandType, MovePlayerCommandType, StringComparison.Ordinal))
            {
                continue;
            }

            var moved = TryExecutePlayerMoveCommand(
                state,
                command.Dir,
                out var failReason,
                out var movementReason,
                out var blockedTileX,
                out var blockedTileY,
                out var blockedByActorId);
            if (moved)
            {
                hasExplicitFacingCommand = true;
            }

            commandResults[index] = new CommandResultDto(
                Index: index,
                Type: commandType,
                Ok: moved,
                Reason: failReason,
                Status: moved ? MoveStatusAccepted : MoveStatusBlocked,
                MovementReason: moved ? MoveReasonNone : movementReason,
                BlockedTileX: blockedTileX,
                BlockedTileY: blockedTileY,
                BlockedByActorId: blockedByActorId);
        }

        return commandResults;
    }

    private static bool TryExecutePlayerMoveCommand(
        StoredBattle state,
        string? rawDirection,
        out string? failReason,
        out string movementReason,
        out int? blockedTileX,
        out int? blockedTileY,
        out string? blockedByActorId)
    {
        failReason = null;
        movementReason = MoveReasonNone;
        blockedTileX = null;
        blockedTileY = null;
        blockedByActorId = null;
        var direction = NormalizeDirection(rawDirection);
        if (direction is null)
        {
            failReason = UnknownDirectionReason;
            return false;
        }

        if (state.PlayerMoveCooldownRemainingMs > 0)
        {
            failReason = CooldownReason;
            movementReason = MoveReasonCooldown;
            return false;
        }

        var player = GetPlayerActor(state);
        if (player is null)
        {
            failReason = NoTargetReason;
            return false;
        }

        if (!TryGetDirectionDelta(direction, out var deltaX, out var deltaY))
        {
            failReason = UnknownDirectionReason;
            return false;
        }

        var destinationX = player.TileX + deltaX;
        var destinationY = player.TileY + deltaY;
        if (TryGetPlayerMovementBlocker(
            state,
            player.ActorId,
            destinationX,
            destinationY,
            out movementReason,
            out blockedByActorId))
        {
            failReason = MoveBlockedReason;
            blockedTileX = destinationX;
            blockedTileY = destinationY;
            return false;
        }

        player.TileX = destinationX;
        player.TileY = destinationY;
        state.PlayerFacingDirection = direction;
        state.PlayerMoveCooldownRemainingMs = PlayerMoveCooldownMs;
        return true;
    }

    private static bool TryGetDirectionDelta(string direction, out int deltaX, out int deltaY)
    {
        deltaX = 0;
        deltaY = 0;
        switch (direction)
        {
            case FacingUp:
                deltaY = -1;
                return true;
            case FacingUpRight:
                deltaX = 1;
                deltaY = -1;
                return true;
            case FacingRight:
                deltaX = 1;
                return true;
            case FacingDownRight:
                deltaX = 1;
                deltaY = 1;
                return true;
            case FacingDown:
                deltaY = 1;
                return true;
            case FacingDownLeft:
                deltaX = -1;
                deltaY = 1;
                return true;
            case FacingLeft:
                deltaX = -1;
                return true;
            case FacingUpLeft:
                deltaX = -1;
                deltaY = -1;
                return true;
            default:
                return false;
        }
    }

    private static bool TryGetPlayerMovementBlocker(
        StoredBattle state,
        string playerActorId,
        int tileX,
        int tileY,
        out string movementReason,
        out string? blockedByActorId)
    {
        movementReason = MoveReasonNone;
        blockedByActorId = null;

        if (!IsInBounds(tileX, tileY))
        {
            movementReason = MoveReasonOutOfBounds;
            return true;
        }

        var blockingActor = state.Actors.Values.FirstOrDefault(actor =>
            !string.Equals(actor.ActorId, playerActorId, StringComparison.Ordinal) &&
            actor.TileX == tileX &&
            actor.TileY == tileY);
        if (blockingActor is null)
        {
            return false;
        }

        movementReason = MoveReasonOccupied;
        blockedByActorId = blockingActor.ActorId;
        return true;
    }
}
